"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("Admin.gallery");

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
      toast.error(t("imageRequired"));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t("tooLarge"));
      return;
    }

    setUploading(true);
    try {
      const { compressImage } = await import("@/lib/compress");
      const toUpload = await compressImage(file);

      const formData = new FormData();
      formData.append("file", toUpload);

      const res = await fetch("/api/gallery", { method: "POST", body: formData });
      const json = await res.json();

      if (!json.success) {
        toast.error(t("uploadFailed"));
        return;
      }

      toast.success(t("uploaded"));
      setImages((prev) => [...prev, json.data]);
    } catch {
      toast.error(t("uploadFailed"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(t("deleteConfirm"))) return;

    setDeleting(name);
    try {
      const res = await fetch(`/api/gallery?name=${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      const json = await res.json();

      if (!json.success) {
        toast.error(t("deleteFailed"));
        return;
      }

      toast.success(t("deleted"));
      setImages((prev) => prev.filter((img) => img.name !== name));
    } catch {
      toast.error(t("deleteFailed"));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-foreground">{t("title")}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("count", { count: images.length })}
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
            {uploading ? t("uploading") : t("upload")}
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
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            {t("emptyHint")}
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
                title={t("delete")}
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
