import { createServerSupabase } from "@/lib/supabase/server";
import type { Diary } from "@/types";

/** 获取所有日记，按创建时间倒序 */
export async function getDiaries(options?: {
  limit?: number;
  offset?: number;
}): Promise<Diary[]> {
  const supabase = await createServerSupabase();
  const { limit = 100, offset = 0 } = options || {};
  const { data } = await supabase
    .from("diaries")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  return (data || []) as Diary[];
}

/** 根据 slug 获取单篇日记 */
export async function getDiaryBySlug(slug: string): Promise<Diary | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("diaries")
    .select("*")
    .eq("slug", slug)
    .single();
  return (data as Diary) || null;
}

/** 获取全部日记（用于归档列表） */
export async function getAllDiaries(): Promise<Diary[]> {
  return getDiaries({ limit: 1000 });
}
