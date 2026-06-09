import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, createServerSupabase } from "@/lib/supabase/server";
import { createHmac } from "crypto";

const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback-secret";

function signDeleteToken(commentId: string): string {
  const hmac = createHmac("sha256", SECRET);
  hmac.update(commentId);
  return `${commentId}:${hmac.digest("hex").slice(0, 24)}`;
}

function verifyDeleteToken(token: string): string | null {
  const idx = token.indexOf(":");
  if (idx === -1) return null;
  const commentId = token.slice(0, idx);
  const expected = signDeleteToken(commentId);
  return expected === token ? commentId : null;
}

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

    const deleteToken = signDeleteToken(data.id);

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
    // 验证管理员身份
    const serverSupabase = await createServerSupabase();
    const { data: { user } } = await serverSupabase.auth.getUser();

    // 验证删除令牌（匿名用户）
    if (!user && token) {
      const validId = verifyDeleteToken(token);
      if (validId !== id) {
        return NextResponse.json(
          { success: false, error: "删除令牌无效" },
          { status: 403 }
        );
      }
    }

    // 既不是管理员也没有有效令牌
    if (!user && !token) {
      return NextResponse.json(
        { success: false, error: "无权删除" },
        { status: 403 }
      );
    }

    const supabase = await createServiceClient();
    const { error } = await supabase.from("comments").delete().eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/comments error:", error);
    return NextResponse.json(
      { success: false, error: "删除失败" },
      { status: 500 }
    );
  }
}
