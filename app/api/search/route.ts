import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isLocale, type Locale } from "@/i18n/routing";

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
  const requestedLocale = request.nextUrl.searchParams.get("locale");
  const locale: Locale = isLocale(requestedLocale) ? requestedLocale : "zh-CN";

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

  // 中文原文始终参与查询，作为缺失译文时的回退结果。
  const [postsRes, diariesRes] = await Promise.all([
    supabase
      .from("posts")
      .select("id, title, slug, excerpt, content, published_at, created_at")
      .eq("status", "published")
      .or(`title.ilike.${pattern},content.ilike.${pattern},excerpt.ilike.${pattern}`)
      .order("published_at", { ascending: false, nullsFirst: true })
      .order("created_at", { ascending: false })
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

  let translatedPosts: Array<Record<string, unknown>> = [];
  let translatedDiaries: Array<Record<string, unknown>> = [];

  if (locale === "en" || locale === "ja") {
    const [translatedPostsRes, translatedDiariesRes] = await Promise.all([
      supabase
        .from("post_translations")
        .select("post_id, title, excerpt, content, posts!inner(id, slug, published_at, created_at, status)")
        .eq("locale", locale)
        .eq("status", "complete")
        .eq("posts.status", "published")
        .or(`title.ilike.${pattern},content.ilike.${pattern},excerpt.ilike.${pattern}`)
        .limit(5),
      supabase
        .from("diary_translations")
        .select("diary_id, title, content, diaries!inner(id, slug, created_at)")
        .eq("locale", locale)
        .eq("status", "complete")
        .or(`title.ilike.${pattern},content.ilike.${pattern}`)
        .limit(5),
    ]);

    if (translatedPostsRes.error) console.error("Search translated posts error:", translatedPostsRes.error);
    if (translatedDiariesRes.error) console.error("Search translated diaries error:", translatedDiariesRes.error);
    translatedPosts = (translatedPostsRes.data ?? []) as unknown as Array<Record<string, unknown>>;
    translatedDiaries = (translatedDiariesRes.data ?? []) as unknown as Array<Record<string, unknown>>;
  }

  // 为每篇文章生成摘要（优先 excerpt，否则从 content 中截取）
  const sourcePosts = (postsRes.data || []).map((p) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    published_at: p.published_at,
    created_at: p.created_at,
    snippet: p.excerpt ? getSnippet(p.excerpt, q) : getSnippet(p.content || "", q),
  }));

  // 为每篇日记生成摘要
  const sourceDiaries = (diariesRes.data || []).map((d) => ({
    id: d.id,
    title: d.title,
    slug: d.slug,
    created_at: d.created_at,
    snippet: getSnippet(d.content || "", q),
  }));

  const localizedPosts = translatedPosts.map((row) => {
    const source = row.posts as { id: string; slug: string; published_at: string | null; created_at: string };
    const excerpt = String(row.excerpt || "");
    const content = String(row.content || "");
    return {
      id: source.id,
      title: String(row.title || ""),
      slug: source.slug,
      published_at: source.published_at,
      created_at: source.created_at,
      snippet: getSnippet(excerpt || content, q),
    };
  });
  const localizedDiaries = translatedDiaries.map((row) => {
    const source = row.diaries as { id: string; slug: string; created_at: string };
    return {
      id: source.id,
      title: String(row.title || ""),
      slug: source.slug,
      created_at: source.created_at,
      snippet: getSnippet(String(row.content || ""), q),
    };
  });

  const postIds = new Set(localizedPosts.map((post) => post.id));
  const diaryIds = new Set(localizedDiaries.map((diary) => diary.id));
  const posts = [...localizedPosts, ...sourcePosts.filter((post) => !postIds.has(post.id))].slice(0, 5);
  const diaries = [...localizedDiaries, ...sourceDiaries.filter((diary) => !diaryIds.has(diary.id))].slice(0, 5);

  return NextResponse.json({ posts, diaries });
}
