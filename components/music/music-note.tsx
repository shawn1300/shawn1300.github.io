"use client";

import { Music } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMusic } from "./music-context";

export function MusicNote({ onClick }: { onClick: () => void }) {
  const { isPlaying } = useMusic();

  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center size-7 rounded-md transition-colors",
        "text-muted-foreground hover:text-foreground hover:bg-muted",
        isPlaying && "text-primary [animation:spin-slow_3s_linear_infinite]"
      )}
      aria-label="音乐播放器"
      title="音乐播放器"
    >
      <Music className="size-4" />
    </button>
  );
}
