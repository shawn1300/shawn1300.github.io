import { getPublishedPosts } from "@/lib/posts";
import { PostList } from "@/components/posts/post-list";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const posts = await getPublishedPosts({ limit: 50 });

  return (
    <div className="mx-auto max-w-2xl px-6 py-16 sm:py-24">
      {/* Page header */}
      <div className="mb-12 space-y-2">
        <h1 className="text-sm font-medium tracking-tight text-foreground">
          Shawn&apos;s Blog
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Thoughts on code, design, and building things.
        </p>
      </div>

      {/* Post list */}
      <PostList posts={posts} />
    </div>
  );
}
