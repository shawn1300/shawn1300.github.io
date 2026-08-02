import assert from "node:assert/strict";
import test from "node:test";

import { contentHash } from "../lib/i18n/hash";
import {
  rebuildMarkdown,
  reusableTranslations,
  splitMarkdown,
  type StoredTranslatedBlock,
} from "../lib/i18n/markdown-blocks";
import { translateItems } from "../lib/i18n/deepseek";

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
