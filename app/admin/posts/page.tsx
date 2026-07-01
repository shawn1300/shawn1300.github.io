import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { DeletePostButton } from "@/components/admin/delete-post-button";
import type { Post } from "@/types";

export const dynamic = "force-dynamic";

type AdminPost = Post & {
  category: { name: string } | null;
};

export default async function AdminPostsPage() {
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
        <h1 className="text-sm font-semibold text-foreground">文章管理</h1>
        <p className="text-sm text-muted-foreground">加载失败: {error.message}</p>
      </div>
    );
  }

  const adminPosts = posts as AdminPost[] | null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-foreground">文章管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            共 {adminPosts?.length || 0} 篇文章
          </p>
        </div>
        <Link href="/admin/posts/new">
          <Button size="sm" className="h-8 text-xs">新建文章</Button>
        </Link>
      </div>

      <div className="border border-border/40 rounded-lg overflow-hidden">
        {adminPosts && adminPosts.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">
                  标题
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs hidden sm:table-cell">
                  状态
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs hidden md:table-cell">
                  分类
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs hidden md:table-cell">
                  更新于
                </th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs w-24">
                  操作
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
                      {post.title || "无标题"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <Badge
                      variant={post.status === "published" ? "default" : "secondary"}
                      className="text-[10px] h-5"
                    >
                      {post.status === "published" ? "已发布" : "草稿"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                    {post.category?.name || "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                    {formatDate(post.updated_at)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <DeletePostButton id={post.id} title={post.title || "无标题"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">还没有文章</p>
            <Link href="/admin/posts/new">
              <Button size="sm" variant="secondary" className="mt-4 h-8 text-xs">写第一篇文章</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
