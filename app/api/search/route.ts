import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * 生成关键词上下文摘要
 * 在原文中截取关键词前后各 ~40 个字符的片段
 */
function getSnippet(text: string, keyword: string, contextLen = 40): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const lowerText = trimmed.toLowerCase();
  const lowerKw = keyword.trim().toLowerCase();
  const idx = lowerText.indexOf(lowerKw);
  if (idx === -1) {
    // 关键词没在正文中出现（可能在标题或摘要匹配），返回正文开头
    return trimmed.length > contextLen * 2 ? trimmed.slice(0, contextLen * 2) + "…" : trimmed;
  }

  const start = Math.max(0, idx - contextLen);
  const end = Math.min(trimmed.length, idx + keyword.length + contextLen);
  let snippet = trimmed.slice(start, end);
  // 尽量不从词中截断
  if (start > 0) snippet = "…" + snippet;
  if (end < trimmed.length) snippet = snippet + "…";
  return snippet;
}

/**
 * GET /api/search?q=keyword
 * 搜索文章和日记的标题与正文，返回含关键词上下文的摘要
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();

  if (!q) {
    return NextResponse.json({ posts: [], diaries: [] });
  }

  const supabase = await createServerSupabase();
  // 移除会破坏 PostgREST or() 过滤语法的字符，并转义 LIKE 通配符
  const sanitized = q.replace(/[,()"\\]/g, " ").replace(/[%_]/g, "\\$&").trim();
  if (!sanitized) {
    return NextResponse.json({ posts: [], diaries: [] });
  }
  const pattern = `%${sanitized}%`;

  // 并行查询文章和日记（需返回 content 用于生成摘要）
  const [postsRes, diariesRes] = await Promise.all([
    supabase
      .from("posts")
      .select("id, title, slug, excerpt, content, published_at, created_at")
      .eq("status", "published")
      .or(`title.ilike.${pattern},content.ilike.${pattern},excerpt.ilike.${pattern}`)
      .order("published_at", { ascending: false })
      .limit(5),
    supabase
      .from("diaries")
      .select("id, title, slug, content, created_at")
      .or(`title.ilike.${pattern},content.ilike.${pattern}`)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (postsRes.error) console.error("Search posts error:", postsRes.error);
  if (diariesRes.error) console.error("Search diaries error:", diariesRes.error);

  // 为每篇文章生成摘要（优先 excerpt，否则从 content 中截取）
  const posts = (postsRes.data || []).map((p) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    published_at: p.published_at,
    created_at: p.created_at,
    snippet: p.excerpt ? getSnippet(p.excerpt, q) : getSnippet(p.content || "", q),
  }));

  // 为每篇日记生成摘要
  const diaries = (diariesRes.data || []).map((d) => ({
    id: d.id,
    title: d.title,
    slug: d.slug,
    created_at: d.created_at,
    snippet: getSnippet(d.content || "", q),
  }));

  return NextResponse.json({ posts, diaries });
}
