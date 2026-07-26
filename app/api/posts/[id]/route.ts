import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/posts/[id]
 * 获取单篇文章（含标签，仅供后台）
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServiceClient();

    const { data: post, error } = await supabase
      .from("posts")
      .select("*, category:categories(*)")
      .eq("id", id)
      .single();

    if (error || !post) {
      return NextResponse.json(
        { success: false, error: "文章不存在" },
        { status: 404 }
      );
    }

    // 获取标签
    const { data: tagRelations } = await supabase
      .from("post_tags")
      .select("tag_id")
      .eq("post_id", id);

    let tags: { id: string; name: string; slug: string }[] = [];
    if (tagRelations && tagRelations.length > 0) {
      const { data: tagData } = await supabase
        .from("tags")
        .select("*")
        .in(
          "id",
          tagRelations.map((t) => t.tag_id)
        );
      tags = tagData || [];
    }

    return NextResponse.json({ success: true, data: { ...post, tags } });
  } catch (error) {
    console.error("GET /api/posts/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "获取文章失败" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/posts/[id]
 * 更新文章
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { title, slug, content, excerpt, cover_image, category_id, tags, status } = body;

    if (!title?.trim() || !slug?.trim()) {
      return NextResponse.json(
        { success: false, error: "标题和 slug 为必填项" },
        { status: 400 }
      );
    }

    const supabase = await createServiceClient();

    // 验证登录
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "请先登录" },
        { status: 401 }
      );
    }

    // 更新文章
    const { data: post, error } = await supabase
      .from("posts")
      .update({
        title: title.trim(),
        slug: slug.trim(),
        content: content || "",
        excerpt: excerpt?.trim() || "",
        cover_image: cover_image || null,
        category_id: category_id || null,
        status,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { success: false, error: "该 slug 已存在" },
          { status: 409 }
        );
      }
      throw error;
    }

    // 更新标签关联（先删除旧关联，再插入新关联）
    await supabase.from("post_tags").delete().eq("post_id", id);

    if (tags && Array.isArray(tags) && tags.length > 0) {
      await supabase.from("post_tags").insert(
        tags.map((tagId: string) => ({ post_id: id, tag_id: tagId }))
      );
    }

    // 使公开页缓存立即失效
    revalidateTag("posts", "max");

    return NextResponse.json({ success: true, data: post });
  } catch (error) {
    console.error("PUT /api/posts/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "更新文章失败" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/posts/[id]
 * 删除文章
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServiceClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "请先登录" },
        { status: 401 }
      );
    }

    // 先删除标签关联
    await supabase.from("post_tags").delete().eq("post_id", id);

    const { error } = await supabase.from("posts").delete().eq("id", id);

    if (error) throw error;

    revalidateTag("posts", "max");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/posts/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "删除文章失败" },
      { status: 500 }
    );
  }
}
