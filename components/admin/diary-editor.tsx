"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownRenderer } from "@/components/posts/markdown-renderer";
import { toast } from "sonner";
import type { Diary } from "@/types";

interface DiaryEditorProps {
  diary?: Diary | null;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s]+/g, "-")
    .replace(/[^\w一-鿿-]/g, "")
    .slice(0, 100);
}

export function DiaryEditor({ diary }: DiaryEditorProps) {
  const router = useRouter();
  const isEditing = !!diary;

  const [title, setTitle] = useState(diary?.title || "");
  const [slug, setSlug] = useState(diary?.slug || "");
  const [content, setContent] = useState(diary?.content || "");
  const [saving, setSaving] = useState(false);

  // 根据标题自动生成 slug
  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!isEditing) {
      setSlug(slugify(val));
    }
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
  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("请输入标题");
      return;
    }
    if (!slug.trim()) {
      toast.error("slug 生成失败，请输入标题");
      return;
    }

    setSaving(true);

    try {
      const res = await fetch(
        isEditing ? `/api/diaries/${diary!.id}` : "/api/diaries",
        {
          method: isEditing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            slug: slug.trim(),
            content,
          }),
        }
      );

      const json = await res.json();

      if (!json.success) {
        toast.error(json.error || "保存失败");
        return;
      }

      toast.success("日记已保存");

      if (!isEditing) {
        router.push(`/admin/diaries/${json.data.id}`);
      }
      router.refresh();
    } catch {
      toast.error("保存失败，请重试");
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
            {isEditing ? "编辑日记" : "写日记"}
          </h1>
        </div>
        <Button
          size="sm"
          disabled={saving}
          onClick={handleSave}
          className="h-8 text-xs"
        >
          {saving ? "保存中..." : "保存"}
        </Button>
      </div>

      {/* 元数据区 */}
      <div className="space-y-3 p-4 border border-border rounded-lg bg-muted/50">
        <Input
          placeholder="日记标题"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          className="text-sm font-medium bg-transparent border-0 border-b border-border/40 rounded-none focus-visible:ring-0 focus-visible:border-ring px-0"
        />
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
                title="加粗"
              >
                B
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown("*", "*")}
                className="text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded transition-colors italic"
                title="斜体"
              >
                I
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown("[", "](url)")}
                className="text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded transition-colors"
                title="链接"
              >
                🔗
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown("\n```\n", "\n```\n")}
                className="text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded transition-colors"
                title="代码块"
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
                title="黄色高亮"
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
                title="红色文字"
              >
                🔴
              </button>
            </div>
          </div>
          <Textarea
            data-editor="markdown"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="开始写 Markdown..."
            className="min-h-[60vh] text-sm font-mono bg-muted/50 border-border focus-visible:ring-0 focus-visible:border-ring resize-none leading-relaxed"
          />
        </div>

        {/* 预览区 */}
        <div className="space-y-2">
          <span className="text-[11px] text-muted-foreground">预览</span>
          <div className="min-h-[60vh] border border-border rounded-lg p-6 bg-muted/50 overflow-y-auto">
            {content ? (
              <MarkdownRenderer content={content} />
            ) : (
              <p className="text-sm text-muted-foreground">
                在左侧输入 Markdown，这里会实时预览...
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
