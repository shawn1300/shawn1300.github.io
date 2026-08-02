import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { localizedAlternates } from "@/lib/i18n/metadata";
import { getCategoriesWithCount } from "@/lib/posts";

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Categories" });
  return { title: t("title"), description: t("description"), alternates: localizedAlternates(locale, "/categories") };
}

export const revalidate = 60;

export default async function CategoriesPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Categories" });
  const categories = await getCategoriesWithCount(locale);

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-12 sm:py-24">
      <div className="mb-12 space-y-2">
        <h1 className="text-sm font-medium tracking-tight text-foreground">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t("description")}
        </p>
      </div>

      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
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
                {t("postCount", { count: cat.count })}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
