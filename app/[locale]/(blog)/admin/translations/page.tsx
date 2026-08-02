"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { TranslationRun } from "@/types";

type TranslationItemType = "post" | "diary" | "category" | "tag";

interface TranslationStatusItem {
  type: TranslationItemType;
  sourceId: string;
  sourceName: string;
  locale: "en" | "ja";
  status: string;
  retryCount: number;
  lastError: string | null;
  updatedAt: string | null;
}

interface TranslationStatusData {
  model: string;
  counts: Record<string, number>;
  items: TranslationStatusItem[];
  runs: TranslationRun[];
}

interface TranslationSyncResponse {
  run: TranslationRun | null;
  remainingCount: number;
  madeProgress: boolean;
  canContinue: boolean;
  rateLimited: boolean;
}

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export default function AdminTranslationsPage() {
  const locale = useLocale();
  const t = useTranslations("Admin.translations");
  const [data, setData] = useState<TranslationStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const stopRequestedRef = useRef(false);

  const loadStatus = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const response = await fetch("/api/admin/translations/status", {
          cache: "no-store",
        });
        const json = await response.json();
        if (!response.ok || !json.success) throw new Error(json.code);
        setData(json.data);
      } catch {
        toast.error(t("runFailed"));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const stopSync = () => {
    stopRequestedRef.current = true;
    setStopRequested(true);
    toast.info(t("stopRequested"));
  };

  const runNow = async () => {
    stopRequestedRef.current = false;
    setStopRequested(false);
    setRunning(true);
    try {
      while (!stopRequestedRef.current) {
        const response = await fetch("/api/admin/translations/sync", {
          method: "POST",
        });
        const json = await response.json();
        if (response.status === 409) {
          toast.error(t("alreadyRunning"));
          break;
        }
        if (!response.ok || !json.success) throw new Error(json.code);

        const result = json.data as TranslationSyncResponse;
        await loadStatus(true);
        if (result.rateLimited) toast.info(t("rateLimited"));
        if (result.remainingCount === 0) {
          toast.success(t("allComplete"));
          break;
        }
        if (!result.canContinue) {
          toast.error(t("pausedForFailures"));
          break;
        }
        await wait(3_000);
      }
    } catch {
      toast.error(t("runFailed"));
    } finally {
      setRunning(false);
      setStopRequested(false);
      stopRequestedRef.current = false;
      await loadStatus(true);
    }
  };

  const retryFailures = async (item?: TranslationStatusItem) => {
    try {
      const response = await fetch("/api/admin/translations/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          item
            ? {
                type: item.type,
                sourceId: item.sourceId,
                locale: item.locale,
              }
            : { all: true }
        ),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.code);
      toast.success(t("retryQueued"));
      await loadStatus(true);
    } catch {
      toast.error(t("retryFailed"));
    }
  };

  const formatDateTime = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(value))
      : "—";

  const lastRun = data?.runs[0];
  const count = (language: "en" | "ja", status: string) =>
    data?.counts[`${language}:${status}`] ?? 0;
  const failedItems = useMemo(
    () => data?.items.filter((item) => item.status === "failed") ?? [],
    [data?.items]
  );
  const typeLabel = (type: TranslationItemType) =>
    t(
      type === "post"
        ? "typePost"
        : type === "diary"
          ? "typeDiary"
          : type === "category"
            ? "typeCategory"
            : "typeTag"
    );
  const runStatus = (status: TranslationRun["status"]) =>
    t(
      status === "running"
        ? "statusRunning"
        : status === "complete"
          ? "statusComplete"
          : status === "partial"
            ? "statusPartial"
            : "statusFailed"
    );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-sm font-semibold text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
          {running && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">
              {stopRequested ? t("stopping") : t("continuousHint")}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadStatus()}
            disabled={loading || running}
          >
            {t("refresh")}
          </Button>
          {running ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={stopSync}
              disabled={stopRequested}
            >
              {stopRequested ? t("stopping") : t("stopSync")}
            </Button>
          ) : (
            <Button size="sm" onClick={() => void runNow()}>
              {t("runNow")}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {(["en", "ja"] as const).map((language) => (
          <div key={language} className="rounded-lg border border-border/40 p-4">
            <p className="text-sm font-medium">
              {language === "en" ? t("english") : t("japanese")}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{t("completeCount", { count: count(language, "complete") })}</span>
              <span>
                {t("pendingCount", {
                  count:
                    count(language, "pending") + count(language, "processing"),
                })}
              </span>
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
          <p className="mt-1 text-xs">
            {lastRun ? formatDateTime(lastRun.started_at) : t("neverRun")}
          </p>
        </div>
      </div>

      {failedItems.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">
              {t("failureDetails", { count: failedItems.length })}
            </h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void retryFailures()}
              disabled={running}
            >
              {t("retryAll")}
            </Button>
          </div>
          <div className="space-y-3">
            {failedItems.map((item) => (
              <article
                key={`${item.type}:${item.sourceId}:${item.locale}`}
                className="rounded-lg border border-destructive/25 bg-destructive/5 p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {item.sourceName}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {typeLabel(item.type)} · {item.locale === "en" ? t("english") : t("japanese")} · {t("retryCount", { count: item.retryCount })}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void retryFailures(item)}
                    disabled={running}
                  >
                    {t("retryItem")}
                  </Button>
                </div>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded bg-background/70 p-3 text-[11px] leading-relaxed text-destructive">
                  {item.lastError || t("unknownError")}
                </pre>
              </article>
            ))}
          </div>
        </section>
      )}

      <div>
        <h2 className="mb-3 text-sm font-medium">{t("recentRuns")}</h2>
        {!data?.runs.length ? (
          <p className="text-sm text-muted-foreground">
            {loading ? t("running") : t("noRuns")}
          </p>
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
                  <tr
                    key={run.id}
                    className="border-b border-border/30 last:border-0"
                    title={run.error_summary || undefined}
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatDateTime(run.started_at)}
                    </td>
                    <td className="px-3 py-2">
                      {run.trigger_source === "cron"
                        ? t("triggerCron")
                        : t("triggerAdmin")}
                    </td>
                    <td className="px-3 py-2">{runStatus(run.status)}</td>
                    <td className="px-3 py-2 tabular-nums">{run.scanned_count}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {run.translated_count}
                    </td>
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
