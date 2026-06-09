import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        {/* Logo */}
        <Link
          href="/"
          className="text-sm font-medium tracking-tight text-foreground/90 hover:text-foreground transition-colors"
        >
          Shawn
        </Link>

        {/* Nav */}
        <nav className="flex items-center gap-4">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            文章
          </Link>
          <a
            href="/rss.xml"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            RSS
          </a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
