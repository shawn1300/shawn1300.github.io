import { NextRequest, NextResponse } from "next/server";
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

/**
 * POST /api/gallery
 * 上传图片到 gallery 桶（仅认证用户）
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "请选择文件" },
        { status: 400 }
      );
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { success: false, error: "仅支持图片文件" },
        { status: 400 }
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: "图片大小不能超过 10MB" },
        { status: 400 }
      );
    }

    const supabase = await createServiceClient();
    const ext = file.name.split(".").pop() || "png";
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage
      .from("gallery")
      .upload(fileName, file, {
        cacheControl: "31536000",
        upsert: false,
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from("gallery")
      .getPublicUrl(fileName);

    return NextResponse.json({ success: true, data: { name: fileName, url: urlData.publicUrl } });
  } catch (error) {
    console.error("POST /api/gallery error:", error);
    return NextResponse.json(
      { success: false, error: "上传失败" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/gallery?name=xxx
 * 从 gallery 桶删除图片（仅认证用户）
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name");

    if (!name) {
      return NextResponse.json(
        { success: false, error: "缺少文件名" },
        { status: 400 }
      );
    }

    const supabase = await createServiceClient();
    const { error } = await supabase.storage.from("gallery").remove([name]);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/gallery error:", error);
    return NextResponse.json(
      { success: false, error: "删除失败" },
      { status: 500 }
    );
  }
}
