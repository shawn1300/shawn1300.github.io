import { PostCard } from "@/components/posts/post-card";
import type { Post } from "@/types";

interface PostListProps {
  posts: Post[];
  emptyMessage?: string;
}

export function PostList({ posts, emptyMessage = "还没有文章。" }: PostListProps) {
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
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}
