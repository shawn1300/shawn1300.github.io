import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/diaries
 * 创建日记（需登录）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, slug, content } = body;

    if (!title?.trim() || !slug?.trim()) {
      return NextResponse.json(
        { success: false, error: "标题和 slug 为必填项" },
        { status: 400 }
      );
    }

    const supabase = await createServiceClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "请先登录" },
        { status: 401 }
      );
    }

    const { data: diary, error } = await supabase
      .from("diaries")
      .insert({
        title: title.trim(),
        slug: slug.trim(),
        content: content || "",
        author_id: user.id,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { success: false, error: "该 slug 已存在，请修改标题" },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true, data: diary }, { status: 201 });
  } catch (error) {
    console.error("POST /api/diaries error:", error);
    return NextResponse.json(
      { success: false, error: "创建日记失败" },
      { status: 500 }
    );
  }
}
