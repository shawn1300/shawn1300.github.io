import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/admin-comments
 * 获取所有评论（后台管理用，含 IP）
 */
export async function GET() {
  try {
    const supabase = await createServiceClient();

    const { data, error } = await supabase
      .from("comments")
      .select("*, post:posts(title, slug)")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/admin-comments error:", error);
    return NextResponse.json(
      { success: false, error: "获取评论列表失败" },
      { status: 500 }
    );
  }
}
