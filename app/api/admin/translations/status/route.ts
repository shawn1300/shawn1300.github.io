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

  const [runs, posts, diaries, categories, tags] = await Promise.all([
    supabase
      .from("translation_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(20),
    supabase.from("post_translations").select("status, locale, post_id"),
    supabase.from("diary_translations").select("status, locale, diary_id"),
    supabase
      .from("category_translations")
      .select("status, locale, category_id"),
    supabase.from("tag_translations").select("status, locale, tag_id"),
  ]);
  const error =
    runs.error || posts.error || diaries.error || categories.error || tags.error;
  if (error) {
    console.error("Translation status query failed:", error);
    return NextResponse.json(
      { success: false, code: "TRANSLATION_STATUS_FAILED" },
      { status: 500 }
    );
  }

  const rows = [
    ...(posts.data ?? []).map((row) => ({ ...row, type: "post" })),
    ...(diaries.data ?? []).map((row) => ({ ...row, type: "diary" })),
    ...(categories.data ?? []).map((row) => ({ ...row, type: "category" })),
    ...(tags.data ?? []).map((row) => ({ ...row, type: "tag" })),
  ];
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
