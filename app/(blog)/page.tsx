import { getPublishedPosts, getCategories } from "@/lib/posts";
import { PostList } from "@/components/posts/post-list";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const posts = await getPublishedPosts({
    limit: 50,
    ...(category ? { categorySlug: category } : {}),
  });

  // 获取分类名用于展示
  const categories = category ? await getCategories() : [];
  const categoryName =
    category && categories.find((c) => c.slug === category)?.name;

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-12 sm:py-24">
      {/* Page header */}
      <div className="mb-12 space-y-2">
        <h1 className="text-sm font-medium tracking-tight text-foreground">
          {categoryName ? `分类：${categoryName}` : "Shawn's Blog"}
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {category
            ? posts.length > 0
              ? `${categoryName} 下的文章`
              : "该分类下暂无文章"
            : "Thoughts on code, design, and building things."}
        </p>
      </div>

      {/* Post list */}
      {posts.length > 0 ? (
        <PostList posts={posts} />
      ) : category ? (
        <p className="text-sm text-muted-foreground">
          还没有文章，看看其他分类吧。
        </p>
      ) : null}
    </div>
  );
}
