"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";

interface GalleryImage {
  name: string;
  url: string;
}

type ViewMode = "single" | "masonry";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function GalleryPage() {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("single");

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

  // 图库模式：随机 16 张，视图切换时刷新
  const [masonryKey, setMasonryKey] = useState(0);
  const masonryImages = useMemo(() => {
    if (images.length === 0) return [];
    return shuffle(images).slice(0, 16);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, masonryKey, view]);

  const nextImage = useCallback(() => {
    if (images.length > 1) {
      let next: number;
      do {
        next = Math.floor(Math.random() * images.length);
      } while (next === index);
      setIndex(next);
    }
  }, [images, index]);

  const switchView = (mode: ViewMode) => {
    setView(mode);
    if (mode === "masonry") setMasonryKey((k) => k + 1);
  };

  // ── 加载中 ──
  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-12 sm:py-24">
        <div className="mb-8 space-y-2">
          <h1 className="text-sm font-medium tracking-tight text-foreground">相册</h1>
          <p className="text-sm text-muted-foreground">用镜头记录生活中的瞬间。</p>
        </div>
        <div className="aspect-[4/3] rounded-lg border border-border/60 bg-muted/30 animate-pulse" />
      </div>
    );
  }

  // ── 空 ──
  if (images.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-12 sm:py-24">
        <div className="mb-8 space-y-2">
          <h1 className="text-sm font-medium tracking-tight text-foreground">相册</h1>
          <p className="text-sm text-muted-foreground">用镜头记录生活中的瞬间。</p>
        </div>
        <div className="py-20 text-center">
          <p className="text-sm text-muted-foreground">还没有照片 📷</p>
        </div>
      </div>
    );
  }

  // ── 视图切换按钮 ──
  const ViewToggle = () => (
    <div className="flex items-center gap-1 border border-border/60 rounded-md p-0.5">
      <button
        onClick={() => switchView("single")}
        className={cn(
          "px-3 py-1 rounded text-xs transition-colors",
          view === "single"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        大图
      </button>
      <button
        onClick={() => switchView("masonry")}
        className={cn(
          "px-3 py-1 rounded text-xs transition-colors",
          view === "masonry"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        图库
      </button>
    </div>
  );

  const current = images[index];

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-12 sm:py-24">
      <div className="mb-8 flex items-end justify-between">
        <div className="space-y-2">
          <h1 className="text-sm font-medium tracking-tight text-foreground">相册</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {view === "single"
              ? "点击图片切换 →"
              : `${masonryImages.length} / ${images.length} 张`}
          </p>
        </div>
        <ViewToggle />
      </div>

      {/* 大图模式 */}
      {view === "single" && (
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
      )}

      {/* 图库瀑布流 */}
      {view === "masonry" && (
        <div className="columns-2 sm:columns-3 gap-3 space-y-3">
          {masonryImages.map((img) => (
            <div
              key={img.name}
              className="break-inside-avoid rounded-lg overflow-hidden border border-border/40 bg-muted/30"
            >
              <img
                src={img.url}
                alt={img.name}
                className="w-full h-auto"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
