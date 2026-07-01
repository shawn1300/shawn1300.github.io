import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const supabase = await createServerSupabase();

  // 获取统计数据
  const { count: publishedCount } = await supabase
    .from("posts")
    .select("*", { count: "exact", head: true })
    .eq("status", "published");

  const { count: draftCount } = await supabase
    .from("posts")
    .select("*", { count: "exact", head: true })
    .eq("status", "draft");

  const { count: commentCount } = await supabase
    .from("comments")
    .select("*", { count: "exact", head: true });

  const { count: categoryCount } = await supabase
    .from("categories")
    .select("*", { count: "exact", head: true });

  const stats = [
    { label: "已发布", value: publishedCount || 0 },
    { label: "草稿", value: draftCount || 0 },
    { label: "评论", value: commentCount || 0 },
    { label: "分类", value: categoryCount || 0 },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-sm font-semibold text-foreground">概览</h1>
        <p className="text-sm text-muted-foreground mt-1">博客数据一览</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="border border-border/40 rounded-lg p-4 space-y-1"
          >
            <p className="text-[11px] text-muted-foreground">{stat.label}</p>
            <p className="text-2xl font-semibold text-foreground">
              {stat.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
