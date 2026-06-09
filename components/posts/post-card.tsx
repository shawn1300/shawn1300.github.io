import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { Post } from "@/types";

interface PostCardProps {
  post: Post;
}

export function PostCard({ post }: PostCardProps) {
  return (
    <article className="group border-b border-border py-8 last:border-b-0">
      <Link href={`/posts/${post.slug}`} className="block space-y-3">
        {/* Meta row */}
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
        <h2 className="text-lg font-medium text-foreground group-hover:text-muted-foreground transition-colors leading-snug">
          {post.title}
        </h2>

        {/* Excerpt */}
        {post.excerpt && (
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
            {post.excerpt}
          </p>
        )}

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {post.tags.map((tag) => (
              <Badge
                key={tag.id}
                variant="secondary"
                className="text-[11px] px-2 py-0 h-5 font-normal"
              >
                {tag.name}
              </Badge>
            ))}
          </div>
        )}
      </Link>
    </article>
  );
}
