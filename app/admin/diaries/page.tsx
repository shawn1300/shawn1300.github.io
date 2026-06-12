import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { DeleteDiaryButton } from "@/components/admin/delete-diary-button";

export const dynamic = "force-dynamic";

export default async function AdminDiariesPage() {
  const supabase = await createServerSupabase();

  const { data: diaries } = await supabase
    .from("diaries")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-foreground">日记管理</h1>
          <p className="text-xs text-muted-foreground mt-1">
            共 {diaries?.length || 0} 篇日记
          </p>
        </div>
        <Link href="/admin/diaries/new">
          <Button size="sm" className="h-8 text-xs">
            写日记
          </Button>
        </Link>
      </div>

      <div className="border border-border/40 rounded-lg overflow-hidden">
        {diaries && diaries.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">
                  标题
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs hidden sm:table-cell">
                  创建时间
                </th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs w-24">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {diaries.map((d) => (
                <tr
                  key={d.id}
                  className="border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/diaries/${d.id}`}
                      className="text-foreground hover:text-muted-foreground transition-colors"
                    >
                      {d.title || "无标题"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                    {formatDate(d.created_at)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <DeleteDiaryButton id={d.id} title={d.title || "无标题"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">还没有日记</p>
            <Link href="/admin/diaries/new">
              <Button
                size="sm"
                variant="secondary"
                className="mt-4 h-8 text-xs"
              >
                写第一篇日记
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
