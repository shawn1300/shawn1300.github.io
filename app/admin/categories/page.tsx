"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { Category, Tag } from "@/types";

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  // 新建表单
  const [newCategory, setNewCategory] = useState("");
  const [newTag, setNewTag] = useState("");

  const supabase = createClient();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [catRes, tagRes] = await Promise.all([
      supabase.from("categories").select("*").order("name"),
      supabase.from("tags").select("*").order("name"),
    ]);
    if (catRes.data) setCategories(catRes.data);
    if (tagRes.data) setTags(tagRes.data);
    setLoading(false);
  };

  const slugify = (str: string) =>
    str
      .toLowerCase()
      .replace(/[\s]+/g, "-")
      .replace(/[^\w一-龥-]/g, "");

  const addCategory = async () => {
    if (!newCategory.trim()) return;
    const slug = slugify(newCategory);
    const { error } = await supabase
      .from("categories")
      .insert({ name: newCategory.trim(), slug });

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("分类已添加");
    setNewCategory("");
    loadData();
  };

  const deleteCategory = async (id: string) => {
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("分类已删除");
    loadData();
  };

  const addTag = async () => {
    if (!newTag.trim()) return;
    const slug = slugify(newTag);
    const { error } = await supabase
      .from("tags")
      .insert({ name: newTag.trim(), slug });

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("标签已添加");
    setNewTag("");
    loadData();
  };

  const deleteTag = async (id: string) => {
    const { error } = await supabase.from("tags").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("标签已删除");
    loadData();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-sm font-semibold text-foreground">分类与标签</h1>
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-sm font-semibold text-foreground">分类与标签</h1>
        <p className="text-sm text-muted-foreground mt-1">管理文章的分类和标签</p>
      </div>

      {/* 分类管理 */}
      <div className="space-y-4">
        <h2 className="text-sm font-medium text-foreground">分类</h2>
        <div className="flex gap-2">
          <Input
            placeholder="新分类名称"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCategory()}
            className="text-sm bg-transparent border-border/60 focus-visible:ring-0 focus-visible:border-ring h-9"
          />
          <Button
            onClick={addCategory}
            size="sm"
            className="h-9 text-xs"
            disabled={!newCategory.trim()}
          >
            添加
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <Badge
              key={cat.id}
              variant="secondary"
              className="gap-1.5 pr-1.5 cursor-default"
            >
              {cat.name}
              <button
                onClick={() => deleteCategory(cat.id)}
                className="text-muted-foreground hover:text-red-400 transition-colors ml-1"
                title="删除"
              >
                ×
              </button>
            </Badge>
          ))}
          {categories.length === 0 && (
            <p className="text-sm text-muted-foreground">暂无分类</p>
          )}
        </div>
      </div>

      <Separator className="bg-border/40" />

      {/* 标签管理 */}
      <div className="space-y-4">
        <h2 className="text-sm font-medium text-foreground">标签</h2>
        <div className="flex gap-2">
          <Input
            placeholder="新标签名称"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTag()}
            className="text-sm bg-transparent border-border/60 focus-visible:ring-0 focus-visible:border-ring h-9"
          />
          <Button
            onClick={addTag}
            size="sm"
            className="h-9 text-xs"
            disabled={!newTag.trim()}
          >
            添加
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <Badge
              key={tag.id}
              variant="secondary"
              className="gap-1.5 pr-1.5 cursor-default"
            >
              {tag.name}
              <button
                onClick={() => deleteTag(tag.id)}
                className="text-muted-foreground hover:text-red-400 transition-colors ml-1"
                title="删除"
              >
                ×
              </button>
            </Badge>
          ))}
          {tags.length === 0 && (
            <p className="text-sm text-muted-foreground">暂无标签</p>
          )}
        </div>
      </div>
    </div>
  );
}
