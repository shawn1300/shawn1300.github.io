import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCategories, getTags } from "@/lib/posts";
import { PostEditor } from "@/components/admin/post-editor";
import type { Post } from "@/types";

export const dynamic = "force-dynamic";

interface EditPostPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditPostPage({ params }: EditPostPageProps) {
  const { id } = await params;
  const supabase = await createServerSupabase();

  // 获取文章
  const { data: post, error } = await supabase
    .from("posts")
    .select(`
      *,
      category:categories(*)
    `)
    .eq("id", id)
    .single();

  if (error || !post) {
    notFound();
  }

  // 获取标签关联
  const { data: tagRelations } = await supabase
    .from("post_tags")
    .select("tag_id")
    .eq("post_id", id);

  let tags: Post["tags"] = [];
  if (tagRelations && tagRelations.length > 0) {
    const { data: tagData } = await supabase
      .from("tags")
      .select("*")
      .in("id", tagRelations.map((t) => t.tag_id));
    tags = tagData || [];
  }

  const [categories, allTags] = await Promise.all([getCategories(), getTags()]);

  return (
    <PostEditor
      post={{ ...post, tags } as Post}
      categories={categories}
      tags={allTags}
    />
  );
}
