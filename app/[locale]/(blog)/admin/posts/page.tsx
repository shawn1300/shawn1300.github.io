import { Link } from "@/i18n/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { DeletePostButton } from "@/components/admin/delete-post-button";
import type { Post } from "@/types";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";

export const dynamic = "force-dynamic";

type AdminPost = Post & {
  category: { name: string } | null;
};

export default async function AdminPostsPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.content" });
  const supabase = await createServerSupabase();

  const { data: posts, error } = await supabase
    .from("posts")
    .select(`
      *,
      category:categories(name)
    `)
    .order("updated_at", { ascending: false });

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-sm font-semibold text-foreground">{t("postsTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("loadFailed", { message: error.message })}</p>
      </div>
    );
  }

  const adminPosts = posts as AdminPost[] | null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-foreground">{t("postsTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("postsCount", { count: adminPosts?.length || 0 })}
          </p>
        </div>
        <Link href="/admin/posts/new">
          <Button size="sm" className="h-8 text-xs">{t("newPost")}</Button>
        </Link>
      </div>

      <div className="border border-border/40 rounded-lg overflow-hidden">
        {adminPosts && adminPosts.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">
                  {t("title")}
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs hidden sm:table-cell">
                  {t("status")}
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs hidden md:table-cell">
                  {t("category")}
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs hidden md:table-cell">
                  {t("updatedAt")}
                </th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs w-24">
                  {t("actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {adminPosts.map((post) => (
                <tr
                  key={post.id}
                  className="border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/posts/${post.id}`}
                      className="text-foreground hover:text-muted-foreground transition-colors"
                    >
                      {post.title || t("untitled")}
                    </Link>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <Badge
                      variant={post.status === "published" ? "default" : "secondary"}
                      className="text-[10px] h-5"
                    >
                      {post.status === "published" ? t("published") : t("draft")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                    {post.category?.name || "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                    {formatDate(post.updated_at, undefined, locale)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <DeletePostButton id={post.id} title={post.title || t("untitled")} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">{t("noPosts")}</p>
            <Link href="/admin/posts/new">
              <Button size="sm" variant="secondary" className="mt-4 h-8 text-xs">{t("firstPost")}</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
