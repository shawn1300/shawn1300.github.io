"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { Category, Tag } from "@/types";
import { useTranslations } from "next-intl";

function slugify(str: string): string {
  const s = str
    .trim()
    .toLowerCase()
    .replace(/[\s/_.]+/g, "-")
    .replace(/[^\w一-鿿-]/g, "");
  // 去掉首尾连字符
  return s.replace(/^-+|-+$/g, "");
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const t = useTranslations("Admin.taxonomy");

  // 新建表单
  const [newCategory, setNewCategory] = useState("");
  const [catSlug, setCatSlug] = useState("");
  const [newTag, setNewTag] = useState("");
  const [tagSlug, setTagSlug] = useState("");

  const supabase = useMemo(() => createClient(), []);

  // 实时预览 slug（用户未手动修改时跟随名称变化）
  const [catSlugManual, setCatSlugManual] = useState(false);
  const [tagSlugManual, setTagSlugManual] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [catRes, tagRes] = await Promise.all([
      supabase.from("categories").select("*").order("name"),
      supabase.from("tags").select("*").order("name"),
    ]);
    if (catRes.data) setCategories(catRes.data);
    if (tagRes.data) setTags(tagRes.data);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  const addCategory = async () => {
    if (!newCategory.trim()) return;
    const slug = catSlug.trim() || slugify(newCategory);
    if (!slug) { toast.error(t("slugRequired")); return; }
    const { error } = await supabase
      .from("categories")
      .insert({ name: newCategory.trim(), slug });

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("categoryAdded"));
    setNewCategory("");
    setCatSlug("");
    setCatSlugManual(false);
    loadData();
  };

  const deleteCategory = async (id: string) => {
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("categoryDeleted"));
    loadData();
  };

  const addTag = async () => {
    if (!newTag.trim()) return;
    const slug = tagSlug.trim() || slugify(newTag);
    if (!slug) { toast.error(t("slugRequired")); return; }
    const { error } = await supabase
      .from("tags")
      .insert({ name: newTag.trim(), slug });

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("tagAdded"));
    setNewTag("");
    setTagSlug("");
    setTagSlugManual(false);
    loadData();
  };

  const deleteTag = async (id: string) => {
    const { error } = await supabase.from("tags").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("tagDeleted"));
    loadData();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-sm font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-sm font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("description")}</p>
      </div>

      {/* 分类管理 */}
      <div className="space-y-4">
        <h2 className="text-sm font-medium text-foreground">{t("category")}</h2>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Input
              placeholder={t("categoryPlaceholder")}
              value={newCategory}
              onChange={(e) => {
                const v = e.target.value;
                setNewCategory(v);
                if (!catSlugManual) setCatSlug(slugify(v));
              }}
              className="text-sm bg-transparent border-border/60 focus-visible:ring-0 focus-visible:border-ring h-9 flex-[2]"
            />
            <Button
              onClick={addCategory}
              size="sm"
              className="h-9 text-xs"
              disabled={!newCategory.trim()}
            >
              {t("add")}
            </Button>
          </div>
          {newCategory.trim() && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground shrink-0">slug:</span>
              <Input
                placeholder="auto"
                value={catSlug}
                onChange={(e) => { setCatSlug(e.target.value); setCatSlugManual(true); }}
                onKeyDown={(e) => e.key === "Enter" && addCategory()}
                className="text-xs bg-transparent border-border/40 focus-visible:ring-0 focus-visible:border-ring h-7 font-mono"
              />
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <Badge
              key={cat.id}
              variant="secondary"
              className="gap-1.5 pr-1.5 cursor-default"
            >
              {cat.name}
              <span className="text-[10px] text-muted-foreground/60 ml-0.5">/{cat.slug}</span>
              <button
                onClick={() => deleteCategory(cat.id)}
                className="text-muted-foreground hover:text-red-400 transition-colors ml-1"
                title={t("delete")}
              >
                ×
              </button>
            </Badge>
          ))}
          {categories.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("emptyCategories")}</p>
          )}
        </div>
      </div>

      <Separator className="bg-border/40" />

      {/* 标签管理 */}
      <div className="space-y-4">
        <h2 className="text-sm font-medium text-foreground">{t("tag")}</h2>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Input
              placeholder={t("tagPlaceholder")}
              value={newTag}
              onChange={(e) => {
                const v = e.target.value;
                setNewTag(v);
                if (!tagSlugManual) setTagSlug(slugify(v));
              }}
              className="text-sm bg-transparent border-border/60 focus-visible:ring-0 focus-visible:border-ring h-9 flex-[2]"
            />
            <Button
              onClick={addTag}
              size="sm"
              className="h-9 text-xs"
              disabled={!newTag.trim()}
            >
              {t("add")}
            </Button>
          </div>
          {newTag.trim() && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground shrink-0">slug:</span>
              <Input
                placeholder="auto"
                value={tagSlug}
                onChange={(e) => { setTagSlug(e.target.value); setTagSlugManual(true); }}
                onKeyDown={(e) => e.key === "Enter" && addTag()}
                className="text-xs bg-transparent border-border/40 focus-visible:ring-0 focus-visible:border-ring h-7 font-mono"
              />
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <Badge
              key={tag.id}
              variant="secondary"
              className="gap-1.5 pr-1.5 cursor-default"
            >
              {tag.name}
              <span className="text-[10px] text-muted-foreground/60 ml-0.5">/{tag.slug}</span>
              <button
                onClick={() => deleteTag(tag.id)}
                className="text-muted-foreground hover:text-red-400 transition-colors ml-1"
                title={t("delete")}
              >
                ×
              </button>
            </Badge>
          ))}
          {tags.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("emptyTags")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
