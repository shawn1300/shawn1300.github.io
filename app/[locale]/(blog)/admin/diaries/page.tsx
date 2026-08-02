import { Link } from "@/i18n/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { DeleteDiaryButton } from "@/components/admin/delete-diary-button";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";

export const dynamic = "force-dynamic";

export default async function AdminDiariesPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.content" });
  const supabase = await createServerSupabase();

  const { data: diaries } = await supabase
    .from("diaries")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-foreground">{t("diariesTitle")}</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {t("diariesCount", { count: diaries?.length || 0 })}
          </p>
        </div>
        <Link href="/admin/diaries/new">
          <Button size="sm" className="h-8 text-xs">
            {t("newDiary")}
          </Button>
        </Link>
      </div>

      <div className="border border-border/40 rounded-lg overflow-hidden">
        {diaries && diaries.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">
                  {t("title")}
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs hidden sm:table-cell">
                  {t("createdAt")}
                </th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs w-24">
                  {t("actions")}
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
                      {d.title || t("untitled")}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                    {formatDate(d.created_at, undefined, locale)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <DeleteDiaryButton id={d.id} title={d.title || t("untitled")} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">{t("noDiaries")}</p>
            <Link href="/admin/diaries/new">
              <Button
                size="sm"
                variant="secondary"
                className="mt-4 h-8 text-xs"
              >
                {t("firstDiary")}
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
