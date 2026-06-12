"use client";

import { Play, Pause, SkipBack, SkipForward, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMusic } from "./music-context";

// ── Helpers ──

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Component ──

export function MusicPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    tracks,
    currentTrackIndex,
    isPlaying,
    currentTime,
    duration,
    toggle,
    next,
    prev,
    selectTrack,
  } = useMusic();

  const currentTrack = tracks[currentTrackIndex];
  const progressPercent =
    duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;

  // ── Seek handler ──
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const audioEl = document.querySelector("audio");
    if (audioEl) {
      audioEl.currentTime = fraction * duration;
    }
  };

  if (!open) return null;

  return (
    <div
      className={cn(
        "absolute right-0 top-full mt-2 z-50",
        "w-72 rounded-xl border border-border bg-popover text-popover-foreground",
        "shadow-lg p-4",
        "animate-in fade-in slide-in-from-top-2 duration-150"
      )}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-3 right-3 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="关闭播放器"
      >
        <X className="size-3.5" />
      </button>

      {/* Rotating disc */}
      <div className="flex justify-center mt-2 mb-4">
        <div
          className={cn(
            "w-20 h-20 rounded-full",
            "bg-gradient-to-br from-muted via-secondary to-muted",
            "border-2 border-border",
            "flex items-center justify-center",
            "shadow-inner",
            isPlaying && "[animation:spin-slow_3s_linear_infinite]"
          )}
        >
          <div className="w-5 h-5 rounded-full bg-popover border border-border" />
        </div>
      </div>

      {/* Track info */}
      <div className="text-center mb-3">
        <p className="text-sm font-medium truncate">{currentTrack.title}</p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {currentTrack.artist}
        </p>
      </div>

      {/* Progress bar */}
      <div
        className="relative h-1.5 w-full bg-muted rounded-full cursor-pointer group mb-1"
        onClick={handleSeek}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progressPercent)}
        tabIndex={0}
      >
        <div
          className="absolute inset-y-0 left-0 bg-primary rounded-full transition-[width] duration-150"
          style={{ width: `${progressPercent}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
          style={{ left: `calc(${progressPercent}% - 6px)` }}
        />
      </div>

      {/* Time */}
      <div className="flex justify-between text-[10px] text-muted-foreground mb-3">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 mb-3">
        <button
          onClick={prev}
          className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          aria-label="上一曲"
        >
          <SkipBack className="size-4" />
        </button>
        <button
          onClick={toggle}
          className="p-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/85 transition-colors"
          aria-label={isPlaying ? "暂停" : "播放"}
        >
          {isPlaying ? (
            <Pause className="size-4 fill-current" />
          ) : (
            <Play className="size-4 fill-current ml-0.5" />
          )}
        </button>
        <button
          onClick={next}
          className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          aria-label="下一曲"
        >
          <SkipForward className="size-4" />
        </button>
      </div>

      {/* Divider + Playlist */}
      <div className="pt-3 border-t border-border">
        <p className="text-[10px] text-muted-foreground mb-2 font-medium uppercase tracking-wider">
          播放列表
        </p>
        <div className="space-y-0.5">
          {tracks.map((track, index) => (
            <button
              key={track.id}
              onClick={() => selectTrack(index)}
              className={cn(
                "w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors flex items-center gap-2",
                "hover:bg-muted",
                index === currentTrackIndex
                  ? "bg-muted text-primary font-medium"
                  : "text-muted-foreground"
              )}
            >
              <span className="w-4 text-center flex-shrink-0">
                {index === currentTrackIndex && isPlaying ? (
                  <span className="inline-block w-1 h-3 bg-primary rounded-full animate-pulse" />
                ) : index === currentTrackIndex ? (
                  <span className="text-primary text-[10px]">▶</span>
                ) : (
                  <span className="text-[10px]">♫</span>
                )}
              </span>
              <span className="truncate flex-1">{track.title}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
