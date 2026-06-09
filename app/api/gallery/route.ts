import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/gallery
 * 获取 Supabase Storage 中所有可公开访问的图片
 */
export async function GET() {
  try {
    const supabase = await createServiceClient();

    // 列出 gallery bucket 中的所有文件
    const { data: files, error } = await supabase
      .storage
      .from("gallery")
      .list();

    if (error) {
      console.error("GET /api/gallery error:", error);
      return NextResponse.json(
        { success: false, error: "获取图片列表失败" },
        { status: 500 }
      );
    }

    if (!files || files.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // 过滤掉文件夹，只保留图片文件
    const imageFiles = files.filter((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase();
      return ext && ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext);
    });

    // 生成公开访问 URL
    const images = imageFiles.map((f) => {
      const { data: urlData } = supabase
        .storage
        .from("gallery")
        .getPublicUrl(f.name);
      return {
        name: f.name,
        url: urlData.publicUrl,
      };
    });

    return NextResponse.json({ success: true, data: images });
  } catch (error) {
    console.error("GET /api/gallery error:", error);
    return NextResponse.json(
      { success: false, error: "获取图片列表失败" },
      { status: 500 }
    );
  }
}
