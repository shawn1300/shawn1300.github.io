"use client";

import { useEffect, useState, useCallback } from "react";

interface GalleryImage {
  name: string;
  url: string;
}

export default function GalleryPage() {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/gallery")
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data?.length > 0) {
          setImages(json.data);
          setIndex(Math.floor(Math.random() * json.data.length));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const nextImage = useCallback(() => {
    if (images.length > 1) {
      let next: number;
      do {
        next = Math.floor(Math.random() * images.length);
      } while (next === index);
      setIndex(next);
    }
  }, [images, index]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-12 sm:py-24">
        <div className="mb-12 space-y-2">
          <h1 className="text-sm font-medium tracking-tight text-foreground">
            相册
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            用镜头记录生活中的瞬间。
          </p>
        </div>
        <div className="aspect-[4/3] rounded-lg border border-border/60 bg-muted/30 animate-pulse" />
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-12 sm:py-24">
        <div className="mb-12 space-y-2">
          <h1 className="text-sm font-medium tracking-tight text-foreground">
            相册
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            用镜头记录生活中的瞬间。
          </p>
        </div>
        <div className="py-20 text-center">
          <p className="text-sm text-muted-foreground">还没有照片 📷</p>
          <p className="text-xs text-muted-foreground/60 mt-2">
            在后台编辑器上传图片后，会在这里随机展示
          </p>
        </div>
      </div>
    );
  }

  const current = images[index];

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-12 sm:py-24">
      <div className="mb-12 space-y-2">
        <h1 className="text-sm font-medium tracking-tight text-foreground">
          相册
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          用镜头记录生活中的瞬间，点击图片切换 →
        </p>
      </div>

      <div
        onClick={nextImage}
        className="w-[92vw] max-w-5xl aspect-square sm:aspect-[3/2] rounded-lg overflow-hidden border border-border/40 hover:border-border cursor-pointer transition-colors bg-muted/30"
      >
        <img
          src={current.url}
          alt={current.name}
          className="h-full w-full object-cover"
        />
      </div>
    </div>
  );
}
