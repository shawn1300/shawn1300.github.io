import { getPublishedPosts, getCategories } from "@/lib/posts";
import { PostList } from "@/components/posts/post-list";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import type { Metadata } from "next";
import { localizedAlternates } from "@/lib/i18n/metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Common" });
  return { title: t("siteName"), description: t("siteDescription"), alternates: localizedAlternates(locale, "/") };
}

export default async function HomePage({
  searchParams,
  params,
}: {
  searchParams: Promise<{ category?: string }>;
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  const { category } = await searchParams;
  const t = await getTranslations({ locale, namespace: "Home" });
  const common = await getTranslations({ locale, namespace: "Common" });
  const posts = await getPublishedPosts({
    limit: 50,
    locale,
    ...(category ? { categorySlug: category } : {}),
  });

  // 获取分类名用于展示
  const categories = category ? await getCategories(locale) : [];
  const categoryName =
    category && categories.find((c) => c.slug === category)?.name;

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-12 sm:py-24">
      {/* Page header */}
      <div className="mb-12 space-y-2">
        <h1 className="text-sm font-medium tracking-tight text-foreground">
          {categoryName
            ? t("categoryTitle", { name: categoryName })
            : common("siteName")}
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {category
            ? posts.length > 0
              ? t("categoryHasPosts", { name: categoryName ?? "" })
              : t("categoryEmpty")
            : common("siteDescription")}
        </p>
      </div>

      {/* Post list */}
      {posts.length > 0 ? (
        <PostList posts={posts} locale={locale} />
      ) : category ? (
        <p className="text-sm text-muted-foreground">
          {t("browseOtherCategories")}
        </p>
      ) : null}
    </div>
  );
}
