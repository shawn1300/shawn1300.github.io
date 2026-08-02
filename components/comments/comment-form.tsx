"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { Comment } from "@/types";
import { useTranslations } from "next-intl";

const TOKENS_KEY = "comment_delete_tokens";

interface CommentFormProps {
  postId: string;
  onCommentAdded: (comment: Comment) => void;
}

function saveDeleteToken(commentId: string, token: string) {
  try {
    const raw = localStorage.getItem(TOKENS_KEY);
    const tokens: Record<string, string> = raw ? JSON.parse(raw) : {};
    tokens[commentId] = token;
    localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  } catch { /* ignore */ }
}

export { saveDeleteToken };

export function CommentForm({ postId, onCommentAdded }: CommentFormProps) {
  const [authorName, setAuthorName] = useState("");
  const [authorEmail, setAuthorEmail] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const t = useTranslations("Comments");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim()) {
      toast.error(t("contentRequired"));
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_id: postId,
          author_name: authorName.trim() || t("anonymous"),
          author_email: authorEmail.trim() || null,
          content: content.trim(),
        }),
      });

      const json = await res.json();

      if (!json.success) {
        toast.error(t("submitFailed"));
        return;
      }

      // 保存删除令牌到 localStorage
      if (json.deleteToken) {
        saveDeleteToken(json.data.id, json.deleteToken);
      }

      onCommentAdded(json.data);
      setContent("");
      toast.success(t("published"));
    } catch {
      toast.error(t("networkError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-sm font-medium text-foreground">{t("formTitle")}</h3>

      <div className="flex gap-3">
        <Input
          placeholder={t("namePlaceholder")}
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          maxLength={30}
          className="h-9 text-sm bg-transparent focus-visible:ring-0"
        />
        <Input
          type="email"
          placeholder={t("emailPlaceholder")}
          value={authorEmail}
          onChange={(e) => setAuthorEmail(e.target.value)}
          maxLength={100}
          className="h-9 text-sm bg-transparent focus-visible:ring-0"
        />
      </div>

      <Textarea
        placeholder={t("contentPlaceholder")}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        maxLength={5000}
        className="text-sm bg-transparent focus-visible:ring-0 resize-none"
      />

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {content.length}/5000
        </span>
        <Button
          type="submit"
          disabled={submitting || !content.trim()}
          size="sm"
          variant="secondary"
          className="h-8 text-xs"
        >
          {submitting ? t("submitting") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
