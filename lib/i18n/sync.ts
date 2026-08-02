import "server-only";

import { createAdminSupabase } from "@/lib/supabase/server";
import type {
  Category,
  Diary,
  Post,
  Tag,
  TranslationLocale,
  TranslationRun,
} from "@/types";

import { translateItems, type TranslationItem } from "./deepseek";
import {
  contentHash,
  sourceHashForDiary,
  sourceHashForName,
  sourceHashForPost,
} from "./hash";
import {
  rebuildMarkdown,
  reusableTranslations,
  splitMarkdown,
  type MarkdownBlock,
  type StoredTranslatedBlock,
} from "./markdown-blocks";

const translationLocales: TranslationLocale[] = ["en", "ja"];

type TriggerSource = "cron" | "admin";
type TranslationTable =
  | "post_translations"
  | "diary_translations"
  | "category_translations"
  | "tag_translations";

type ExistingContentTranslation = {
  locale: TranslationLocale;
  title: string;
  excerpt?: string;
  content: string;
  source_hash: string;
  source_title_hash: string;
  source_excerpt_hash?: string;
  translated_blocks: unknown;
  status: string;
  retry_count: number;
};

type ExistingNameTranslation = {
  locale: TranslationLocale;
  name: string;
  source_hash: string;
  status: string;
  retry_count: number;
};

export interface TranslationSyncResult {
  run: TranslationRun | null;
  alreadyRunning: boolean;
  changed: boolean;
}

function validStoredBlocks(value: unknown): StoredTranslatedBlock[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is StoredTranslatedBlock =>
      Boolean(entry) &&
      typeof entry === "object" &&
      typeof (entry as StoredTranslatedBlock).id === "string" &&
      typeof (entry as StoredTranslatedBlock).hash === "string" &&
      typeof (entry as StoredTranslatedBlock).source === "string" &&
      typeof (entry as StoredTranslatedBlock).translation === "string" &&
      typeof (entry as StoredTranslatedBlock).translatable === "boolean"
  );
}

async function translateInBatches(
  locale: TranslationLocale,
  items: TranslationItem[]
): Promise<Map<string, string>> {
  const maxCharacters = Math.max(
    2_000,
    Number(process.env.TRANSLATION_BATCH_CHARACTERS || 12_000)
  );
  const batches: TranslationItem[][] = [];
  let current: TranslationItem[] = [];
  let currentCharacters = 0;

  for (const item of items) {
    if (current.length && currentCharacters + item.text.length > maxCharacters) {
      batches.push(current);
      current = [];
      currentCharacters = 0;
    }
    current.push(item);
    currentCharacters += item.text.length;
  }
  if (current.length) batches.push(current);

  const result = new Map<string, string>();
  for (const batch of batches) {
    const translated = await translateItems(locale, batch);
    translated.forEach((value, id) => result.set(id, value));
  }
  return result;
}

function storedBlocks(
  blocks: MarkdownBlock[],
  translations: ReadonlyMap<string, string>
): StoredTranslatedBlock[] {
  return blocks.map((block) => ({
    ...block,
    translation: block.translatable
      ? translations.get(block.id) ?? ""
      : block.source,
  }));
}

async function getExistingContent(
  table: "post_translations" | "diary_translations",
  idColumn: "post_id" | "diary_id",
  id: string,
  locale: TranslationLocale
): Promise<ExistingContentTranslation | null> {
  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from(table)
    .select("*")
    .eq(idColumn, id)
    .eq("locale", locale)
    .maybeSingle();
  return (data as ExistingContentTranslation | null) ?? null;
}

async function recordFailure(
  table: TranslationTable,
  idColumn: "post_id" | "diary_id" | "category_id" | "tag_id",
  id: string,
  locale: TranslationLocale,
  retryCount: number,
  error: unknown
) {
  const supabase = createAdminSupabase();
  const message = (error instanceof Error ? error.message : String(error)).slice(
    0,
    1_000
  );
  await supabase.from(table).upsert(
    {
      [idColumn]: id,
      locale,
      status: "failed",
      retry_count: retryCount + 1,
      last_error: message,
    },
    { onConflict: `${idColumn},locale` }
  );
}

async function translatePost(
  post: Post,
  locale: TranslationLocale
): Promise<{ reused: number; translated: number; changed: boolean }> {
  const supabase = createAdminSupabase();
  const existing = await getExistingContent(
    "post_translations",
    "post_id",
    post.id,
    locale
  );
  const sourceHash = sourceHashForPost(post);
  if (existing?.status === "complete" && existing.source_hash === sourceHash) {
    return { reused: 1, translated: 0, changed: false };
  }

  const titleHash = contentHash(post.title);
  const excerptHash = contentHash(post.excerpt);
  const blocks = splitMarkdown(post.content);
  const translations = reusableTranslations(
    blocks,
    validStoredBlocks(existing?.translated_blocks)
  );
  const items: TranslationItem[] = [];

  if (!existing?.title || existing.source_title_hash !== titleHash) {
    items.push({ id: "title", text: post.title });
  }
  if (
    post.excerpt &&
    (!existing?.excerpt || existing.source_excerpt_hash !== excerptHash)
  ) {
    items.push({ id: "excerpt", text: post.excerpt });
  }
  for (const block of blocks) {
    if (block.translatable && !translations.has(block.id)) {
      items.push({ id: `block:${block.id}`, text: block.source.trimEnd() });
    }
  }

  const newTranslations = await translateInBatches(locale, items);
  for (const block of blocks) {
    const value = newTranslations.get(`block:${block.id}`);
    if (value !== undefined) translations.set(block.id, value);
  }

  const title = newTranslations.get("title") ?? existing?.title ?? "";
  const excerpt = post.excerpt
    ? newTranslations.get("excerpt") ?? existing?.excerpt ?? ""
    : "";
  const content = rebuildMarkdown(blocks, translations);
  const translatedBlocks = storedBlocks(blocks, translations);
  if (!title) throw new Error("Post title translation is empty");

  const { error } = await supabase.from("post_translations").upsert(
    {
      post_id: post.id,
      locale,
      title,
      excerpt,
      content,
      source_hash: sourceHash,
      source_title_hash: titleHash,
      source_excerpt_hash: excerptHash,
      source_blocks: blocks,
      translated_blocks: translatedBlocks,
      status: "complete",
      retry_count: 0,
      last_error: null,
      translated_at: new Date().toISOString(),
    },
    { onConflict: "post_id,locale" }
  );
  if (error) throw error;

  return {
    reused: blocks.filter(
      (block) => block.translatable && !newTranslations.has(`block:${block.id}`)
    ).length,
    translated: items.length,
    changed: true,
  };
}

async function translateDiary(
  diary: Diary,
  locale: TranslationLocale
): Promise<{ reused: number; translated: number; changed: boolean }> {
  const supabase = createAdminSupabase();
  const existing = await getExistingContent(
    "diary_translations",
    "diary_id",
    diary.id,
    locale
  );
  const sourceHash = sourceHashForDiary(diary);
  if (existing?.status === "complete" && existing.source_hash === sourceHash) {
    return { reused: 1, translated: 0, changed: false };
  }

  const titleHash = contentHash(diary.title);
  const blocks = splitMarkdown(diary.content);
  const translations = reusableTranslations(
    blocks,
    validStoredBlocks(existing?.translated_blocks)
  );
  const items: TranslationItem[] = [];
  if (!existing?.title || existing.source_title_hash !== titleHash) {
    items.push({ id: "title", text: diary.title });
  }
  for (const block of blocks) {
    if (block.translatable && !translations.has(block.id)) {
      items.push({ id: `block:${block.id}`, text: block.source.trimEnd() });
    }
  }

  const newTranslations = await translateInBatches(locale, items);
  for (const block of blocks) {
    const value = newTranslations.get(`block:${block.id}`);
    if (value !== undefined) translations.set(block.id, value);
  }
  const title = newTranslations.get("title") ?? existing?.title ?? "";
  const content = rebuildMarkdown(blocks, translations);
  if (!title) throw new Error("Diary title translation is empty");

  const { error } = await supabase.from("diary_translations").upsert(
    {
      diary_id: diary.id,
      locale,
      title,
      content,
      source_hash: sourceHash,
      source_title_hash: titleHash,
      source_blocks: blocks,
      translated_blocks: storedBlocks(blocks, translations),
      status: "complete",
      retry_count: 0,
      last_error: null,
      translated_at: new Date().toISOString(),
    },
    { onConflict: "diary_id,locale" }
  );
  if (error) throw error;
  return {
    reused: blocks.filter(
      (block) => block.translatable && !newTranslations.has(`block:${block.id}`)
    ).length,
    translated: items.length,
    changed: true,
  };
}

async function translateName(
  table: "category_translations" | "tag_translations",
  idColumn: "category_id" | "tag_id",
  value: Category | Tag,
  locale: TranslationLocale
): Promise<{ reused: number; translated: number; changed: boolean }> {
  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from(table)
    .select("*")
    .eq(idColumn, value.id)
    .eq("locale", locale)
    .maybeSingle();
  const existing = data as ExistingNameTranslation | null;
  const sourceHash = sourceHashForName(value.name);
  if (existing?.status === "complete" && existing.source_hash === sourceHash) {
    return { reused: 1, translated: 0, changed: false };
  }

  const translated = await translateInBatches(locale, [
    { id: "name", text: value.name },
  ]);
  const name = translated.get("name");
  if (!name) throw new Error("Name translation is empty");
  const { error } = await supabase.from(table).upsert(
    {
      [idColumn]: value.id,
      locale,
      name,
      source_hash: sourceHash,
      status: "complete",
      retry_count: 0,
      last_error: null,
      translated_at: new Date().toISOString(),
    },
    { onConflict: `${idColumn},locale` }
  );
  if (error) throw error;
  return { reused: 0, translated: 1, changed: true };
}

type WorkItem = {
  table: TranslationTable;
  idColumn: "post_id" | "diary_id" | "category_id" | "tag_id";
  id: string;
  locale: TranslationLocale;
  run: () => Promise<{ reused: number; translated: number; changed: boolean }>;
  retryCount: () => Promise<number>;
};

async function currentRetryCount(item: Omit<WorkItem, "retryCount">): Promise<number> {
  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from(item.table)
    .select("retry_count")
    .eq(item.idColumn, item.id)
    .eq("locale", item.locale)
    .maybeSingle();
  return Number(data?.retry_count ?? 0);
}

export async function runTranslationSync(
  triggerSource: TriggerSource
): Promise<TranslationSyncResult> {
  const supabase = createAdminSupabase();
  const modelId = process.env.DEEPSEEK_TRANSLATION_MODEL || "";
  const { data: runData, error: runError } = await supabase
    .from("translation_runs")
    .insert({ trigger_source: triggerSource, status: "running", model_id: modelId })
    .select("*")
    .single();

  if (runError?.code === "23505") {
    return { run: null, alreadyRunning: true, changed: false };
  }
  if (runError || !runData) throw runError ?? new Error("Unable to create run");

  const runId = runData.id as string;
  let scannedCount = 0;
  let reusedCount = 0;
  let translatedCount = 0;
  let failedCount = 0;
  let changedItemCount = 0;
  let changed = false;
  let partial = false;
  const errors: string[] = [];

  try {
    const [postsResult, diariesResult, categoriesResult, tagsResult] =
      await Promise.all([
        supabase.from("posts").select("*").eq("status", "published"),
        supabase.from("diaries").select("*"),
        supabase.from("categories").select("*"),
        supabase.from("tags").select("*"),
      ]);
    const sourceError =
      postsResult.error ||
      diariesResult.error ||
      categoriesResult.error ||
      tagsResult.error;
    if (sourceError) throw sourceError;

    const work: WorkItem[] = [];
    const addWork = (item: Omit<WorkItem, "retryCount">) => {
      work.push({
        ...item,
        retryCount: () => currentRetryCount(item),
      });
    };

    for (const locale of translationLocales) {
      for (const post of (postsResult.data ?? []) as Post[]) {
        addWork({
          table: "post_translations",
          idColumn: "post_id",
          id: post.id,
          locale,
          run: () => translatePost(post, locale),
        });
      }
      for (const diary of (diariesResult.data ?? []) as Diary[]) {
        addWork({
          table: "diary_translations",
          idColumn: "diary_id",
          id: diary.id,
          locale,
          run: () => translateDiary(diary, locale),
        });
      }
      for (const category of (categoriesResult.data ?? []) as Category[]) {
        addWork({
          table: "category_translations",
          idColumn: "category_id",
          id: category.id,
          locale,
          run: () =>
            translateName(
              "category_translations",
              "category_id",
              category,
              locale
            ),
        });
      }
      for (const tag of (tagsResult.data ?? []) as Tag[]) {
        addWork({
          table: "tag_translations",
          idColumn: "tag_id",
          id: tag.id,
          locale,
          run: () =>
            translateName("tag_translations", "tag_id", tag, locale),
        });
      }
    }

    const maxItems = Math.max(1, Number(process.env.TRANSLATION_MAX_ITEMS || 40));
    const maxRuntimeMs = Math.max(
      30_000,
      Number(process.env.TRANSLATION_MAX_RUNTIME_MS || 240_000)
    );
    const deadline = Date.now() + maxRuntimeMs;

    for (const item of work) {
      if (changedItemCount >= maxItems || Date.now() >= deadline) {
        partial = true;
        break;
      }
      scannedCount += 1;
      try {
        const result = await item.run();
        reusedCount += result.reused;
        translatedCount += result.translated;
        changed ||= result.changed;
        if (result.changed) changedItemCount += 1;
      } catch (error) {
        failedCount += 1;
        const retryCount = await item.retryCount();
        await recordFailure(
          item.table,
          item.idColumn,
          item.id,
          item.locale,
          retryCount,
          error
        );
        errors.push(
          `${item.table}:${item.id}:${item.locale} ${(error instanceof Error
            ? error.message
            : String(error)
          ).slice(0, 200)}`
        );
      }
    }

    const status = partial || failedCount > 0 ? "partial" : "complete";
    const { data: completedRun, error: updateError } = await supabase
      .from("translation_runs")
      .update({
        status,
        scanned_count: scannedCount,
        reused_count: reusedCount,
        translated_count: translatedCount,
        failed_count: failedCount,
        error_summary: errors.length ? errors.join("\n").slice(0, 4_000) : null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId)
      .select("*")
      .single();
    if (updateError) throw updateError;

    return {
      run: completedRun as unknown as TranslationRun,
      alreadyRunning: false,
      changed,
    };
  } catch (error) {
    await supabase
      .from("translation_runs")
      .update({
        status: "failed",
        scanned_count: scannedCount,
        reused_count: reusedCount,
        translated_count: translatedCount,
        failed_count: failedCount + 1,
        error_summary: (error instanceof Error ? error.message : String(error)).slice(
          0,
          4_000
        ),
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    throw error;
  }
}
