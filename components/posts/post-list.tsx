import { PostCard } from "@/components/posts/post-card";
import type { Locale } from "@/i18n/routing";
import type { Post } from "@/types";

interface PostListProps {
  posts: Post[];
  emptyMessage?: string;
  locale: Locale;
}

export function PostList({ posts, emptyMessage = "", locale }: PostListProps) {
  if (posts.length === 0) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/40">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} locale={locale} />
      ))}
    </div>
  );
}
