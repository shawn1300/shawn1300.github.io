import { getCategories, getTags } from "@/lib/posts";
import { PostEditor } from "@/components/admin/post-editor";

export const dynamic = "force-dynamic";

export default async function NewPostPage() {
  const [categories, tags] = await Promise.all([getCategories(), getTags()]);

  return <PostEditor post={null} categories={categories} tags={tags} />;
}
