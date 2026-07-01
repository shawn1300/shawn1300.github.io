"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { MusicPlayer } from "@/components/music/music-player";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "首页" },
  { href: "/categories", label: "分类" },
  { href: "/archive", label: "归档" },
  { href: "/diaries", label: "日记" },
  { href: "/gallery", label: "相册" },
  { href: "/friends", label: "友链" },
  { href: "/about", label: "关于" },
];

function NavLinks({
  pathname,
  onClick,
}: {
  pathname: string;
  onClick?: () => void;
}) {
  return (
    <>
      {navItems.map((item) => {
        const isActive =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClick}
            className={cn(
              "text-sm transition-colors",
              isActive
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export function Header() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2.5 text-sm font-medium tracking-tight text-foreground/90 hover:text-foreground transition-colors shrink-0"
        >
          <img
            src="/shawn.jpg"
            alt="Shawn"
            className="h-6 w-6 rounded-full object-cover ring-1 ring-border/40"
          />
          Shawn
        </Link>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-6">
          <NavLinks pathname={pathname} />
          <div className="flex items-center gap-2">
            <MusicPlayer />
            <ThemeToggle />
          </div>
        </nav>

        {/* Mobile: theme toggle + hamburger */}
        <div className="flex items-center gap-2 sm:hidden">
          <MusicPlayer />
          <ThemeToggle />
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
            aria-label="菜单"
          >
            <svg
              className={cn("h-4 w-4 transition-transform", menuOpen && "rotate-90")}
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              {menuOpen ? (
                <path d="M4 4l8 8M12 4l-8 8" />
              ) : (
                <path d="M2 4h12M2 8h12M2 12h12" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <nav className="sm:hidden border-t border-border/40 bg-background/95 backdrop-blur">
          <div className="flex flex-col px-4 py-3 space-y-1">
            <NavLinks pathname={pathname} onClick={() => setMenuOpen(false)} />
          </div>
        </nav>
      )}
    </header>
  );
}
