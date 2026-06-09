"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface GalleryImage {
  name: string;
  url: string;
}

export default function AdminGalleryPage() {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchImages = useCallback(async () => {
    try {
      const res = await fetch("/api/gallery");
      const json = await res.json();
      if (json.success) setImages(json.data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("图片大小不能超过 10MB");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/gallery", { method: "POST", body: formData });
      const json = await res.json();

      if (!json.success) {
        toast.error(json.error || "上传失败");
        return;
      }

      toast.success("上传成功");
      setImages((prev) => [...prev, json.data]);
    } catch {
      toast.error("上传失败");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm("确定要删除这张照片？")) return;

    setDeleting(name);
    try {
      const res = await fetch(`/api/gallery?name=${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      const json = await res.json();

      if (!json.success) {
        toast.error(json.error || "删除失败");
        return;
      }

      toast.success("已删除");
      setImages((prev) => prev.filter((img) => img.name !== name));
    } catch {
      toast.error("删除失败");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-foreground">相册管理</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {images.length} 张照片
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleUpload}
            className="hidden"
          />
          <Button
            size="sm"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="h-8 text-xs"
          >
            {uploading ? "上传中..." : "上传照片"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square rounded-lg border border-border/60 bg-muted/30 animate-pulse"
            />
          ))}
        </div>
      ) : images.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-border/60 rounded-lg">
          <p className="text-sm text-muted-foreground">还没有照片</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            点击「上传照片」添加
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {images.map((img) => (
            <div key={img.name} className="group relative aspect-square rounded-lg overflow-hidden border border-border/40 bg-muted/30">
              <img
                src={img.url}
                alt={img.name}
                className="h-full w-full object-cover"
                loading="lazy"
              />
              <button
                onClick={() => handleDelete(img.name)}
                disabled={deleting === img.name}
                className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-background/80 backdrop-blur border border-border/40 text-[10px] text-muted-foreground hover:text-destructive hover:border-destructive/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                title="删除"
              >
                {deleting === img.name ? "..." : "✕"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
