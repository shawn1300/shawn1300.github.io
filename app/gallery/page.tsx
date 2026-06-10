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

  // Lightbox 状态
  const [lightbox, setLightbox] = useState<GalleryImage | null>(null);

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

  // Lightbox 键盘事件
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    if (lightbox) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [lightbox]);

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
              ? "点击图片放大查看"
              : `${masonryImages.length} / ${images.length} 张  ·  点击放大`}
          </p>
        </div>
        <ViewToggle />
      </div>

      {/* 大图模式 */}
      {view === "single" && (
        <div className="space-y-3">
          <div
            onClick={() => setLightbox(current)}
            className="w-[92vw] max-w-5xl aspect-square sm:aspect-[3/2] rounded-lg overflow-hidden border border-border/40 hover:border-border cursor-pointer transition-colors bg-muted/30 group relative"
          >
            <img
              src={current.url}
              alt={current.name}
              className="h-full w-full object-cover"
            />
            {/* 放大图标提示 */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="rounded-full bg-black/60 p-3 backdrop-blur-sm">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
                </svg>
              </div>
            </div>
          </div>
          <p
            onClick={nextImage}
            className="text-xs text-muted-foreground text-center cursor-pointer hover:text-foreground transition-colors select-none"
          >
            换一张 →
          </p>
        </div>
      )}

      {/* 图库瀑布流 */}
      {view === "masonry" && (
        <div className="columns-2 sm:columns-3 gap-3 space-y-3">
          {masonryImages.map((img) => (
            <div
              key={img.name}
              onClick={() => setLightbox(img)}
              className="break-inside-avoid rounded-lg overflow-hidden border border-border/40 bg-muted/30 cursor-pointer group relative"
            >
              <img
                src={img.url}
                alt={img.name}
                className="w-full h-auto"
                loading="lazy"
              />
              {/* 悬停放大图标 */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="rounded-full bg-black/60 p-3 backdrop-blur-sm">
                  <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
                  </svg>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Lightbox ── */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          {/* 关闭按钮 */}
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 z-10 rounded-full bg-white/10 p-2 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
            aria-label="关闭"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* 上一张 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              const idx = images.findIndex((img) => img.url === lightbox.url);
              const prev = idx > 0 ? images[idx - 1] : images[images.length - 1];
              setLightbox(prev);
            }}
            className="absolute left-3 sm:left-6 z-10 rounded-full bg-white/10 p-2.5 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
            aria-label="上一张"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>

          {/* 下一张 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              const idx = images.findIndex((img) => img.url === lightbox.url);
              const next = idx < images.length - 1 ? images[idx + 1] : images[0];
              setLightbox(next);
            }}
            className="absolute right-3 sm:right-6 z-10 rounded-full bg-white/10 p-2.5 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
            aria-label="下一张"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>

          {/* 图片 */}
          <img
            src={lightbox.url}
            alt={lightbox.name}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] max-w-[92vw] object-contain rounded-lg"
          />
        </div>
      )}
    </div>
  );
}
