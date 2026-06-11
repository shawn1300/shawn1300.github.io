import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { Post } from "@/types";

interface PostCardProps {
  post: Post;
}

export function PostCard({ post }: PostCardProps) {
  const hasCover = !!post.cover_image;

  return (
    <article
      className={`group relative overflow-hidden rounded-xl border border-border/40 transition-colors ${
        hasCover ? "min-h-[240px]" : "border-b border-border py-8 last:border-b-0 rounded-none border-0"
      }`}
    >
      {hasCover && (
        <>
          {/* 背景图 */}
          <img
            src={post.cover_image!}
            alt=""
            className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          {/* 暗色渐变遮罩 */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-black/30" />
        </>
      )}

      <Link
        href={`/posts/${post.slug}`}
        className={`relative z-10 block ${
          hasCover ? "flex flex-col justify-end h-full p-6 sm:p-8" : "space-y-3"
        }`}
      >
        {/* Meta row */}
        <div
          className={`flex items-center gap-3 text-xs ${
            hasCover ? "text-white/70" : "text-muted-foreground"
          }`}
        >
          <time dateTime={post.published_at || post.created_at}>
            {formatDate(post.published_at || post.created_at)}
          </time>
          {post.category && (
            <>
              <span className={hasCover ? "text-white/30" : "text-border"}>/</span>
              <span>{post.category.name}</span>
            </>
          )}
        </div>

        {/* Title */}
        <h2
          className={`text-lg font-medium transition-colors leading-snug ${
            hasCover
              ? "text-white group-hover:text-white/80"
              : "text-foreground group-hover:text-muted-foreground"
          }`}
        >
          {post.title}
        </h2>

        {/* Excerpt */}
        {post.excerpt && (
          <p
            className={`text-sm leading-relaxed line-clamp-2 ${
              hasCover ? "text-white/70" : "text-muted-foreground"
            }`}
          >
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
                className={`text-[11px] px-2 py-0 h-5 font-normal ${
                  hasCover ? "bg-white/15 text-white/80 border-white/10" : ""
                }`}
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
