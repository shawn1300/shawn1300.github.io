import { notFound } from "next/navigation";
import { getDiaryBySlug } from "@/lib/diaries";
import { MarkdownRenderer } from "@/components/posts/markdown-renderer";
import { formatDate } from "@/lib/utils";
import type { Metadata } from "next";

interface DiaryPageProps {
  params: Promise<{ slug: string }>;
}

export const revalidate = 60;

export async function generateMetadata({
  params,
}: DiaryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const diary = await getDiaryBySlug(slug);

  if (!diary) {
    return { title: "日记未找到" };
  }

  return {
    title: diary.title,
    description: diary.content.slice(0, 200),
  };
}

export default async function DiaryPage({ params }: DiaryPageProps) {
  const { slug } = await params;
  const diary = await getDiaryBySlug(slug);

  if (!diary) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-12 sm:py-24">
      <article>
        <header className="mb-10 space-y-4">
          <time
            dateTime={diary.created_at}
            className="text-xs text-muted-foreground"
          >
            {formatDate(diary.created_at)}
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
