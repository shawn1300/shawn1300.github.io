"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ThemeToggle } from "@/components/theme-toggle";
import { MusicPlayer } from "@/components/music/music-player";
import { SearchDialog } from "@/components/search/search-dialog";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "home" },
  { href: "/categories", label: "categories" },
  { href: "/archive", label: "archive" },
  { href: "/diaries", label: "diaries" },
  { href: "/gallery", label: "gallery" },
  { href: "/friends", label: "friends" },
  { href: "/about", label: "about" },
] as const;

function NavLinks({
  pathname,
  onClick,
  mobile = false,
}: {
  pathname: string;
  onClick?: () => void;
  mobile?: boolean;
}) {
  const t = useTranslations("Navigation");

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
              // 移动端加大触控区域
              mobile && "block py-2.5 px-2 rounded-md active:bg-muted",
              isActive
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t(item.label)}
          </Link>
        );
      })}
    </>
  );
}

export function Header() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const t = useTranslations("Navigation");

  return (
    <>
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
            {/* 搜索按钮 */}
            <button
              onClick={() =>
                document.dispatchEvent(new CustomEvent("search:toggle"))
              }
              className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
              aria-label={t("search")}
              title={`${t("search")} (Ctrl+K)`}
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </button>
            <MusicPlayer />
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </nav>

        {/* Mobile: search + theme toggle + hamburger */}
        <div className="flex items-center gap-2 sm:hidden">
          <button
            onClick={() =>
              document.dispatchEvent(new CustomEvent("search:toggle"))
            }
            className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t("search")}
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </button>
          <MusicPlayer />
          <LanguageSwitcher />
          <ThemeToggle />
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t("menu")}
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
          <div className="flex flex-col px-3 py-2">
            <NavLinks pathname={pathname} onClick={() => setMenuOpen(false)} mobile />
          </div>
        </nav>
      )}
    </header>
    <SearchDialog />
    </>
  );
}
