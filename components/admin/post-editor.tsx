"use client";

import { useState, useCallback } from "react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MarkdownRenderer } from "@/components/posts/markdown-renderer";
import { toast } from "sonner";
import type { Post, Category, Tag } from "@/types";
import { useTranslations } from "next-intl";

interface PostEditorProps {
  post?: Post | null;
  categories: Category[];
  tags: Tag[];
}

export function PostEditor({ post, categories, tags }: PostEditorProps) {
  const router = useRouter();
  const isEditing = !!post;
  const t = useTranslations("Admin.editor");

  const [title, setTitle] = useState(post?.title || "");
  const [slug, setSlug] = useState(post?.slug || "");
  const [content, setContent] = useState(post?.content || "");
  const [excerpt, setExcerpt] = useState(post?.excerpt || "");
  const [coverImage, setCoverImage] = useState(post?.cover_image || "");
  const [categoryId, setCategoryId] = useState(post?.category_id || "");
  const [selectedTags, setSelectedTags] = useState<string[]>(
    post?.tags?.map((t) => t.id) || []
  );
  const status = post?.status || "draft";
  const [saving, setSaving] = useState(false);

  // 根据标题自动生成 slug
  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!isEditing) {
      setSlug(
        val
          .toLowerCase()
          .replace(/[\s]+/g, "-")
          .replace(/[^\w一-龥-]/g, "")
          .slice(0, 100)
      );
    }
  };

  // 切换标签
  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  // 插入 Markdown 语法
  const insertMarkdown = useCallback(
    (before: string, after = "") => {
      const textarea = document.querySelector<HTMLTextAreaElement>(
        '[data-editor="markdown"]'
      );
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = content.slice(start, end);
      const newContent =
        content.slice(0, start) +
        before +
        selected +
        after +
        content.slice(end);

      setContent(newContent);

      // 恢复光标位置
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(
          start + before.length,
          end + before.length
        );
      });
    },
    [content]
  );

  // 保存
  const handleSave = async (publishStatus?: "draft" | "published") => {
    if (!title.trim()) {
      toast.error(t("postTitleRequired"));
      return;
    }
    if (!slug.trim()) {
      toast.error(t("slugRequired"));
      return;
    }

    setSaving(true);
    const finalStatus = publishStatus || status;

    try {
      const res = await fetch(
        isEditing ? `/api/posts/${post!.id}` : "/api/posts",
        {
          method: isEditing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            slug: slug.trim(),
            content,
            excerpt: excerpt.trim(),
            cover_image: coverImage.trim() || null,
            category_id: categoryId || null,
            tags: selectedTags,
            status: finalStatus,
          }),
        }
      );

      const json = await res.json();

      if (!json.success) {
        toast.error(t("saveFailed"));
        return;
      }

      toast.success(
        finalStatus === "published" ? t("postPublished") : t("draftSaved")
      );

      if (!isEditing) {
        router.push(`/admin/posts/${json.data.id}`);
      }
      router.refresh();
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 顶部操作栏（sticky 在博客 Header 下方，滚动时保持可见） */}
      <div className="sticky top-14 z-30 -mx-4 px-4 md:-mx-8 md:px-8 py-3 bg-background/95 backdrop-blur border-b border-border/40 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-foreground">
            {isEditing ? t("editPost") : t("createPost")}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => handleSave("draft")}
            className="h-8 text-xs"
          >
            {t("saveDraft")}
          </Button>
          <Button
            size="sm"
            disabled={saving}
            onClick={() => handleSave("published")}
            className="h-8 text-xs"
          >
            {saving ? t("saving") : t("publish")}
          </Button>
        </div>
      </div>

      {/* 元数据区 */}
      <div className="space-y-3 p-4 border border-border rounded-lg bg-muted/50">
        <Input
          placeholder={t("postTitle")}
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          className="text-sm font-medium bg-transparent border-0 border-b border-border/40 rounded-none focus-visible:ring-0 focus-visible:border-ring px-0"
        />
        <div className="flex gap-3">
          <Input
            placeholder={t("slug")}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="flex-1 text-xs bg-transparent border-border/60 focus-visible:ring-0 focus-visible:border-ring h-8"
          />
          <Input
            placeholder={t("coverUrl")}
            value={coverImage}
            onChange={(e) => setCoverImage(e.target.value)}
            className="flex-1 text-xs bg-transparent border-border/60 focus-visible:ring-0 focus-visible:border-ring h-8"
          />
        </div>
        <Textarea
          placeholder={t("excerpt")}
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          rows={2}
          className="text-xs bg-transparent border-border/60 focus-visible:ring-0 focus-visible:border-ring resize-none"
        />

        {/* 分类 */}
        <div>
          <p className="text-[11px] text-muted-foreground mb-2">{t("category")}</p>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full text-xs bg-transparent border border-border/60 rounded-md px-3 py-1.5 text-foreground focus:outline-none focus:border-ring"
          >
            <option value="">{t("noCategory")}</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {/* 标签 */}
        <div>
          <p className="text-[11px] text-muted-foreground mb-2">{t("tags")}</p>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Badge
                key={tag.id}
                variant={selectedTags.includes(tag.id) ? "default" : "secondary"}
                className="cursor-pointer text-[10px] h-5 transition-colors"
                onClick={() => toggleTag(tag.id)}
              >
                {tag.name}
              </Badge>
            ))}
            {tags.length === 0 && (
              <span className="text-[11px] text-muted-foreground">
                {t("noTags")}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 分屏编辑器 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 编辑区 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Markdown</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => insertMarkdown("**", "**")}
                className="text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded transition-colors"
                title={t("bold")}
              >
                B
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown("*", "*")}
                className="text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded transition-colors italic"
                title={t("italic")}
              >
                I
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown("[", "](url)")}
                className="text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded transition-colors"
                title={t("link")}
              >
                🔗
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown("\n```\n", "\n```\n")}
                className="text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded transition-colors"
                title={t("codeBlock")}
              >
                &lt;/&gt;
              </button>
              <button
                type="button"
                onClick={() =>
                  insertMarkdown(
                    '<span style="background-color: #fbbf24; color: #1e293b; padding: 1px 4px; border-radius: 2px;">',
                    "</span>"
                  )
                }
                className="text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded transition-colors"
                title={t("yellowHighlight")}
              >
                🖍
              </button>
              <button
                type="button"
                onClick={() =>
                  insertMarkdown(
                    '<span style="color: #ef4444; font-weight: 600;">',
                    "</span>"
                  )
                }
                className="text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded transition-colors"
                title={t("redText")}
              >
                🔴
              </button>
            </div>
          </div>
          <Textarea
            data-editor="markdown"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t("markdownPlaceholder")}
            className="min-h-[60vh] text-sm font-mono bg-muted/50 border-border focus-visible:ring-0 focus-visible:border-ring resize-none leading-relaxed"
          />
        </div>

        {/* 预览区 */}
        <div className="space-y-2">
          <span className="text-[11px] text-muted-foreground">{t("preview")}</span>
          <div className="min-h-[60vh] border border-border rounded-lg p-6 bg-muted/50 overflow-y-auto">
            {content ? (
              <MarkdownRenderer content={content} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("previewEmpty")}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
