"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { CommentForm } from "@/components/comments/comment-form";
import { CommentItem } from "@/components/comments/comment-item";
import type { Comment } from "@/types";

interface CommentSectionProps {
  postId: string;
}

export function CommentSection({ postId }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);

  // 加载初始评论
  useEffect(() => {
    async function fetchComments() {
      try {
        const res = await fetch(`/api/comments?post_id=${postId}`);
        const json = await res.json();
        if (json.success) {
          setComments(json.data);
        }
      } catch (error) {
        console.error("Failed to fetch comments:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchComments();
  }, [postId]);

  // Supabase Realtime 订阅新评论
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`comments:${postId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comments",
          filter: `post_id=eq.${postId}`,
        },
        (payload) => {
          setComments((prev) => [...prev, payload.new as Comment]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [postId]);

  const handleCommentAdded = useCallback((comment: Comment) => {
    // 乐观更新（API 返回的 comment 加入列表）
    // 如果 Realtime 也推送了，去重
    setComments((prev) => {
      if (prev.some((c) => c.id === comment.id)) return prev;
      return [...prev, comment];
    });
  }, []);

  return (
    <section className="space-y-8">
      <CommentForm postId={postId} onCommentAdded={handleCommentAdded} />

      {/* Comments list */}
      <div className="space-y-0">
        {loading ? (
          <p className="text-sm text-muted-foreground py-4">加载评论中...</p>
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            暂无评论。来做第一个留言的人吧。
          </p>
        ) : (
          comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} />
          ))
        )}
      </div>
    </section>
  );
}
