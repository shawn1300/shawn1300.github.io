import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAuthenticatedAdminContext } from "@/lib/supabase/authenticated-admin";

/**
 * POST /api/posts
 * 创建新文章（需登录 — 通过 service client 绕过 RLS）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, slug, content, excerpt, cover_image, category_id, tags, status } = body;

    if (!title?.trim() || !slug?.trim()) {
      return NextResponse.json(
        { success: false, error: "标题和 slug 为必填项" },
        { status: 400 }
      );
    }

    const context = await createAuthenticatedAdminContext();
    if (!context) {
      return NextResponse.json(
        { success: false, error: "请先登录" },
        { status: 401 }
      );
    }
    const { supabase, user } = context;

    // 创建文章
    const { data: post, error } = await supabase
      .from("posts")
      .insert({
        title: title.trim(),
        slug: slug.trim(),
        content: content || "",
        excerpt: excerpt?.trim() || "",
        cover_image: cover_image || null,
        category_id: category_id || null,
        status: status || "draft",
        // 数据库旧触发器只覆盖“草稿改为发布”，直接发布时需要在这里赋值。
        published_at: status === "published" ? new Date().toISOString() : null,
        author_id: user.id,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { success: false, error: "该 slug 已存在，请更换 URL 标识" },
          { status: 409 }
        );
      }
      throw error;
    }

    // 关联标签
    if (tags && Array.isArray(tags) && tags.length > 0) {
      await supabase.from("post_tags").insert(
        tags.map((tagId: string) => ({ post_id: post.id, tag_id: tagId }))
      );
    }

    // 使公开页缓存立即失效
    revalidateTag("posts", "max");

    return NextResponse.json({ success: true, data: post }, { status: 201 });
  } catch (error) {
    console.error("POST /api/posts error:", error);
    return NextResponse.json(
      { success: false, error: "创建文章失败" },
      { status: 500 }
    );
  }
}
