import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/comments?post_id=<uuid>
 * 获取指定文章的评论列表（公开）
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const postId = searchParams.get("post_id");

  if (!postId) {
    return NextResponse.json(
      { success: false, error: "缺少 post_id 参数" },
      { status: 400 }
    );
  }

  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from("comments")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/comments error:", error);
    return NextResponse.json(
      { success: false, error: "获取评论失败" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/comments
 * 提交新评论（公开，无需登录）
 * Body: { post_id, author_name?, author_email?, content }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { post_id, author_name, author_email, content } = body;

    // 基础验证
    if (!post_id || !content || !content.trim()) {
      return NextResponse.json(
        { success: false, error: "请填写评论内容" },
        { status: 400 }
      );
    }

    if (content.length > 5000) {
      return NextResponse.json(
        { success: false, error: "评论内容不能超过 5000 字" },
        { status: 400 }
      );
    }

    const supabase = await createServiceClient();

    const { data, error } = await supabase
      .from("comments")
      .insert({
        post_id,
        author_name: author_name?.trim() || "匿名",
        author_email: author_email?.trim() || null,
        content: content.trim(),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("POST /api/comments error:", error);
    return NextResponse.json(
      { success: false, error: "评论提交失败" },
      { status: 500 }
    );
  }
}
