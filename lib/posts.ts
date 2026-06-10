import { createServerSupabase } from "@/lib/supabase/server";
import type { Post, Category, Tag } from "@/types";

/**
 * 获取已发布文章列表（公开）
 */
export async function getPublishedPosts(options?: {
  categorySlug?: string
  limit?: number
  offset?: number
}): Promise<Post[]> {
  const supabase = await createServerSupabase();
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
      category:categories(*)
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

  // Fetch tags for each post
  const postsWithTags = await Promise.all(
    (data || []).map(async (post) => {
      const { data: tagRelations } = await supabase
        .from("post_tags")
        .select("tag_id")
        .eq("post_id", post.id);

      let tags: Tag[] = [];
      if (tagRelations && tagRelations.length > 0) {
        const { data: tagData } = await supabase
          .from("tags")
          .select("*")
          .in("id", tagRelations.map((t) => t.tag_id));
        tags = tagData || [];
      }

      return {
        ...post,
        tags,
      } as Post;
    })
  );

  return postsWithTags;
}

/**
 * 获取单篇文章（通过 slug，公开 — 只返回已发布）
 */
export async function getPostBySlug(slug: string): Promise<Post | null> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from("posts")
    .select(`
      *,
      category:categories(*)
    `)
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (error || !data) return null;

  // Fetch tags
  const { data: tagRelations } = await supabase
    .from("post_tags")
    .select("tag_id")
    .eq("post_id", data.id);

  let tags: Tag[] = [];
  if (tagRelations && tagRelations.length > 0) {
    const { data: tagData } = await supabase
      .from("tags")
      .select("*")
      .in("id", tagRelations.map((t) => t.tag_id));
    tags = tagData || [];
  }

  return { ...data, tags } as Post;
}

/**
 * 获取所有分类
 */
export async function getCategories(): Promise<Category[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("name");

  if (error) {
    console.error("Error fetching categories:", error);
    return [];
  }
  return data;
}

/**
 * 获取所有分类（含文章数量）
 */
export async function getCategoriesWithCount(): Promise<(Category & { count: number })[]> {
  const supabase = await createServerSupabase();
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
}

/**
 * 获取所有已发布文章（用于归档，不分页）
 */
export async function getAllPublishedPosts(): Promise<Post[]> {
  return getPublishedPosts({ limit: 500 });
}

/**
 * 获取所有标签
 */
export async function getTags(): Promise<Tag[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("tags")
    .select("*")
    .order("name");

  if (error) {
    console.error("Error fetching tags:", error);
    return [];
  }
  return data;
}
