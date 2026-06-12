import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/diaries/[id]
 * 获取单篇日记（仅供后台编辑）
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServiceClient();

    const { data: diary, error } = await supabase
      .from("diaries")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !diary) {
      return NextResponse.json(
        { success: false, error: "日记不存在" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: diary });
  } catch (error) {
    console.error("GET /api/diaries/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "获取日记失败" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/diaries/[id]
 * 更新日记
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
      .update({
        title: title.trim(),
        slug: slug.trim(),
        content: content || "",
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

    return NextResponse.json({ success: true, data: diary });
  } catch (error) {
    console.error("PUT /api/diaries/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "更新日记失败" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/diaries/[id]
 * 删除日记
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

    const { error } = await supabase.from("diaries").delete().eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/diaries/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "删除日记失败" },
      { status: 500 }
    );
  }
}
