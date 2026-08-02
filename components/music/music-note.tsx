"use client";

import { MusicIcon } from "./music-icon";
import { cn } from "@/lib/utils";
import { useMusic } from "./music-context";
import { useTranslations } from "next-intl";

export function MusicNote({ onClick }: { onClick: () => void }) {
  const { isPlaying } = useMusic();
  const t = useTranslations("Music");

  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center size-7 rounded-md transition-colors",
        "text-muted-foreground hover:text-foreground hover:bg-muted",
        isPlaying && "text-primary [animation:spin-slow_3s_linear_infinite]"
      )}
      aria-label={t("player")}
      title={t("player")}
    >
      <MusicIcon className="size-4" />
    </button>
  );
}
