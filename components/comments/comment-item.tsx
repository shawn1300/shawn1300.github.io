"use client";

import { useState, useEffect } from "react";
import { formatDate } from "@/lib/utils";
import type { Comment } from "@/types";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";

const TOKENS_KEY = "comment_delete_tokens";

interface CommentItemProps {
  comment: Comment;
  onDeleted: (id: string) => void;
}

export function CommentItem({ comment, onDeleted }: CommentItemProps) {
  const [deleting, setDeleting] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const locale = useLocale() as Locale;
  const t = useTranslations("Comments");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TOKENS_KEY);
      if (raw) {
        const tokens: Record<string, string> = JSON.parse(raw);
        if (tokens[comment.id]) setCanDelete(true);
      }
    } catch { /* ignore */ }
  }, [comment.id]);

  const handleDelete = async () => {
    if (!confirm(t("deleteConfirm"))) return;

    setDeleting(true);
    try {
      const raw = localStorage.getItem(TOKENS_KEY);
      const tokens: Record<string, string> = raw ? JSON.parse(raw) : {};
      const token = tokens[comment.id] || "";

      const res = await fetch(
        `/api/comments?id=${encodeURIComponent(comment.id)}&token=${encodeURIComponent(token)}`,
        { method: "DELETE" }
      );
      const json = await res.json();

      if (!json.success) throw new Error(json.error);

      // 清理 localStorage
      delete tokens[comment.id];
      localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));

      onDeleted(comment.id);
    } catch {
      // 令牌失效（换设备/清缓存），静默失败
      try {
        const raw = localStorage.getItem(TOKENS_KEY);
        const tokens: Record<string, string> = raw ? JSON.parse(raw) : {};
        delete tokens[comment.id];
        localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
        setCanDelete(false);
      } catch { /* ignore */ }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="py-4 border-b border-border last:border-b-0 animate-in fade-in slide-in-from-bottom-2 duration-300 group">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-sm font-medium text-foreground">
          {comment.author_name}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {formatDate(comment.created_at, undefined, locale)}
        </span>
        {canDelete && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-[10px] text-muted-foreground/50 hover:text-destructive transition-colors ml-auto opacity-0 group-hover:opacity-100"
          >
            {deleting ? "..." : t("delete")}
          </button>
        )}
      </div>
      <p className="text-sm text-foreground/75 leading-relaxed whitespace-pre-wrap">
        {comment.content}
      </p>
    </div>
  );
}
