import { NextResponse } from "next/server";

import { createAdminSupabase, createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const authClient = await createServerSupabase();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { success: false, code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const supabase = createAdminSupabase();

  const [
    runs,
    postSources,
    diarySources,
    categorySources,
    tagSources,
    posts,
    diaries,
    categories,
    tags,
  ] = await Promise.all([
    supabase
      .from("translation_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(20),
    supabase.from("posts").select("id, title").eq("status", "published"),
    supabase.from("diaries").select("id, title"),
    supabase.from("categories").select("id, name"),
    supabase.from("tags").select("id, name"),
    supabase
      .from("post_translations")
      .select("status, locale, post_id, retry_count, last_error, updated_at"),
    supabase
      .from("diary_translations")
      .select("status, locale, diary_id, retry_count, last_error, updated_at"),
    supabase
      .from("category_translations")
      .select("status, locale, category_id, retry_count, last_error, updated_at"),
    supabase
      .from("tag_translations")
      .select("status, locale, tag_id, retry_count, last_error, updated_at"),
  ]);
  const error =
    runs.error ||
    postSources.error ||
    diarySources.error ||
    categorySources.error ||
    tagSources.error ||
    posts.error ||
    diaries.error ||
    categories.error ||
    tags.error;
  if (error) {
    console.error("Translation status query failed:", error);
    return NextResponse.json(
      { success: false, code: "TRANSLATION_STATUS_FAILED" },
      { status: 500 }
    );
  }

  type StatusRow = {
    status: string;
    locale: "en" | "ja";
    retry_count: number;
    last_error: string | null;
    updated_at: string;
    post_id?: string;
    diary_id?: string;
    category_id?: string;
    tag_id?: string;
  };
  const locales = ["en", "ja"] as const;
  const indexRows = (values: StatusRow[], idColumn: keyof StatusRow) =>
    new Map(values.map((row) => [`${String(row[idColumn])}:${row.locale}`, row]));
  const postRows = indexRows((posts.data ?? []) as StatusRow[], "post_id");
  const diaryRows = indexRows((diaries.data ?? []) as StatusRow[], "diary_id");
  const categoryRows = indexRows(
    (categories.data ?? []) as StatusRow[],
    "category_id"
  );
  const tagRows = indexRows((tags.data ?? []) as StatusRow[], "tag_id");

  const rows: Array<{
    type: "post" | "diary" | "category" | "tag";
    sourceId: string;
    sourceName: string;
    locale: "en" | "ja";
    status: string;
    retryCount: number;
    lastError: string | null;
    updatedAt: string | null;
  }> = [];
  const appendRows = (
    type: "post" | "diary" | "category" | "tag",
    sources: Array<{ id: string; title?: string; name?: string }>,
    translations: Map<string, StatusRow>
  ) => {
    for (const source of sources) {
      for (const locale of locales) {
        const translation = translations.get(`${source.id}:${locale}`);
        rows.push({
          type,
          sourceId: source.id,
          sourceName: source.title ?? source.name ?? source.id,
          locale,
          status: translation?.status ?? "pending",
          retryCount: translation?.retry_count ?? 0,
          lastError: translation?.last_error ?? null,
          updatedAt: translation?.updated_at ?? null,
        });
      }
    }
  };
  appendRows("post", postSources.data ?? [], postRows);
  appendRows("diary", diarySources.data ?? [], diaryRows);
  appendRows("category", categorySources.data ?? [], categoryRows);
  appendRows("tag", tagSources.data ?? [], tagRows);

  const counts = rows.reduce<Record<string, number>>((result, row) => {
    const key = `${row.locale}:${row.status}`;
    result[key] = (result[key] ?? 0) + 1;
    return result;
  }, {});

  return NextResponse.json({
    success: true,
    data: {
      model: process.env.DEEPSEEK_TRANSLATION_MODEL || "",
      counts,
      items: rows,
      runs: runs.data ?? [],
    },
  });
}
