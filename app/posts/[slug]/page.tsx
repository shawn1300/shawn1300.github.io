import { notFound } from "next/navigation";
import { getPostBySlug } from "@/lib/posts";
import { MarkdownRenderer } from "@/components/posts/markdown-renderer";
import { CommentSection } from "@/components/comments/comment-section";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { Metadata } from "next";

interface PostPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) {
    return { title: "文章未找到" };
  }

  return {
    title: post.title,
    description: post.excerpt || post.title,
    openGraph: {
      title: post.title,
      description: post.excerpt || post.title,
      type: "article",
      publishedTime: post.published_at || post.created_at,
    },
  };
}

export default async function PostPage({ params }: PostPageProps) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-12 sm:py-24">
      <article>
        {/* Post header */}
        <header className="mb-10 space-y-4">
          {/* Meta */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <time dateTime={post.published_at || post.created_at}>
              {formatDate(post.published_at || post.created_at)}
            </time>
            {post.category && (
              <>
                <span className="text-border">/</span>
                <span>{post.category.name}</span>
              </>
            )}
          </div>

          {/* Title */}
          <h1 className="text-2xl font-semibold tracking-tight text-foreground leading-tight">
            {post.title}
          </h1>

          {/* Tags */}
          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <Badge key={tag.id} variant="secondary" className="text-[11px] font-normal">
                  {tag.name}
                </Badge>
              ))}
            </div>
          )}
        </header>

        {/* Cover image */}
        {post.cover_image && (
          <div className="mb-10 -mx-6 sm:mx-0">
            <img
              src={post.cover_image}
              alt={post.title}
              className="w-full rounded-lg"
            />
          </div>
        )}

        {/* Content */}
        <MarkdownRenderer content={post.content} />
      </article>

      {/* Divider */}
      <hr className="my-16 border-border/40" />

      {/* Comments */}
      <CommentSection postId={post.id} />
    </div>
  );
}
