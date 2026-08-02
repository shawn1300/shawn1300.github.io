import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { localizedAlternates } from "@/lib/i18n/metadata";
import { getAllDiaries } from "@/lib/diaries";
import { formatDate } from "@/lib/utils";
import type { Diary } from "@/types";

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Diaries" });
  return { title: t("title"), description: t("description", { count: 0 }), alternates: localizedAlternates(locale, "/diaries") };
}

export const revalidate = 60;

interface GroupedDiaries {
  [year: string]: {
    [month: string]: Diary[];
  };
}

export default async function DiariesPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Diaries" });
  const diaries = await getAllDiaries(locale);

  // 按年份和月份分组
  const grouped: GroupedDiaries = {};
  for (const diary of diaries) {
    const date = new Date(diary.created_at);
    const year = date.getFullYear().toString();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");

    if (!grouped[year]) grouped[year] = {};
    if (!grouped[year][month]) grouped[year][month] = [];
    grouped[year][month].push(diary);
  }

  const years = Object.keys(grouped).sort((a, b) => Number(b) - Number(a));
  const monthNames = Array.from({ length: 12 }, (_, month) =>
    new Intl.DateTimeFormat(locale, { month: "long", timeZone: "Asia/Shanghai" }).format(new Date(Date.UTC(2024, month, 1)))
  );

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-12 sm:py-24">
      <div className="mb-12 space-y-2">
        <h1 className="text-sm font-medium tracking-tight text-foreground">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t("description", { count: diaries.length })}
        </p>
      </div>

      {years.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="space-y-10">
          {years.map((year) => (
            <div key={year}>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground/20 mb-4 sm:mb-6 tracking-tight">
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
                        {grouped[year][month].map((diary) => (
                          <Link
                            key={diary.id}
                            href={`/diaries/${diary.slug}`}
                            className="flex items-baseline gap-4 group"
                          >
                            <time className="text-xs text-muted-foreground/60 w-10 shrink-0 tabular-nums">
                              {formatDate(diary.created_at, "MM-dd", locale)}
                            </time>
                            <span className="text-sm text-foreground group-hover:text-muted-foreground transition-colors leading-snug">
                              {diary.title}
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
