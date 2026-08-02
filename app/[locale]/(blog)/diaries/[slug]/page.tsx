import { notFound } from "next/navigation";
import { getDiaryBySlug } from "@/lib/diaries";
import { MarkdownRenderer } from "@/components/posts/markdown-renderer";
import { formatDate } from "@/lib/utils";
import { TranslationPendingNotice } from "@/components/translation-pending-notice";
import { localizedAlternates } from "@/lib/i18n/metadata";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import type { Metadata } from "next";

interface DiaryPageProps {
  params: Promise<{ locale: Locale; slug: string }>;
}

export const revalidate = 60;

export async function generateMetadata({
  params,
}: DiaryPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "Diaries" });
  const diary = await getDiaryBySlug(slug, locale);

  if (!diary) {
    return { title: t("notFound") };
  }

  return {
    title: diary.title,
    description: diary.content.slice(0, 200),
    alternates: localizedAlternates(locale, `/diaries/${diary.slug}`),
  };
}

export default async function DiaryPage({ params }: DiaryPageProps) {
  const { locale, slug } = await params;
  const diary = await getDiaryBySlug(slug, locale);

  if (!diary) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-12 sm:py-24">
      <article>
        {locale !== "zh-CN" && diary.translation_pending && (
          <TranslationPendingNotice />
        )}
        <header className="mb-10 space-y-4">
          <time
            dateTime={diary.created_at}
            className="text-xs text-muted-foreground"
          >
            {formatDate(diary.created_at, undefined, locale)}
          </time>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground leading-tight">
            {diary.title}
          </h1>
        </header>

        <MarkdownRenderer content={diary.content} />
      </article>
    </div>
  );
}
