import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, createServerSupabase } from "@/lib/supabase/server";

/**
 * 从请求中提取客户端 IP
 */
function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIP = request.headers.get("x-real-ip");
  if (realIP) return realIP;
  return "unknown";
}

/**
 * GET /api/comments?post_id=<uuid>
 * 获取指定文章的评论列表（公开，不暴露敏感字段）
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
      .select("id, post_id, author_name, author_email, content, created_at")
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
 * 提交新评论，记录 IP 并生成删除令牌
 * Response: { success: true, data: Comment, deleteToken: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { post_id, author_name, author_email, content } = body;

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
    const deleteToken = crypto.randomUUID();
    const ip = getClientIP(request);

    const { data, error } = await supabase
      .from("comments")
      .insert({
        post_id,
        author_name: author_name?.trim() || "匿名",
        author_email: author_email?.trim() || null,
        content: content.trim(),
        delete_token: deleteToken,
        ip_address: ip,
      })
      .select("id, post_id, author_name, author_email, content, created_at")
      .single();

    if (error) throw error;

    return NextResponse.json(
      { success: true, data, deleteToken },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/comments error:", error);
    return NextResponse.json(
      { success: false, error: "评论提交失败" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/comments?id=<uuid>[&token=<deleteToken>]
 * 删除评论：token 匹配（匿名用户）或 管理员登录
 */
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const token = searchParams.get("token");

  if (!id) {
    return NextResponse.json(
      { success: false, error: "缺少评论 ID" },
      { status: 400 }
    );
  }

  try {
    const supabase = await createServiceClient();

    // 管理员登录 → 直接删
    const serverSupabase = await createServerSupabase();
    const { data: { user } } = await serverSupabase.auth.getUser();

    if (user) {
      const { error } = await supabase.from("comments").delete().eq("id", id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    // 匿名用户 → 验证 delete_token
    if (token) {
      const { data: comment, error: fetchError } = await supabase
        .from("comments")
        .select("delete_token")
        .eq("id", id)
        .single();

      if (fetchError || !comment) {
        return NextResponse.json(
          { success: false, error: "评论不存在" },
          { status: 404 }
        );
      }

      if (comment.delete_token !== token) {
        return NextResponse.json(
          { success: false, error: "删除令牌无效" },
          { status: 403 }
        );
      }

      const { error } = await supabase.from("comments").delete().eq("id", id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { success: false, error: "无权删除" },
      { status: 403 }
    );
  } catch (error) {
    console.error("DELETE /api/comments error:", error);
    return NextResponse.json(
      { success: false, error: "删除失败" },
      { status: 500 }
    );
  }
}
