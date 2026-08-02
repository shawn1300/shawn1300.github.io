"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

export function DeletePostButton({
  id,
  title,
}: {
  id: string;
  title: string;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const t = useTranslations("Admin.content");

  async function handleDelete() {
    if (!confirmed) {
      setConfirmed(true);
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.refresh();
      }
    } catch {
      setDeleting(false);
      setConfirmed(false);
    }
  }

  return (
    <Button
      size="sm"
      variant={confirmed ? "destructive" : "ghost"}
      onClick={handleDelete}
      disabled={deleting}
      className="h-7 text-[10px]"
    >
      {deleting ? t("deleting") : confirmed ? t("confirmDelete", { title: `${title.slice(0, 8)}${title.length > 8 ? "..." : ""}` }) : t("delete")}
    </Button>
  );
}
