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

import {
  DeepSeekDeadlineError,
  DeepSeekPartialError,
  translateItems,
  type DeepSeekTranslationOptions,
  type TranslationItem,
} from "./deepseek";
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
import { planTranslationWork, type TranslationWorkCandidate } from "./work-planner";

const translationLocales: TranslationLocale[] = ["en", "ja"];

type TriggerSource = "cron" | "admin";
type TranslationTable =
  | "post_translations"
  | "diary_translations"
  | "category_translations"
  | "tag_translations";
type TranslationIdColumn =
  | "post_id"
  | "diary_id"
  | "category_id"
  | "tag_id";

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
  post_id?: string;
  diary_id?: string;
};

type ExistingNameTranslation = {
  locale: TranslationLocale;
  name: string;
  source_hash: string;
  status: string;
  retry_count: number;
  category_id?: string;
  tag_id?: string;
};

type WorkResult = {
  reused: number;
  translated: number;
  changed: boolean;
};

type WorkItem = {
  table: TranslationTable;
  idColumn: TranslationIdColumn;
  id: string;
  locale: TranslationLocale;
  retryCount: number;
  run: (context: WorkContext) => Promise<WorkResult>;
};

type WorkContext = {
  deadline: number;
  onRateLimit: () => void;
};

export interface TranslationSyncResult {
  run: TranslationRun | null;
  alreadyRunning: boolean;
  changed: boolean;
  remainingCount: number;
  madeProgress: boolean;
  canContinue: boolean;
  rateLimited: boolean;
}

export class TranslationDeadlineError extends Error {
  constructor(readonly translatedCount = 0) {
    super("Translation run reached its safe deadline");
    this.name = "TranslationDeadlineError";
  }
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

function translationKey(id: string, locale: TranslationLocale): string {
  return `${id}:${locale}`;
}

function ensureBatchTime(deadline: number, translatedCount: number) {
  // A DeepSeek request may take up to 45 seconds. Keep a margin for retries,
  // checkpoint writes, and the final Vercel response.
  if (Date.now() >= deadline - 55_000) {
    throw new TranslationDeadlineError(translatedCount);
  }
}

async function translateInBatches(
  locale: TranslationLocale,
  items: TranslationItem[],
  context: WorkContext,
  onBatch?: (translated: ReadonlyMap<string, string>) => Promise<void>
): Promise<Map<string, string>> {
  const maxCharacters = Math.max(
    2_000,
    Number(process.env.TRANSLATION_BATCH_CHARACTERS || 6_000)
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
  let translatedCount = 0;
  const deepSeekOptions: DeepSeekTranslationOptions = {
    onRateLimit: context.onRateLimit,
    deadline: context.deadline,
  };
  for (const batch of batches) {
    ensureBatchTime(context.deadline, translatedCount);
    let translated: Map<string, string>;
    try {
      translated = await translateItems(locale, batch, deepSeekOptions);
    } catch (error) {
      if (error instanceof DeepSeekDeadlineError) {
        throw new TranslationDeadlineError(translatedCount);
      }
      if (error instanceof DeepSeekPartialError) {
        error.translated.forEach((value, id) => result.set(id, value));
        translatedCount += error.translated.size;
        if (onBatch && error.translated.size) await onBatch(error.translated);
      }
      throw error;
    }
    translated.forEach((value, id) => result.set(id, value));
    translatedCount += translated.size;
    if (onBatch) await onBatch(translated);
  }
  return result;
}

async function recordFailure(item: WorkItem, error: unknown) {
  const supabase = createAdminSupabase();
  const message = (error instanceof Error ? error.message : String(error)).slice(
    0,
    1_000
  );
  const { error: writeError } = await supabase.from(item.table).upsert(
    {
      [item.idColumn]: item.id,
      locale: item.locale,
      status: "failed",
      retry_count: item.retryCount + 1,
      last_error: message,
    },
    { onConflict: `${item.idColumn},locale` }
  );
  if (writeError) throw writeError;
}

async function translatePost(
  post: Post,
  locale: TranslationLocale,
  existing: ExistingContentTranslation | null,
  context: WorkContext
): Promise<WorkResult> {
  const supabase = createAdminSupabase();
  const sourceHash = sourceHashForPost(post);
  const titleHash = contentHash(post.title);
  const excerptHash = contentHash(post.excerpt);
  const blocks = splitMarkdown(post.content);
  const translations = reusableTranslations(
    blocks,
    validStoredBlocks(existing?.translated_blocks)
  );
  let title = existing?.source_title_hash === titleHash ? existing.title : "";
  let excerpt =
    post.excerpt && existing?.source_excerpt_hash === excerptHash
      ? existing.excerpt ?? ""
      : "";

  const checkpoint = async () => {
    const { error } = await supabase.from("post_translations").upsert(
      {
        post_id: post.id,
        locale,
        title,
        excerpt,
        content: existing?.content ?? "",
        source_hash: sourceHash,
        source_title_hash: titleHash,
        source_excerpt_hash: excerptHash,
        source_blocks: blocks,
        translated_blocks: storedBlocks(blocks, translations),
        status: "processing",
        retry_count: existing?.retry_count ?? 0,
        last_error: null,
      },
      { onConflict: "post_id,locale" }
    );
    if (error) throw error;
  };

  await checkpoint();
  const items: TranslationItem[] = [];
  if (!title) items.push({ id: "title", text: post.title });
  if (post.excerpt && !excerpt) {
    items.push({ id: "excerpt", text: post.excerpt });
  }
  for (const block of blocks) {
    if (block.translatable && !translations.has(block.id)) {
      items.push({ id: `block:${block.id}`, text: block.source.trimEnd() });
    }
  }

  const applyBatch = async (batch: ReadonlyMap<string, string>) => {
    title = batch.get("title") ?? title;
    excerpt = batch.get("excerpt") ?? excerpt;
    for (const block of blocks) {
      const value = batch.get(`block:${block.id}`);
      if (value !== undefined) translations.set(block.id, value);
    }
    await checkpoint();
  };
  await translateInBatches(locale, items, context, applyBatch);

  if (!title) throw new Error("Post title translation is empty");
  const content = rebuildMarkdown(blocks, translations);
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
      translated_blocks: storedBlocks(blocks, translations),
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
      (block) => block.translatable && !items.some((item) => item.id === `block:${block.id}`)
    ).length,
    translated: items.length,
    changed: true,
  };
}

async function translateDiary(
  diary: Diary,
  locale: TranslationLocale,
  existing: ExistingContentTranslation | null,
  context: WorkContext
): Promise<WorkResult> {
  const supabase = createAdminSupabase();
  const sourceHash = sourceHashForDiary(diary);
  const titleHash = contentHash(diary.title);
  const blocks = splitMarkdown(diary.content);
  const translations = reusableTranslations(
    blocks,
    validStoredBlocks(existing?.translated_blocks)
  );
  let title = existing?.source_title_hash === titleHash ? existing.title : "";

  const checkpoint = async () => {
    const { error } = await supabase.from("diary_translations").upsert(
      {
        diary_id: diary.id,
        locale,
        title,
        content: existing?.content ?? "",
        source_hash: sourceHash,
        source_title_hash: titleHash,
        source_blocks: blocks,
        translated_blocks: storedBlocks(blocks, translations),
        status: "processing",
        retry_count: existing?.retry_count ?? 0,
        last_error: null,
      },
      { onConflict: "diary_id,locale" }
    );
    if (error) throw error;
  };

  await checkpoint();
  const items: TranslationItem[] = [];
  if (!title) items.push({ id: "title", text: diary.title });
  for (const block of blocks) {
    if (block.translatable && !translations.has(block.id)) {
      items.push({ id: `block:${block.id}`, text: block.source.trimEnd() });
    }
  }

  const applyBatch = async (batch: ReadonlyMap<string, string>) => {
    title = batch.get("title") ?? title;
    for (const block of blocks) {
      const value = batch.get(`block:${block.id}`);
      if (value !== undefined) translations.set(block.id, value);
    }
    await checkpoint();
  };
  await translateInBatches(locale, items, context, applyBatch);

  if (!title) throw new Error("Diary title translation is empty");
  const content = rebuildMarkdown(blocks, translations);
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
      (block) => block.translatable && !items.some((item) => item.id === `block:${block.id}`)
    ).length,
    translated: items.length,
    changed: true,
  };
}

async function translateName(
  table: "category_translations" | "tag_translations",
  idColumn: "category_id" | "tag_id",
  value: Category | Tag,
  locale: TranslationLocale,
  existing: ExistingNameTranslation | null,
  context: WorkContext
): Promise<WorkResult> {
  const supabase = createAdminSupabase();
  const sourceHash = sourceHashForName(value.name);
  const { error: checkpointError } = await supabase.from(table).upsert(
    {
      [idColumn]: value.id,
      locale,
      source_hash: sourceHash,
      status: "processing",
      retry_count: existing?.retry_count ?? 0,
      last_error: null,
    },
    { onConflict: `${idColumn},locale` }
  );
  if (checkpointError) throw checkpointError;

  const translated = await translateInBatches(
    locale,
    [{ id: "name", text: value.name }],
    context
  );
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

function clampConcurrency(value: number): number {
  if (!Number.isFinite(value)) return 2;
  return Math.min(4, Math.max(1, Math.floor(value)));
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
    return {
      run: null,
      alreadyRunning: true,
      changed: false,
      remainingCount: 0,
      madeProgress: false,
      canContinue: false,
      rateLimited: false,
    };
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
  let rateLimited = false;
  const errors: string[] = [];

  try {
    const [
      postsResult,
      diariesResult,
      categoriesResult,
      tagsResult,
      postTranslationsResult,
      diaryTranslationsResult,
      categoryTranslationsResult,
      tagTranslationsResult,
    ] = await Promise.all([
      supabase.from("posts").select("*").eq("status", "published"),
      supabase.from("diaries").select("*"),
      supabase.from("categories").select("*"),
      supabase.from("tags").select("*"),
      supabase.from("post_translations").select("*"),
      supabase.from("diary_translations").select("*"),
      supabase.from("category_translations").select("*"),
      supabase.from("tag_translations").select("*"),
    ]);
    const sourceError =
      postsResult.error ||
      diariesResult.error ||
      categoriesResult.error ||
      tagsResult.error ||
      postTranslationsResult.error ||
      diaryTranslationsResult.error ||
      categoryTranslationsResult.error ||
      tagTranslationsResult.error;
    if (sourceError) throw sourceError;

    const postTranslations = new Map(
      ((postTranslationsResult.data ?? []) as ExistingContentTranslation[]).map(
        (row) => [translationKey(row.post_id!, row.locale), row]
      )
    );
    const diaryTranslations = new Map(
      ((diaryTranslationsResult.data ?? []) as ExistingContentTranslation[]).map(
        (row) => [translationKey(row.diary_id!, row.locale), row]
      )
    );
    const categoryTranslations = new Map(
      ((categoryTranslationsResult.data ?? []) as ExistingNameTranslation[]).map(
        (row) => [translationKey(row.category_id!, row.locale), row]
      )
    );
    const tagTranslations = new Map(
      ((tagTranslationsResult.data ?? []) as ExistingNameTranslation[]).map(
        (row) => [translationKey(row.tag_id!, row.locale), row]
      )
    );

    const candidates: TranslationWorkCandidate<WorkItem>[] = [];
    const addWork = (item: WorkItem, isCurrent: boolean, status?: string) => {
      candidates.push({ work: item, isCurrent, status });
    };

    for (const post of (postsResult.data ?? []) as Post[]) {
      for (const locale of translationLocales) {
        const existing = postTranslations.get(translationKey(post.id, locale)) ?? null;
        const sourceHash = sourceHashForPost(post);
        addWork(
          {
            table: "post_translations",
            idColumn: "post_id",
            id: post.id,
            locale,
            retryCount: existing?.retry_count ?? 0,
            run: (context) => translatePost(post, locale, existing, context),
          },
          existing?.status === "complete" && existing.source_hash === sourceHash,
          existing?.status
        );
      }
    }
    for (const diary of (diariesResult.data ?? []) as Diary[]) {
      for (const locale of translationLocales) {
        const existing = diaryTranslations.get(translationKey(diary.id, locale)) ?? null;
        const sourceHash = sourceHashForDiary(diary);
        addWork(
          {
            table: "diary_translations",
            idColumn: "diary_id",
            id: diary.id,
            locale,
            retryCount: existing?.retry_count ?? 0,
            run: (context) => translateDiary(diary, locale, existing, context),
          },
          existing?.status === "complete" && existing.source_hash === sourceHash,
          existing?.status
        );
      }
    }
    for (const category of (categoriesResult.data ?? []) as Category[]) {
      for (const locale of translationLocales) {
        const existing =
          categoryTranslations.get(translationKey(category.id, locale)) ?? null;
        const sourceHash = sourceHashForName(category.name);
        addWork(
          {
            table: "category_translations",
            idColumn: "category_id",
            id: category.id,
            locale,
            retryCount: existing?.retry_count ?? 0,
            run: (context) =>
              translateName(
                "category_translations",
                "category_id",
                category,
                locale,
                existing,
                context
              ),
          },
          existing?.status === "complete" && existing.source_hash === sourceHash,
          existing?.status
        );
      }
    }
    for (const tag of (tagsResult.data ?? []) as Tag[]) {
      for (const locale of translationLocales) {
        const existing = tagTranslations.get(translationKey(tag.id, locale)) ?? null;
        const sourceHash = sourceHashForName(tag.name);
        addWork(
          {
            table: "tag_translations",
            idColumn: "tag_id",
            id: tag.id,
            locale,
            retryCount: existing?.retry_count ?? 0,
            run: (context) =>
              translateName(
                "tag_translations",
                "tag_id",
                tag,
                locale,
                existing,
                context
              ),
          },
          existing?.status === "complete" && existing.source_hash === sourceHash,
          existing?.status
        );
      }
    }

    const plan = planTranslationWork(candidates);
    const work = plan.work;
    scannedCount = plan.scannedCount;
    reusedCount = plan.reusedCount;
    const maxItems = Math.max(1, Number(process.env.TRANSLATION_MAX_ITEMS || 40));
    const maxRuntimeMs = Math.max(
      30_000,
      Number(process.env.TRANSLATION_MAX_RUNTIME_MS || 240_000)
    );
    const deadline = Date.now() + maxRuntimeMs;
    let concurrency =
      triggerSource === "admin"
        ? clampConcurrency(Number(process.env.TRANSLATION_CONCURRENCY || 2))
        : 1;
    let cursor = 0;
    let completedWork = 0;
    let deadlineWork = 0;

    const onRateLimit = () => {
      rateLimited = true;
      concurrency = 1;
    };

    while (cursor < work.length) {
      if (changedItemCount >= maxItems || Date.now() >= deadline - 55_000) {
        partial = true;
        break;
      }
      const available = Math.max(1, maxItems - changedItemCount);
      const wave = work.slice(cursor, cursor + Math.min(concurrency, available));
      const results = await Promise.allSettled(
        wave.map((item) => item.run({ deadline, onRateLimit }))
      );
      cursor += wave.length;

      for (let index = 0; index < results.length; index += 1) {
        const result = results[index];
        const item = wave[index];
        if (result.status === "fulfilled") {
          reusedCount += result.value.reused;
          translatedCount += result.value.translated;
          changed ||= result.value.changed;
          if (result.value.changed) changedItemCount += 1;
          completedWork += 1;
          continue;
        }
        if (result.reason instanceof TranslationDeadlineError) {
          translatedCount += result.reason.translatedCount;
          if (result.reason.translatedCount > 0) changed = true;
          deadlineWork += 1;
          partial = true;
          continue;
        }

        failedCount += 1;
        await recordFailure(item, result.reason);
        errors.push(
          `${item.table}:${item.id}:${item.locale} ${(result.reason instanceof Error
            ? result.reason.message
            : String(result.reason)
          ).slice(0, 200)}`
        );
      }
    }

    const unattemptedCount = Math.max(0, work.length - cursor);
    const remainingCount = Math.max(0, work.length - completedWork);
    partial ||= remainingCount > 0 || failedCount > 0;
    const madeProgress = completedWork > 0 || translatedCount > 0;
    const hasNonFailedRemaining = unattemptedCount > 0 || deadlineWork > 0;
    const canContinue = partial && madeProgress && hasNonFailedRemaining;
    const status = partial ? "partial" : "complete";
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
      remainingCount,
      madeProgress,
      canContinue,
      rateLimited,
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
