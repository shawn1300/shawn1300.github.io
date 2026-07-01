"use client";

import { useEffect, useState, use } from "react";
import { notFound } from "next/navigation";
import { PostEditor } from "@/components/admin/post-editor";
import type { Post, Category, Tag } from "@/types";

interface EditPostPageProps {
  params: Promise<{ id: string }>;
}

export default function EditPostPage({ params }: EditPostPageProps) {
  const { id } = use(params);
  const [post, setPost] = useState<Post | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [metaRes, postRes] = await Promise.all([
          fetch("/api/admin-meta"),
          fetch(`/api/posts/${id}`),
        ]);

        const metaJson = await metaRes.json();
        const postJson = await postRes.json();

        if (metaJson.success) {
          setCategories(metaJson.data.categories);
          setTags(metaJson.data.tags);
        }

        if (postJson.success) {
          setPost(postJson.data);
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-5 w-20 bg-muted/50 rounded animate-pulse" />
          <div className="flex gap-2">
            <div className="h-8 w-16 bg-muted/50 rounded animate-pulse" />
            <div className="h-8 w-12 bg-muted/50 rounded animate-pulse" />
          </div>
        </div>
        <div className="space-y-3 p-4 border border-border rounded-lg bg-muted/50">
          <div className="h-9 bg-muted/30 rounded animate-pulse" />
          <div className="flex gap-3">
            <div className="h-8 flex-1 bg-muted/30 rounded animate-pulse" />
            <div className="h-8 flex-1 bg-muted/30 rounded animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="h-[60vh] bg-muted/30 rounded animate-pulse" />
          <div className="h-[60vh] bg-muted/30 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !post) {
    notFound();
  }

  return <PostEditor post={post} categories={categories} tags={tags} />;
}
