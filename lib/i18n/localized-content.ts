import type { Locale } from "@/i18n/routing";
import { createStaticSupabase } from "@/lib/supabase/static";
import type { Category, Diary, Post, Tag, TranslationLocale } from "@/types";

import {
  sourceHashForDiary,
  sourceHashForName,
  sourceHashForPost,
} from "./hash";

type PostTranslationRow = {
  post_id: string;
  locale: TranslationLocale;
  title: string;
  excerpt: string;
  content: string;
  source_hash: string;
};

type DiaryTranslationRow = {
  diary_id: string;
  locale: TranslationLocale;
  title: string;
  content: string;
  source_hash: string;
};

type NameTranslationRow = {
  locale: TranslationLocale;
  name: string;
  source_hash: string;
  category_id?: string;
  tag_id?: string;
};

function translationLocale(locale: Locale): TranslationLocale | null {
  return locale === "en" || locale === "ja" ? locale : null;
}

async function translatedNames(
  table: "category_translations" | "tag_translations",
  idColumn: "category_id" | "tag_id",
  values: Array<Category | Tag>,
  locale: TranslationLocale
): Promise<Map<string, NameTranslationRow>> {
  if (!values.length) return new Map();
  const supabase = createStaticSupabase();
  const { data } = await supabase
    .from(table)
    .select(`${idColumn}, locale, name, source_hash`)
    .eq("locale", locale)
    .eq("status", "complete")
    .in(idColumn, values.map((value) => value.id));

  return new Map(
    ((data ?? []) as unknown as NameTranslationRow[]).map((row) => [
      String(row[idColumn]),
      row,
    ])
  );
}

function applyNameTranslation<T extends Category | Tag>(
  value: T,
  row: NameTranslationRow | undefined
): T {
  if (!row || row.source_hash !== sourceHashForName(value.name)) return value;
  return { ...value, name: row.name };
}

export async function localizePosts(posts: Post[], locale: Locale): Promise<Post[]> {
  const target = translationLocale(locale);
  if (!target || !posts.length) {
    return posts.map((post) => ({ ...post, source_locale: "zh-CN" }));
  }

  const supabase = createStaticSupabase();
  const postIds = posts.map((post) => post.id);
  const categories = posts
    .map((post) => post.category)
    .filter((value): value is Category => Boolean(value));
  const tags = posts.flatMap((post) => post.tags ?? []);

  const [postResult, categoryRows, tagRows] = await Promise.all([
    supabase
      .from("post_translations")
      .select("post_id, locale, title, excerpt, content, source_hash")
      .eq("locale", target)
      .eq("status", "complete")
      .in("post_id", postIds),
    translatedNames("category_translations", "category_id", categories, target),
    translatedNames("tag_translations", "tag_id", tags, target),
  ]);

  const translations = new Map(
    ((postResult.data ?? []) as unknown as PostTranslationRow[]).map((row) => [
      row.post_id,
      row,
    ])
  );

  return posts.map((post) => {
    const translation = translations.get(post.id);
    const isCurrent =
      translation?.source_hash === sourceHashForPost(post) &&
      Boolean(translation.title);
    const category = post.category
      ? applyNameTranslation(post.category, categoryRows.get(post.category.id))
      : post.category;
    const localizedTags = post.tags?.map((tag) =>
      applyNameTranslation(tag, tagRows.get(tag.id))
    );

    if (!isCurrent || !translation) {
      return {
        ...post,
        category,
        tags: localizedTags,
        translation_pending: true,
        source_locale: "zh-CN",
      };
    }

    return {
      ...post,
      title: translation.title,
      excerpt: translation.excerpt,
      content: translation.content,
      category,
      tags: localizedTags,
      translation_pending: false,
      source_locale: target,
    };
  });
}

export async function localizeDiaries(
  diaries: Diary[],
  locale: Locale
): Promise<Diary[]> {
  const target = translationLocale(locale);
  if (!target || !diaries.length) {
    return diaries.map((diary) => ({ ...diary, source_locale: "zh-CN" }));
  }

  const supabase = createStaticSupabase();
  const { data } = await supabase
    .from("diary_translations")
    .select("diary_id, locale, title, content, source_hash")
    .eq("locale", target)
    .eq("status", "complete")
    .in("diary_id", diaries.map((diary) => diary.id));
  const translations = new Map(
    ((data ?? []) as unknown as DiaryTranslationRow[]).map((row) => [
      row.diary_id,
      row,
    ])
  );

  return diaries.map((diary) => {
    const translation = translations.get(diary.id);
    if (!translation || translation.source_hash !== sourceHashForDiary(diary)) {
      return {
        ...diary,
        translation_pending: true,
        source_locale: "zh-CN",
      };
    }
    return {
      ...diary,
      title: translation.title,
      content: translation.content,
      translation_pending: false,
      source_locale: target,
    };
  });
}

export async function localizeCategories<T extends Category>(
  categories: T[],
  locale: Locale
): Promise<T[]> {
  const target = translationLocale(locale);
  if (!target || !categories.length) return categories;
  const rows = await translatedNames(
    "category_translations",
    "category_id",
    categories,
    target
  );
  return categories.map((category) =>
    applyNameTranslation(category, rows.get(category.id))
  );
}

export async function localizeTags(tags: Tag[], locale: Locale): Promise<Tag[]> {
  const target = translationLocale(locale);
  if (!target || !tags.length) return tags;
  const rows = await translatedNames("tag_translations", "tag_id", tags, target);
  return tags.map((tag) => applyNameTranslation(tag, rows.get(tag.id)));
}
