"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

interface ImageUploadProps {
  onInsert: (url: string, alt?: string) => void;
}

export function ImageUpload({ onInsert }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }

    // 验证大小 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("图片大小不能超过 10MB");
      return;
    }

    setUploading(true);

    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "png";
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("blog-images")
        .upload(fileName, file, {
          cacheControl: "31536000",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("blog-images").getPublicUrl(fileName);

      onInsert(publicUrl, file.name.replace(/\.[^.]+$/, ""));
      toast.success("图片上传成功");
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "上传失败");
    } finally {
      setUploading(false);
      // 重置 input 以便再次上传同一文件
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleUpload}
        className="hidden"
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="h-7 text-xs text-muted-foreground hover:text-foreground"
      >
        {uploading ? "上传中..." : "📷 插入图片"}
      </Button>
    </>
  );
}
