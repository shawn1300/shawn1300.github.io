import { createHash } from "node:crypto";

import type { Diary, Post } from "@/types";

export function contentHash(value: string): string {
  return createHash("sha256").update(value.normalize("NFC")).digest("hex");
}

export function sourceHashForPost(
  post: Pick<Post, "title" | "excerpt" | "content">
): string {
  return contentHash(
    JSON.stringify({
      title: post.title.normalize("NFC"),
      excerpt: post.excerpt.normalize("NFC"),
      content: post.content.normalize("NFC"),
    })
  );
}

export function sourceHashForDiary(
  diary: Pick<Diary, "title" | "content">
): string {
  return contentHash(
    JSON.stringify({
      title: diary.title.normalize("NFC"),
      content: diary.content.normalize("NFC"),
    })
  );
}

export function sourceHashForName(name: string): string {
  return contentHash(name.trim().normalize("NFC"));
}
