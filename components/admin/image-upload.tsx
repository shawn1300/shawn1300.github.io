"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface ImageUploadProps {
  onInsert: (url: string, alt?: string) => void;
}

export function ImageUpload({ onInsert }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations("Admin.gallery");

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    if (!file.type.startsWith("image/")) {
      toast.error(t("imageRequired"));
      return;
    }

    // 验证大小 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t("tooLarge"));
      return;
    }

    setUploading(true);

    try {
      const { compressImage } = await import("@/lib/compress");
      const toUpload = await compressImage(file);

      const supabase = createClient();
      const ext = file.name.split(".").pop() || "png";
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("blog-images")
        .upload(fileName, toUpload, {
          cacheControl: "31536000",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("blog-images").getPublicUrl(fileName);

      onInsert(publicUrl, file.name.replace(/\.[^.]+$/, ""));
      toast.success(t("inserted"));
    } catch (error: unknown) {
      console.error("Upload error:", error);
      toast.error(error instanceof Error ? error.message : t("uploadFailed"));
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
        {uploading ? t("uploading") : t("insert")}
      </Button>
    </>
  );
}
