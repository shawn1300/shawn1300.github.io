"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  createEnvironmentChartModel,
  type EnvironmentChartDatum,
} from "@/lib/environment/chart";
import type {
  EnvironmentFreshness,
  EnvironmentHistoryRange,
  EnvironmentHistoryResponse,
  EnvironmentLatestReading,
  EnvironmentLatestResponse,
  EnvironmentLocalizedName,
  EnvironmentRole,
} from "@/types/environment";

import styles from "./environment.module.css";

interface EnvironmentDashboardProps {
  initialLatest: EnvironmentLatestResponse | null;
  initialHistory: EnvironmentHistoryResponse | null;
  initialLatestError: boolean;
  initialHistoryError: boolean;
}

type Metric = "temperatureC" | "humidityPercent";

const roles: EnvironmentRole[] = ["indoor", "outdoor"];

function freshnessLabel(
  freshness: EnvironmentFreshness,
  t: ReturnType<typeof useTranslations<"Environment">>
) {
  return t(freshness);
}

function Status({
  freshness,
  t,
}: {
  freshness: EnvironmentFreshness;
  t: ReturnType<typeof useTranslations<"Environment">>;
}) {
  return (
    <span className={styles.status} data-state={freshness}>
      <span className={styles.statusDot} aria-hidden="true" />
      {freshnessLabel(freshness, t)}
    </span>
  );
}

function formatMeasurement(value: number | null, locale: string) {
  if (value === null) return "—";
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value);
}

function formatSignedMeasurement(value: number | null, locale: string) {
  if (value === null) return "—";
  return new Intl.NumberFormat(locale, {
    signDisplay: "always",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value);
}

function formatTime(
  value: string,
  locale: string,
  timeZone: string,
  range?: EnvironmentHistoryRange
) {
  const options: Intl.DateTimeFormatOptions =
    range === "7d"
      ? { month: "short", day: "numeric", hour: "2-digit", timeZone }
      : { hour: "2-digit", minute: "2-digit", timeZone };
  return new Intl.DateTimeFormat(locale, options).format(new Date(value));
}

function ReadingColumn({
  role,
  reading,
  locale,
  timeZone,
  t,
}: {
  role: EnvironmentRole;
  reading: EnvironmentLatestReading | null;
  locale: string;
  timeZone: string;
  t: ReturnType<typeof useTranslations<"Environment">>;
}) {
  const freshness = reading?.freshness ?? "unavailable";
  return (
    <article className={styles.readingColumn}>
      <div className={styles.readingHeading}>
        <h3>{t(role)}</h3>
        <Status freshness={freshness} t={t} />
      </div>
      <div className={styles.temperatureLine}>
        <span className={styles.temperatureValue}>
          {formatMeasurement(reading?.temperatureC ?? null, locale)}
        </span>
        <span className={styles.temperatureUnit}>°C</span>
      </div>
      <dl className={styles.readingDetails}>
        <div>
          <dt>{t("humidity")}</dt>
          <dd>
            {formatMeasurement(reading?.humidityPercent ?? null, locale)}
            {reading ? "%" : ""}
          </dd>
        </div>
        <div>
          <dt>{t("battery")}</dt>
          <dd>
            {formatMeasurement(reading?.batteryPercent ?? null, locale)}
            {reading?.batteryPercent !== null && reading ? "%" : ""}
          </dd>
        </div>
        <div className={styles.timeDetail}>
          <dt>{t("lastUpdated")}</dt>
          <dd>
            {reading ? (
              <time dateTime={reading.sourceUpdatedAt}>
                {formatTime(reading.sourceUpdatedAt, locale, timeZone)}
              </time>
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>
    </article>
  );
}

function historyData(
  history: EnvironmentHistoryResponse,
  role: EnvironmentRole,
  metric: Metric
): EnvironmentChartDatum[] {
  return history.series[role].map((point) => ({
    sourceUpdatedAt: point.sourceUpdatedAt,
    value: point[metric],
  }));
}

function EnvironmentChart({
  title,
  metric,
  unit,
  history,
  locale,
  t,
}: {
  title: string;
  metric: Metric;
  unit: string;
  history: EnvironmentHistoryResponse | null;
  locale: string;
  t: ReturnType<typeof useTranslations<"Environment">>;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const timeZone = history?.location.timezone ?? "Australia/Perth";
  const input = {
    indoor: history ? historyData(history, "indoor", metric) : [],
    outdoor: history ? historyData(history, "outdoor", metric) : [],
  };
  const model = createEnvironmentChartModel(input);
  const summary = t("chartSummary", {
    title,
    indoorCount: input.indoor.length,
    outdoorCount: input.outdoor.length,
  });

  return (
    <figure className={styles.chartSection}>
      <div className={styles.chartHeading}>
        <figcaption id={titleId}>{title}</figcaption>
        <div className={styles.legend} aria-label={summary}>
          <span><i className={styles.indoorKey} />{t("indoor")}</span>
          <span><i className={styles.outdoorKey} />{t("outdoor")}</span>
        </div>
      </div>
      {!model ? (
        <div className={styles.emptyChart}>{t("noHistory")}</div>
      ) : (
        <div className={styles.chartViewport}>
          <div className={styles.chartStage}>
            <svg
              viewBox={`0 0 ${model.width} ${model.height}`}
              role="img"
              aria-labelledby={`${titleId} ${descriptionId}`}
              preserveAspectRatio="none"
            >
              <desc id={descriptionId}>{summary}</desc>
              {model.valueTicks.map((tick) => (
                <line
                  key={tick.value}
                  className={styles.gridLine}
                  x1="54"
                  x2={model.width - 18}
                  y1={tick.y}
                  y2={tick.y}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {roles.map((role) => (
                <path
                  key={role}
                  className={role === "indoor" ? styles.indoorLine : styles.outdoorLine}
                  d={model.series[role].path}
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
            {/* 标签在 SVG 外绘制：preserveAspectRatio="none" 会非均匀拉伸
                viewBox，SVG 内文字会被压扁；viewBox→容器是线性映射，
                用百分比定位可精确对齐拉伸后的内容。 */}
            <div className={styles.valueLabels} aria-hidden="true">
              {model.valueTicks.map((tick) => (
                <span
                  key={tick.value}
                  style={{ top: `${(tick.y / model.height) * 100}%` }}
                >
                  {formatMeasurement(tick.value, locale)}{unit}
                </span>
              ))}
            </div>
            <div className={styles.timeLabels} aria-hidden="true">
              {model.timeTicks.map((tick) => (
                <span
                  key={tick.value}
                  style={{ left: `${(tick.x / model.width) * 100}%` }}
                >
                  {formatTime(
                    new Date(tick.value).toISOString(),
                    locale,
                    timeZone,
                    history?.range
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </figure>
  );
}

async function publicJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("ENVIRONMENT_REQUEST_FAILED");
  return response.json() as Promise<T>;
}

export function EnvironmentDashboard({
  initialLatest,
  initialHistory,
  initialLatestError,
  initialHistoryError,
}: EnvironmentDashboardProps) {
  const locale = useLocale();
  const t = useTranslations("Environment");
  const common = useTranslations("Common");
  const [latest, setLatest] = useState(initialLatest);
  const [history, setHistory] = useState(initialHistory);
  const [range, setRange] = useState<EnvironmentHistoryRange>("24h");
  const [latestError, setLatestError] = useState(initialLatestError);
  const [historyError, setHistoryError] = useState(initialHistoryError);
  const [historyLoading, setHistoryLoading] = useState(false);
  const historyRequest = useRef<AbortController | null>(null);
  const timeZone = latest?.location.timezone ?? "Australia/Perth";

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const next = await publicJson<EnvironmentLatestResponse>(
          "/api/environment/latest?location=home"
        );
        if (active) {
          setLatest(next);
          setLatestError(false);
        }
      } catch {
        if (active) setLatestError(true);
      }
    };
    const interval = window.setInterval(refresh, 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(
    () => () => {
      historyRequest.current?.abort();
    },
    []
  );

  const changeRange = async (nextRange: EnvironmentHistoryRange) => {
    if (nextRange === range) return;
    setRange(nextRange);
    setHistoryLoading(true);
    setHistoryError(false);
    historyRequest.current?.abort();
    const controller = new AbortController();
    historyRequest.current = controller;
    try {
      const next = await publicJson<EnvironmentHistoryResponse>(
        `/api/environment/history?location=home&range=${nextRange}`
      );
      if (!controller.signal.aborted) setHistory(next);
    } catch {
      if (!controller.signal.aborted) setHistoryError(true);
    } finally {
      if (!controller.signal.aborted) setHistoryLoading(false);
    }
  };

  // 切换范围加载期间保留上一次快照（外层降透明度 + 加载提示），
  // 避免图表瞬间闪成"暂无数据"；空态只在真正没有读数时出现。
  const displayedHistory = history;
  const freshness = latest?.freshness ?? "unavailable";
  const locationNameKey: keyof EnvironmentLocalizedName =
    locale === "zh-CN" ? "zh" : locale === "ja" ? "ja" : "en";

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.topline}>
          <div className={styles.locationMark}>
            <span>{t("location")}</span>
            <strong>{latest?.location.name[locationNameKey] ?? t("home")}</strong>
          </div>
          <div className={styles.controls}>
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
        <p className={styles.eyebrow}>{t("eyebrow")}</p>
        <div className={styles.titleRow}>
          <div>
            <h1>{t("title")}</h1>
            <p className={styles.subtitle}>{t("subtitle")}</p>
          </div>
          <Status freshness={freshness} t={t} />
        </div>
      </header>

      {latestError && (
        <p className={styles.notice} role="status">{t("requestFailed")}</p>
      )}

      <section className={styles.currentSection} aria-labelledby="current-readings">
        <div className={styles.sectionHeading}>
          <h2 id="current-readings">{t("currentConditions")}</h2>
          <span>{t("autoRefresh")}</span>
        </div>
        <div className={styles.readingsGrid}>
          <ReadingColumn
            role="indoor"
            reading={latest?.readings.indoor ?? null}
            locale={locale}
            timeZone={timeZone}
            t={t}
          />
          <ReadingColumn
            role="outdoor"
            reading={latest?.readings.outdoor ?? null}
            locale={locale}
            timeZone={timeZone}
            t={t}
          />
        </div>
        <div className={styles.deltaRow}>
          <span>{t("difference")}</span>
          <dl>
            <div>
              <dt>{t("temperature")}</dt>
              <dd>{formatSignedMeasurement(latest?.deltas.temperatureC ?? null, locale)}{latest?.deltas.temperatureC !== null && latest ? " °C" : ""}</dd>
            </div>
            <div>
              <dt>{t("humidity")}</dt>
              <dd>{formatSignedMeasurement(latest?.deltas.humidityPercent ?? null, locale)}{latest?.deltas.humidityPercent !== null && latest ? "%" : ""}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className={styles.historySection} aria-labelledby="history-title">
        <div className={styles.historyHeader}>
          <div>
            <h2 id="history-title">
              {range === "24h" ? t("rawResolution") : t("hourlyResolution")}
            </h2>
            <p>{t("timezone")}</p>
          </div>
          <div
            className={styles.rangeControl}
            aria-label={`${t("range24h")} / ${t("range7d")}`}
          >
            {(["24h", "7d"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={range === option}
                onClick={() => void changeRange(option)}
              >
                {t(option === "24h" ? "range24h" : "range7d")}
              </button>
            ))}
          </div>
        </div>
        {historyError && (
          <p className={styles.notice} role="status">{t("historyFailed")}</p>
        )}
        {historyLoading && <p className={styles.loading} role="status">{common("loading")}</p>}
        <div className={historyLoading ? styles.chartsLoading : styles.charts}>
          <EnvironmentChart
            title={t("temperatureTrend")}
            metric="temperatureC"
            unit="°C"
            history={displayedHistory}
            locale={locale}
            t={t}
          />
          <EnvironmentChart
            title={t("humidityTrend")}
            metric="humidityPercent"
            unit="%"
            history={displayedHistory}
            locale={locale}
            t={t}
          />
        </div>
      </section>
    </main>
  );
}
