import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/admin-meta
 * 返回分类和标签列表（供后台编辑器使用）
 */
export async function GET() {
  try {
    const supabase = await createServiceClient();

    const [catRes, tagRes] = await Promise.all([
      supabase.from("categories").select("*").order("name"),
      supabase.from("tags").select("*").order("name"),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        categories: catRes.data || [],
        tags: tagRes.data || [],
      },
    });
  } catch (error) {
    console.error("GET /api/admin-meta error:", error);
    return NextResponse.json(
      { success: false, error: "获取元数据失败" },
      { status: 500 }
    );
  }
}
