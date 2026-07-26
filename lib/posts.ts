import { unstable_cache } from "next/cache";
import { createStaticSupabase } from "@/lib/supabase/static";
import type { Post, Category, Tag } from "@/types";

/**
 * 公开内容数据层
 * 使用静态客户端（无 cookies）+ unstable_cache：
 * - 结果缓存 60 秒，链接跳转不再每次现场查库
 * - 后台保存时通过 revalidateTag("posts"/"diaries") 立即失效
 */

/** 把嵌套的 post_tags(tag:tags(*)) 展平成 tags 数组 */
function flattenTags(row: Record<string, unknown>): Post {
  const { post_tags, ...rest } = row as { post_tags?: { tag: Tag | null }[] } & Record<string, unknown>;
  const tags = (post_tags || [])
    .map((pt) => pt.tag)
    .filter((t): t is Tag => !!t);
  return { ...rest, tags } as unknown as Post;
}

/**
 * 获取已发布文章列表（公开）
 * 标签通过嵌套 select 一次查完，避免 N+1
 */
export const getPublishedPosts = unstable_cache(
  async (options?: {
    categorySlug?: string;
    limit?: number;
    offset?: number;
  }): Promise<Post[]> => {
    const supabase = createStaticSupabase();
    const { categorySlug, limit = 20, offset = 0 } = options || {};

    // 按 slug 查分类 id
    let categoryId: string | null = null;
    if (categorySlug) {
      const { data: cat } = await supabase
        .from("categories")
        .select("id")
        .eq("slug", categorySlug)
        .single();
      categoryId = cat?.id || null;
    }

    let query = supabase
      .from("posts")
      .select(`
        *,
        category:categories(*),
        post_tags(tag:tags(*))
      `)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Error fetching posts:", error);
      return [];
    }

    return (data || []).map(flattenTags);
  },
  ["published-posts"],
  { revalidate: 60, tags: ["posts"] }
);

/**
 * 获取单篇文章（通过 slug，公开 — 只返回已发布）
 */
export const getPostBySlug = unstable_cache(
  async (slug: string): Promise<Post | null> => {
    const supabase = createStaticSupabase();

    const { data, error } = await supabase
      .from("posts")
      .select(`
        *,
        category:categories(*),
        post_tags(tag:tags(*))
      `)
      .eq("slug", slug)
      .eq("status", "published")
      .single();

    if (error || !data) return null;

    return flattenTags(data);
  },
  ["post-by-slug"],
  { revalidate: 60, tags: ["posts"] }
);

/**
 * 获取所有分类
 */
export const getCategories = unstable_cache(
  async (): Promise<Category[]> => {
    const supabase = createStaticSupabase();
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .order("name");

    if (error) {
      console.error("Error fetching categories:", error);
      return [];
    }
    return data;
  },
  ["categories"],
  { revalidate: 60, tags: ["categories"] }
);

/**
 * 获取所有分类（含文章数量）
 */
export const getCategoriesWithCount = unstable_cache(
  async (): Promise<(Category & { count: number })[]> => {
    const supabase = createStaticSupabase();
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .order("name");

    if (error || !data) return [];

    const categoriesWithCount = await Promise.all(
      data.map(async (cat) => {
        const { count } = await supabase
          .from("posts")
          .select("*", { count: "exact", head: true })
          .eq("category_id", cat.id)
          .eq("status", "published");
        return { ...cat, count: count || 0 };
      })
    );

    return categoriesWithCount;
  },
  ["categories-with-count"],
  { revalidate: 60, tags: ["categories", "posts"] }
);

/**
 * 获取所有已发布文章（用于归档，不分页）
 */
export async function getAllPublishedPosts(): Promise<Post[]> {
  return getPublishedPosts({ limit: 500 });
}

/**
 * 获取所有标签
 */
export const getTags = unstable_cache(
  async (): Promise<Tag[]> => {
    const supabase = createStaticSupabase();
    const { data, error } = await supabase
      .from("tags")
      .select("*")
      .order("name");

    if (error) {
      console.error("Error fetching tags:", error);
      return [];
    }
    return data;
  },
  ["tags"],
  { revalidate: 60, tags: ["categories"] }
);
