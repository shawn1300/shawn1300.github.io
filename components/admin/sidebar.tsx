"use client";

import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useTranslations } from "next-intl";

const navItems = [
  { href: "/admin", label: "dashboard", exact: true },
  { href: "/admin/posts", label: "posts" },
  { href: "/admin/posts/new", label: "newPost" },
  { href: "/admin/diaries", label: "diaries" },
  { href: "/admin/diaries/new", label: "newDiary" },
  { href: "/admin/categories", label: "categories" },
  { href: "/admin/gallery", label: "gallery" },
  { href: "/admin/comments", label: "comments" },
  { href: "/admin/translations", label: "translations" },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("Admin.sidebar");

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
  };

  const isItemActive = (item: (typeof navItems)[number]) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  return (
    <>
      {/* 移动端：顶部横向导航 */}
      <div className="md:hidden border-b border-border bg-background">
        <div className="flex items-center justify-between px-4 pt-3">
          <span className="text-sm font-semibold text-foreground">
            CMS
          </span>
          <div className="flex items-center gap-1">
            <Link
              href="/"
              target="_blank"
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
            >
              {t("backToBlog")}
            </Link>
            <button
              onClick={handleLogout}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
            >
              {t("logout")}
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 py-2 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "shrink-0 px-3 py-1.5 rounded-md text-xs whitespace-nowrap transition-colors",
                isItemActive(item)
                  ? "bg-muted text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t(item.label)}
            </Link>
          ))}
        </nav>
      </div>

      {/* 桌面端：左侧固定侧栏（sticky 在博客 Header 下方，滚动时始终可见） */}
      <aside className="hidden md:flex w-56 border-r border-border bg-muted flex-col sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto shrink-0">
        <div className="px-5 py-4">
          <Link
            href="/admin"
            className="text-sm font-semibold tracking-tight text-foreground hover:text-muted-foreground transition-colors"
          >
            CMS
          </Link>
          <p className="text-[11px] text-muted-foreground mt-0.5">{t("dashboard")}</p>
        </div>

        <Separator className="bg-border/40" />

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "block px-3 py-2 rounded-md text-sm transition-colors",
                isItemActive(item)
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {t(item.label)}
            </Link>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-border/40">
          <Link
            href="/"
            target="_blank"
            className="block px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors mb-1"
          >
            → {t("backToBlog")}
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="w-full justify-start text-sm text-muted-foreground hover:text-foreground h-8 px-3"
          >
            {t("logout")}
          </Button>
        </div>
      </aside>
    </>
  );
}
