"use client";

import { useState, useEffect, use } from "react";
import { notFound } from "next/navigation";
import { DiaryEditor } from "@/components/admin/diary-editor";
import type { Diary } from "@/types";

export default function EditDiaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [diary, setDiary] = useState<Diary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchDiary() {
      try {
        const res = await fetch(`/api/diaries/${id}`);
        const json = await res.json();
        if (!json.success || !json.data) {
          setError(true);
          return;
        }
        setDiary(json.data);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    fetchDiary();
  }, [id]);

  if (error) {
    notFound();
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-4 w-20 bg-muted rounded" />
          <div className="h-8 w-14 bg-muted rounded" />
        </div>
        <div className="space-y-3 p-4 border border-border rounded-lg">
          <div className="h-8 bg-muted rounded" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-[60vh] bg-muted rounded-lg" />
          <div className="h-[60vh] bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  return <DiaryEditor diary={diary} />;
}
