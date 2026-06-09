import type { Metadata } from "next";
import Link from "next/link";
import { getCategoriesWithCount } from "@/lib/posts";

export const metadata: Metadata = {
  title: "分类",
  description: "按分类浏览文章",
};

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const categories = await getCategoriesWithCount();

  return (
    <div className="mx-auto max-w-2xl px-6 py-16 sm:py-24">
      <div className="mb-12 space-y-2">
        <h1 className="text-sm font-medium tracking-tight text-foreground">
          分类
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          按分类浏览文章。
        </p>
      </div>

      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无分类</p>
      ) : (
        <div className="space-y-1">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/?category=${cat.slug}`}
              className="flex items-center justify-between py-3 px-4 rounded-lg border border-border/40 hover:border-border hover:bg-muted/50 transition-colors"
            >
              <span className="text-sm text-foreground">{cat.name}</span>
              <span className="text-xs text-muted-foreground">
                {cat.count} 篇
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
