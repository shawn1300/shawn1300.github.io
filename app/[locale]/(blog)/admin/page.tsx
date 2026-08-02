import { createServerSupabase } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";

export const dynamic = "force-dynamic";

export default async function AdminDashboard({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.dashboard" });
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
    { label: t("publishedPosts"), value: publishedCount || 0 },
    { label: t("drafts"), value: draftCount || 0 },
    { label: t("comments"), value: commentCount || 0 },
    { label: t("categories"), value: categoryCount || 0 },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-sm font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("welcome")}</p>
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
