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
  // URL 中的中文 slug 可能未被 Next.js 自动解码，手动兜底
  let decodedSlug = slug;
  try {
    decodedSlug = decodeURIComponent(slug);
  } catch {
    // 已解码或无百分号编码，用原始值
  }
  const { data } = await supabase
    .from("diaries")
    .select("*")
    .eq("slug", decodedSlug)
    .single();
  return (data as Diary) || null;
}

/** 获取全部日记（用于归档列表） */
export async function getAllDiaries(): Promise<Diary[]> {
  return getDiaries({ limit: 1000 });
}
