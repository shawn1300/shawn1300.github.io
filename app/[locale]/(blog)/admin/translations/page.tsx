"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { TranslationRun } from "@/types";

interface TranslationStatusData {
  model: string;
  counts: Record<string, number>;
  runs: TranslationRun[];
}

export default function AdminTranslationsPage() {
  const locale = useLocale();
  const t = useTranslations("Admin.translations");
  const [data, setData] = useState<TranslationStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/translations/status", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.code);
      setData(json.data);
    } catch {
      toast.error(t("runFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const runNow = async () => {
    setRunning(true);
    try {
      const response = await fetch("/api/admin/translations/sync", { method: "POST" });
      const json = await response.json();
      if (response.status === 409) {
        toast.error(t("alreadyRunning"));
        return;
      }
      if (!response.ok || !json.success) throw new Error(json.code);
      toast.success(t("runStarted"));
      await loadStatus();
    } catch {
      toast.error(t("runFailed"));
    } finally {
      setRunning(false);
    }
  };

  const formatDateTime = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
      : "—";

  const lastRun = data?.runs[0];
  const count = (language: "en" | "ja", status: string) => data?.counts[`${language}:${status}`] ?? 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-sm font-semibold text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadStatus()} disabled={loading || running}>
            {t("refresh")}
          </Button>
          <Button size="sm" onClick={() => void runNow()} disabled={running}>
            {running ? t("running") : t("runNow")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {(["en", "ja"] as const).map((language) => (
          <div key={language} className="rounded-lg border border-border/40 p-4">
            <p className="text-sm font-medium">{language === "en" ? t("english") : t("japanese")}</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{t("completeCount", { count: count(language, "complete") })}</span>
              <span>{t("pendingCount", { count: count(language, "pending") + count(language, "processing") })}</span>
              <span>{t("failedCount", { count: count(language, "failed") })}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 rounded-lg border border-border/40 p-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">{t("model")}</p>
          <p className="mt-1 break-all font-mono text-xs">{data?.model || "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t("lastRun")}</p>
          <p className="mt-1 text-xs">{lastRun ? formatDateTime(lastRun.started_at) : t("neverRun")}</p>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium">{t("recentRuns")}</h2>
        {!data?.runs.length ? (
          <p className="text-sm text-muted-foreground">{loading ? t("running") : t("noRuns")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/40">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="border-b border-border/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">{t("startedAt")}</th>
                  <th className="px-3 py-2 font-medium">{t("trigger")}</th>
                  <th className="px-3 py-2 font-medium">{t("status")}</th>
                  <th className="px-3 py-2 font-medium">{t("scanned")}</th>
                  <th className="px-3 py-2 font-medium">{t("translatedItems")}</th>
                  <th className="px-3 py-2 font-medium">{t("reused")}</th>
                  <th className="px-3 py-2 font-medium">{t("failedItems")}</th>
                </tr>
              </thead>
              <tbody>
                {data.runs.map((run) => (
                  <tr key={run.id} className="border-b border-border/30 last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(run.started_at)}</td>
                    <td className="px-3 py-2">{run.trigger_source === "cron" ? t("triggerCron") : t("triggerAdmin")}</td>
                    <td className="px-3 py-2">{run.status}</td>
                    <td className="px-3 py-2 tabular-nums">{run.scanned_count}</td>
                    <td className="px-3 py-2 tabular-nums">{run.translated_count}</td>
                    <td className="px-3 py-2 tabular-nums">{run.reused_count}</td>
                    <td className="px-3 py-2 tabular-nums">{run.failed_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
