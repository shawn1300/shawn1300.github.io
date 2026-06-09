import type { Metadata } from "next";
import Link from "next/link";
import { getAllPublishedPosts } from "@/lib/posts";
import { formatDate } from "@/lib/utils";
import type { Post } from "@/types";

export const metadata: Metadata = {
  title: "归档",
  description: "按时间线查看所有文章",
};

export const dynamic = "force-dynamic";

interface GroupedPosts {
  [year: string]: {
    [month: string]: Post[];
  };
}

export default async function ArchivePage() {
  const posts = await getAllPublishedPosts();

  // 按年份和月份分组
  const grouped: GroupedPosts = {};
  for (const post of posts) {
    const date = new Date(post.published_at || post.created_at);
    const year = date.getFullYear().toString();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");

    if (!grouped[year]) grouped[year] = {};
    if (!grouped[year][month]) grouped[year][month] = [];
    grouped[year][month].push(post);
  }

  const years = Object.keys(grouped).sort((a, b) => Number(b) - Number(a));
  const monthNames = [
    "一月", "二月", "三月", "四月", "五月", "六月",
    "七月", "八月", "九月", "十月", "十一月", "十二月",
  ];

  return (
    <div className="mx-auto max-w-2xl px-6 py-16 sm:py-24">
      <div className="mb-12 space-y-2">
        <h1 className="text-sm font-medium tracking-tight text-foreground">
          归档
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          按时间线查看所有文章，共 {posts.length} 篇。
        </p>
      </div>

      {years.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无文章</p>
      ) : (
        <div className="space-y-10">
          {years.map((year) => (
            <div key={year}>
              <h2 className="text-2xl font-bold text-foreground/20 mb-6 tracking-tight">
                {year}
              </h2>
              <div className="space-y-8">
                {Object.keys(grouped[year])
                  .sort((a, b) => Number(b) - Number(a))
                  .map((month) => (
                    <div key={month} className="space-y-3">
                      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {monthNames[Number(month) - 1]}
                      </h3>
                      <div className="space-y-2">
                        {grouped[year][month].map((post) => (
                          <Link
                            key={post.id}
                            href={`/posts/${post.slug}`}
                            className="flex items-baseline gap-4 group"
                          >
                            <time className="text-xs text-muted-foreground/60 w-10 shrink-0 tabular-nums">
                              {formatDate(
                                post.published_at || post.created_at,
                                "MM-dd"
                              )}
                            </time>
                            <span className="text-sm text-foreground group-hover:text-muted-foreground transition-colors leading-snug">
                              {post.title}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
