import assert from "node:assert/strict";
import test from "node:test";

import { contentHash } from "../lib/i18n/hash";
import {
  rebuildMarkdown,
  reusableTranslations,
  splitMarkdown,
  type StoredTranslatedBlock,
} from "../lib/i18n/markdown-blocks";
import { DeepSeekPartialError, translateItems } from "../lib/i18n/deepseek";
import { planTranslationWork } from "../lib/i18n/work-planner";

test("content hashes are stable and sensitive to source changes", () => {
  assert.equal(contentHash("相同内容"), contentHash("相同内容"));
  assert.notEqual(contentHash("内容 A"), contentHash("内容 B"));
});

test("Markdown splitting preserves every source character", () => {
  const source = "第一段。\n\n```ts\nconst value = 1;\n```\n\n第二段。\n";
  const blocks = splitMarkdown(source);
  assert.equal(blocks.map((block) => block.source).join(""), source);
  assert.equal(blocks.find((block) => block.kind === "code")?.translatable, false);
});

test("unchanged blocks reuse translations after blocks move", () => {
  const previousSource = "第一段。\n\n第二段。\n";
  const previousBlocks = splitMarkdown(previousSource);
  const previous = previousBlocks.map((block) => ({
    ...block,
    translation: block.translatable
      ? block.source.includes("第一")
        ? "First paragraph."
        : "Second paragraph."
      : block.source,
  })) satisfies StoredTranslatedBlock[];

  const nextBlocks = splitMarkdown("第二段。\n\n新增段落。\n\n第一段。\n");
  const reused = reusableTranslations(nextBlocks, previous);
  const first = nextBlocks.find((block) => block.source.includes("第一"));
  const second = nextBlocks.find((block) => block.source.includes("第二"));
  assert.equal(first && reused.get(first.id), "First paragraph.");
  assert.equal(second && reused.get(second.id), "Second paragraph.");
});

test("rebuilding keeps protected code and exact trailing whitespace", () => {
  const source = "正文。\n\n```sh\necho ok\n```\n";
  const blocks = splitMarkdown(source);
  const translated = new Map<string, string>();
  for (const block of blocks) {
    if (block.translatable) translated.set(block.id, "Body.");
  }
  const rebuilt = rebuildMarkdown(blocks, translated);
  assert.equal(rebuilt, "Body.\n\n```sh\necho ok\n```\n");
});

test("translation planner skips current rows and moves failures behind pending work", () => {
  const plan = planTranslationWork([
    { work: "post-en", isCurrent: true, status: "complete" },
    { work: "post-ja", isCurrent: false },
    { work: "diary-en", isCurrent: false, status: "failed" },
    { work: "diary-ja", isCurrent: false, status: "pending" },
  ]);
  assert.equal(plan.scannedCount, 4);
  assert.equal(plan.reusedCount, 1);
  assert.deepEqual(plan.work, ["post-ja", "diary-ja", "diary-en"]);
});

test("DeepSeek adapter restores protected Markdown tokens", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  const originalModel = process.env.DEEPSEEK_TRANSLATION_MODEL;
  process.env.DEEPSEEK_API_KEY = "test-key";
  process.env.DEEPSEEK_TRANSLATION_MODEL = "test-model";

  globalThis.fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body));
    const userPayload = JSON.parse(request.messages[1].content);
    const translations = userPayload.items.map((item: { id: string; text: string }) => ({
      id: item.id,
      text: item.text.replace("请看", "See").replace("和链接", "and link"),
    }));
    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify({ translations }) } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const result = await translateItems("en", [
      { id: "body", text: "请看 `const x = 1` 和链接 [site](https://example.com/docs)" },
    ]);
    assert.equal(
      result.get("body"),
      "See `const x = 1` and link [site](https://example.com/docs)"
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.DEEPSEEK_TRANSLATION_MODEL;
    else process.env.DEEPSEEK_TRANSLATION_MODEL = originalModel;
  }
});

test("DeepSeek adapter keeps valid items and retries only a duplicated id", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  const originalModel = process.env.DEEPSEEK_TRANSLATION_MODEL;
  process.env.DEEPSEEK_API_KEY = "test-key";
  process.env.DEEPSEEK_TRANSLATION_MODEL = "test-model";
  const requestIds: string[][] = [];

  globalThis.fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body));
    const userPayload = JSON.parse(request.messages[1].content) as {
      items: Array<{ id: string; text: string }>;
    };
    requestIds.push(userPayload.items.map((item) => item.id));
    const translations =
      requestIds.length === 1
        ? [
            { id: "a", text: "duplicate one" },
            { id: "a", text: "duplicate two" },
            { id: "b", text: "valid b" },
          ]
        : [{ id: "a", text: "recovered a" }];
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ translations }) } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const result = await translateItems("en", [
      { id: "a", text: "甲" },
      { id: "b", text: "乙" },
    ]);
    assert.deepEqual(requestIds, [["a", "b"], ["a"]]);
    assert.equal(result.get("a"), "recovered a");
    assert.equal(result.get("b"), "valid b");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.DEEPSEEK_TRANSLATION_MODEL;
    else process.env.DEEPSEEK_TRANSLATION_MODEL = originalModel;
  }
});

test("DeepSeek adapter carries valid results when one duplicated id still fails", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  const originalModel = process.env.DEEPSEEK_TRANSLATION_MODEL;
  process.env.DEEPSEEK_API_KEY = "test-key";
  process.env.DEEPSEEK_TRANSLATION_MODEL = "test-model";

  globalThis.fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body));
    const userPayload = JSON.parse(request.messages[1].content) as {
      items: Array<{ id: string; text: string }>;
    };
    const translations = userPayload.items.flatMap((item) =>
      item.id === "a"
        ? [
            { id: "a", text: "duplicate one" },
            { id: "a", text: "duplicate two" },
          ]
        : [{ id: item.id, text: "valid b" }]
    );
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ translations }) } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    await assert.rejects(
      () =>
        translateItems("en", [
          { id: "a", text: "甲" },
          { id: "b", text: "乙" },
        ]),
      (error) => {
        assert.equal(error instanceof DeepSeekPartialError, true);
        assert.equal((error as DeepSeekPartialError).translated.get("b"), "valid b");
        assert.equal((error as DeepSeekPartialError).translated.has("a"), false);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.DEEPSEEK_TRANSLATION_MODEL;
    else process.env.DEEPSEEK_TRANSLATION_MODEL = originalModel;
  }
});

test("DeepSeek adapter reports rate limiting and recovers with retry", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  const originalModel = process.env.DEEPSEEK_TRANSLATION_MODEL;
  process.env.DEEPSEEK_API_KEY = "test-key";
  process.env.DEEPSEEK_TRANSLATION_MODEL = "test-model";
  let calls = 0;
  let rateLimited = false;

  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) return new Response("rate limited", { status: 429 });
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                translations: [{ id: "name", text: "Name" }],
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const result = await translateItems(
      "en",
      [{ id: "name", text: "名称" }],
      { onRateLimit: () => (rateLimited = true) }
    );
    assert.equal(calls, 2);
    assert.equal(rateLimited, true);
    assert.equal(result.get("name"), "Name");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.DEEPSEEK_TRANSLATION_MODEL;
    else process.env.DEEPSEEK_TRANSLATION_MODEL = originalModel;
  }
});
