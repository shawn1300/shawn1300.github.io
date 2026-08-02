"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";

interface CommentRow {
  id: string;
  post_id: string;
  author_name: string;
  author_email: string | null;
  content: string;
  created_at: string;
  ip_address: string | null;
  post: { title: string; slug: string } | null;
}

export default function AdminCommentsPage() {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const locale = useLocale() as Locale;
  const t = useTranslations("Admin.content");

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch("/api/admin-comments");
      const json = await res.json();
      if (json.success) setComments(json.data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  const handleDelete = async (id: string) => {
    if (!confirm(t("deleteCommentConfirm"))) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/comments?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.success) { toast.error(json.error); return; }
      setComments((prev) => prev.filter((c) => c.id !== id));
      toast.success(t("deleted"));
    } catch {
      toast.error(t("deleteFailed"));
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-sm font-semibold text-foreground">{t("commentsTitle")}</h1>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-muted/30 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-sm font-semibold text-foreground">{t("commentsTitle")}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t("commentsCount", { count: comments.length })}
        </p>
      </div>

      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {t("noComments")}
        </p>
      ) : (
        <div className="space-y-0 border border-border/40 rounded-lg overflow-hidden">
          {comments.map((c) => (
            <div
              key={c.id}
              className="px-4 py-3 border-b border-border/40 last:border-b-0 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm font-medium text-foreground">
                      {c.author_name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDate(c.created_at, undefined, locale)}
                    </span>
                    {c.ip_address && (
                      <span className="text-[10px] text-muted-foreground/50 font-mono">
                        {c.ip_address}
                      </span>
                    )}
                    {c.post && (
                      <Link
                        href={`/posts/${c.post.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-muted-foreground/70 hover:text-foreground truncate max-w-[160px]"
                      >
                        {c.post.title}
                      </Link>
                    )}
                  </div>
                  <p className="text-sm text-foreground/75 leading-relaxed">
                    {c.content}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(c.id)}
                  disabled={deleting === c.id}
                  className="text-[10px] text-muted-foreground/50 hover:text-destructive transition-colors shrink-0 mt-0.5"
                >
                  {deleting === c.id ? "..." : t("delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
