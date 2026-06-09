import { formatDate } from "@/lib/utils";
import type { Comment } from "@/types";

interface CommentItemProps {
  comment: Comment;
}

export function CommentItem({ comment }: CommentItemProps) {
  return (
    <div className="py-4 border-b border-border last:border-b-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-sm font-medium text-foreground">
          {comment.author_name}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {formatDate(comment.created_at)}
        </span>
      </div>
      <p className="text-sm text-foreground/75 leading-relaxed whitespace-pre-wrap">
        {comment.content}
      </p>
    </div>
  );
}
