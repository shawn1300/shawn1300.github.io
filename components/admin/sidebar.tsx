"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const navItems = [
  { href: "/admin", label: "概览", exact: true },
  { href: "/admin/posts", label: "文章管理" },
  { href: "/admin/posts/new", label: "写文章" },
  { href: "/admin/diaries", label: "日记管理" },
  { href: "/admin/diaries/new", label: "写日记" },
  { href: "/admin/categories", label: "分类与标签" },
  { href: "/admin/gallery", label: "相册管理" },
  { href: "/admin/comments", label: "评论管理" },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
  };

  return (
    <aside className="w-56 border-r border-border bg-muted flex flex-col">
      <div className="px-5 py-4">
        <Link
          href="/admin"
          className="text-sm font-semibold tracking-tight text-foreground hover:text-muted-foreground transition-colors"
        >
          CMS
        </Link>
        <p className="text-[11px] text-muted-foreground mt-0.5">后台管理</p>
      </div>

      <Separator className="bg-border/40" />

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "block px-3 py-2 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-border/40">
        <Link
          href="/"
          target="_blank"
          className="block px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors mb-1"
        >
          → 查看博客
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="w-full justify-start text-sm text-muted-foreground hover:text-foreground h-8 px-3"
        >
          退出登录
        </Button>
      </div>
    </aside>
  );
}
