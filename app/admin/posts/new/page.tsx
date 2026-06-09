"use client";

import { useEffect, useState } from "react";
import { PostEditor } from "@/components/admin/post-editor";
import type { Category, Tag } from "@/types";

export default function NewPostPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMeta() {
      try {
        const res = await fetch("/api/admin-meta");
        const json = await res.json();
        if (json.success) {
          setCategories(json.data.categories);
          setTags(json.data.tags);
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
    fetchMeta();
  }, []);

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

  return <PostEditor post={null} categories={categories} tags={tags} />;
}
