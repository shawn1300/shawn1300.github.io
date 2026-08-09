"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { createModularEnvironmentChartModel } from "@/lib/environment/chart";
import { environmentChartTooltipPlacement, moveEnvironmentChartSelection, nearestEnvironmentChartPoint, type EnvironmentChartSelection } from "@/lib/environment/chart-hit-test";
import type { EnvironmentFreshness, EnvironmentHistoryRange, EnvironmentLocalizedName } from "@/types/environment";
import type { EnvironmentHistoryResponseV2, EnvironmentLatestDeviceV2, EnvironmentLatestResponseV2, EnvironmentLocationSummaryV2, EnvironmentMetricKey } from "@/types/environment-v2";

import styles from "./environment.module.css";

interface Props {
  initialLocation: string;
  locations: EnvironmentLocationSummaryV2[];
  initialLatest: EnvironmentLatestResponseV2 | null;
  initialHistory: EnvironmentHistoryResponseV2 | null;
  initialLatestError: boolean;
  initialHistoryError: boolean;
}

const METRICS: EnvironmentMetricKey[] = ["temperatureC", "humidityPercent", "co2Ppm", "pm25UgM3"];

function localeName(locale: string): keyof EnvironmentLocalizedName {
  return locale === "zh-CN" ? "zh" : locale === "ja" ? "ja" : "en";
}

function number(value: number | null | undefined, locale: string, signed = false) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1, signDisplay: signed ? "always" : "auto" }).format(value);
}

function time(value: string, locale: string, timeZone: string, range?: EnvironmentHistoryRange) {
  return new Intl.DateTimeFormat(locale, range === "7d"
    ? { month: "short", day: "numeric", hour: "2-digit", timeZone }
    : { hour: "2-digit", minute: "2-digit", timeZone }
  ).format(new Date(value));
}

function Status({ freshness }: { freshness: EnvironmentFreshness }) {
  const t = useTranslations("Environment");
  return <span className={styles.status} data-state={freshness}><span className={styles.statusDot} aria-hidden="true" />{t(freshness)}</span>;
}

function metricLabel(metric: EnvironmentMetricKey, t: ReturnType<typeof useTranslations<"Environment">>) {
  return t(metric === "temperatureC" ? "temperature" : metric === "humidityPercent" ? "humidity" : metric === "co2Ppm" ? "co2" : metric === "pm25UgM3" ? "pm25" : "battery");
}

function DeviceCard({ device, locale, timeZone }: { device: EnvironmentLatestDeviceV2; locale: string; timeZone: string }) {
  const t = useTranslations("Environment");
  const name = device.name[localeName(locale)];
  const primary = device.metrics.temperatureC ?? Object.values(device.metrics)[0];
  const details = Object.values(device.metrics).filter((metric) => metric.key !== primary?.key);
  return <article className={styles.deviceCard}>
    <div className={styles.readingHeading}><h3>{name}</h3><Status freshness={device.freshness} /></div>
    <div className={styles.temperatureLine}>
      <span className={styles.temperatureValue}>{number(primary?.value, locale)}</span>
      <span className={styles.temperatureUnit}>{primary?.unit ?? ""}</span>
    </div>
    <dl className={styles.readingDetails}>
      {details.map((metric) => <div key={metric.key}><dt>{metricLabel(metric.key, t)}</dt><dd>{number(metric.value, locale)} {metric.unit}</dd></div>)}
      <div className={styles.timeDetail}><dt>{t("lastUpdated")}</dt><dd>{primary ? <time dateTime={primary.sourceUpdatedAt}>{time(primary.sourceUpdatedAt, locale, timeZone)}</time> : "—"}</dd></div>
    </dl>
  </article>;
}

function EnvironmentChart({ metric, history, locale }: { metric: EnvironmentMetricKey; history: EnvironmentHistoryResponseV2; locale: string }) {
  const t = useTranslations("Environment");
  const titleId = useId();
  const statusId = useId();
  const [selection, setSelection] = useState<EnvironmentChartSelection | null>(null);
  const seriesInput = useMemo(
    () => history.series.filter((series) => series.metric === metric).map((series) => ({
      id: series.device, label: series.deviceName[localeName(locale)], data: series.points,
    })),
    [history.series, locale, metric]
  );
  const model = useMemo(() => createModularEnvironmentChartModel(seriesInput), [seriesInput]);
  if (!model) return null;
  const selectedSeries = selection ? model.series[selection.seriesIndex] : null;
  const selectedPoint = selectedSeries && selection ? selectedSeries.points[selection.pointIndex] : null;
  const tooltipPlacement = selectedPoint
    ? environmentChartTooltipPlacement(selectedPoint.x, selectedPoint.y, model.width, model.height)
    : null;
  const unit = history.series.find((series) => series.metric === metric)?.unit ?? "";
  const choosePointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * model.width;
    const y = ((event.clientY - bounds.top) / bounds.height) * model.height;
    setSelection(nearestEnvironmentChartPoint(model.series, x, y, 28, {
      x: bounds.width / model.width,
      y: bounds.height / model.height,
    }));
  };
  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    choosePointer(event);
  };
  const locationName = history.location.name[localeName(locale)];
  const description = selectedPoint && selectedSeries
    ? `${locationName}, ${selectedSeries.label}, ${time(selectedPoint.sourceUpdatedAt, locale, history.location.timezone, history.range)}, ${number(selectedPoint.value, locale)} ${unit}`
    : t("chartKeyboardHint");
  return <figure className={styles.chartSection}>
    <div className={styles.chartHeading}>
      <figcaption id={titleId}>{metricLabel(metric, t)}</figcaption>
      <div className={styles.legend}>{model.series.map((series) => <span key={series.id}><i style={{ "--series-color": `var(--chart-${series.styleIndex % 5 + 1})` } as CSSProperties} />{series.label}</span>)}</div>
    </div>
    <div className={styles.chartViewport}><div className={styles.chartStage}>
      <svg viewBox={`0 0 ${model.width} ${model.height}`} preserveAspectRatio="none" tabIndex={0}
        role="img" aria-labelledby={`${titleId} ${statusId}`} className={styles.interactiveChart}
        onPointerEnter={choosePointer} onPointerMove={choosePointer} onPointerDown={handlePointerDown}
        onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); if (event.pointerType === "touch") setSelection(null); }}
        onPointerCancel={() => setSelection(null)} onPointerLeave={(event) => { if (event.pointerType === "mouse") setSelection(null); }}
        onFocus={() => setSelection((current) => current ?? moveEnvironmentChartSelection(model.series, null, "right"))}
        onKeyDown={(event) => {
          const direction = event.key === "ArrowLeft" ? "left" : event.key === "ArrowRight" ? "right" : event.key === "ArrowUp" ? "up" : event.key === "ArrowDown" ? "down" : null;
          if (direction) { event.preventDefault(); setSelection((current) => moveEnvironmentChartSelection(model.series, current, direction)); }
          if (event.key === "Escape") setSelection(null);
        }}>
        {model.valueTicks.map((tick) => <line key={tick.value} className={styles.gridLine} x1="54" x2={model.width - 18} y1={tick.y} y2={tick.y} vectorEffect="non-scaling-stroke" />)}
        {model.series.map((series) => <path key={series.id} d={series.path} fill="none" vectorEffect="non-scaling-stroke"
          className={styles.modularLine} style={{ stroke: `var(--chart-${series.styleIndex % 5 + 1})`, strokeDasharray: series.styleIndex % 2 ? "7 6" : undefined } as CSSProperties} />)}
        {selectedPoint && <><line className={styles.selectionGuide} x1={selectedPoint.x} x2={selectedPoint.x} y1="18" y2={model.height - 34} vectorEffect="non-scaling-stroke" /><circle className={styles.selectionPoint} cx={selectedPoint.x} cy={selectedPoint.y} r="5" vectorEffect="non-scaling-stroke" /></>}
      </svg>
      <div className={styles.valueLabels} aria-hidden="true">{model.valueTicks.map((tick) => <span key={tick.value} style={{ top: `${tick.y / model.height * 100}%` }}>{number(tick.value, locale)}{unit}</span>)}</div>
      <div className={styles.timeLabels} aria-hidden="true">{model.timeTicks.map((tick) => <span key={tick.value} style={{ left: `${tick.x / model.width * 100}%` }}>{time(new Date(tick.value).toISOString(), locale, history.location.timezone, history.range)}</span>)}</div>
      {selectedPoint && selectedSeries && tooltipPlacement && <div
        className={styles.chartTooltip}
        data-inline={tooltipPlacement.inline}
        data-block={tooltipPlacement.block}
        style={{ left: `${selectedPoint.x / model.width * 100}%`, top: `${selectedPoint.y / model.height * 100}%` }}
      >
        <strong>{locationName} · {selectedSeries.label}</strong><span>{time(selectedPoint.sourceUpdatedAt, locale, history.location.timezone, history.range)}</span><b>{number(selectedPoint.value, locale)} {unit}</b>
      </div>}
      <span id={statusId} className={styles.srOnly} role="status">{description}</span>
    </div></div>
  </figure>;
}

async function publicJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("ENVIRONMENT_REQUEST_FAILED");
  return response.json() as Promise<T>;
}

function locationFromPath() {
  const match = window.location.pathname.match(/\/environment(?:\/([a-z0-9-]+))?\/?$/);
  return match?.[1] ?? "home";
}

export function EnvironmentDashboard(props: Props) {
  const locale = useLocale();
  const t = useTranslations("Environment");
  const common = useTranslations("Common");
  const [location, setLocation] = useState(props.initialLocation);
  const [latest, setLatest] = useState(props.initialLatest);
  const [history, setHistory] = useState(props.initialHistory);
  const [range, setRange] = useState<EnvironmentHistoryRange>(props.initialHistory?.range ?? "24h");
  const [latestError, setLatestError] = useState(props.initialLatestError);
  const [historyError, setHistoryError] = useState(props.initialHistoryError);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const nameKey = localeName(locale);
  const timeZone = latest?.location.timezone ?? history?.location.timezone ?? "Australia/Perth";

  const loadLocation = useCallback(async (slug: string, push: boolean) => {
    if (slug === location && push) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true); setLatestError(false); setHistoryError(false);
    try {
      const [nextLatest, nextHistory] = await Promise.all([
        publicJson<EnvironmentLatestResponseV2>(`/api/environment/v2/locations/${slug}/latest`, controller.signal),
        publicJson<EnvironmentHistoryResponseV2>(`/api/environment/v2/locations/${slug}/history?range=${range}`, controller.signal),
      ]);
      if (controller.signal.aborted) return;
      setLatest(nextLatest); setHistory(nextHistory); setLocation(slug);
      if (push) {
        const index = window.location.pathname.indexOf("/environment");
        const prefix = index >= 0 ? window.location.pathname.slice(0, index) : "";
        window.history.pushState(null, "", `${prefix}/environment${slug === "home" ? "" : `/${slug}`}`);
      }
    } catch { if (!controller.signal.aborted) { setLatestError(true); setHistoryError(true); } }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [location, range]);

  useEffect(() => {
    const listener = () => void loadLocation(locationFromPath(), false);
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, [loadLocation]);

  useEffect(() => {
    const interval = window.setInterval(async () => {
      try { setLatest(await publicJson(`/api/environment/v2/locations/${location}/latest`)); setLatestError(false); }
      catch { setLatestError(true); }
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [location]);

  useEffect(() => () => requestRef.current?.abort(), []);

  const changeRange = async (next: EnvironmentHistoryRange) => {
    if (next === range) return;
    setRange(next); setLoading(true); setHistoryError(false);
    try { setHistory(await publicJson(`/api/environment/v2/locations/${location}/history?range=${next}`)); }
    catch { setHistoryError(true); }
    finally { setLoading(false); }
  };

  const chartMetrics = METRICS.filter((metric) => history?.series.some((series) => series.metric === metric));
  return <main className={styles.page}>
    <header className={styles.header}>
      <div className={styles.topline}>
        <label className={styles.locationPicker}><span>{t("location")}</span><select value={location} disabled={loading} onChange={(event) => void loadLocation(event.target.value, true)}>
          {props.locations.map((item) => <option key={item.slug} value={item.slug}>{item.name[nameKey]}</option>)}
        </select></label>
        <div className={styles.controls}><LanguageSwitcher /><ThemeToggle /></div>
      </div>
      <p className={styles.eyebrow}>{t("eyebrow")}</p>
      <div className={styles.titleRow}><div><h1>{t("title")}</h1><p className={styles.subtitle}>{t("subtitle")}</p></div><Status freshness={latest?.freshness ?? "unavailable"} /></div>
    </header>
    {latestError && <p className={styles.notice} role="status">{t("requestFailed")}</p>}
    <section className={styles.currentSection}>
      <div className={styles.sectionHeading}><h2>{t("currentConditions")}</h2><span>{t("autoRefresh")}</span></div>
      <div className={styles.deviceGrid}>{latest?.devices.map((device) => <DeviceCard key={device.slug} device={device} locale={locale} timeZone={timeZone} />)}</div>
      {latest?.comparison && <div className={styles.deltaRow}><span>{t("difference")}</span><dl><div><dt>{t("temperature")}</dt><dd>{number(latest.comparison.temperatureC, locale, true)} °C</dd></div><div><dt>{t("humidity")}</dt><dd>{number(latest.comparison.humidityPercent, locale, true)}%</dd></div></dl></div>}
      {Object.entries(latest?.airQuality ?? {}).map(([device, aqi]) => <article className={styles.referenceCard} key={device}><h3>{t("airQualityReference")}</h3><div><span>HJ 633—2026</span><strong>{aqi.china.value ?? "—"}</strong><small>{aqi.china.category ? t(`aqi_${aqi.china.category}`) : t("insufficientData")}</small></div><div><span>US EPA 2026 NowCast</span><strong>{aqi.unitedStates.value ?? "—"}</strong><small>{aqi.unitedStates.category ? t(`aqi_${aqi.unitedStates.category}`) : t("insufficientData")}</small></div><p>{t("sensorReferenceDisclaimer")}</p></article>)}
      {Object.entries(latest?.co2 ?? {}).map(([device, reference]) => <article className={styles.referenceCard} key={device}><h3>{t("co2Reference")}</h3><div><span>{t("oneHourMean")}</span><strong>{reference.averagePpm ?? "—"} {reference.averagePpm === null ? "" : "ppm"}</strong><small>{reference.category ? t(`co2_${reference.category}`) : t("insufficientData")}</small></div><p>{t("co2Disclaimer")}</p></article>)}
    </section>
    <section className={styles.historySection}>
      <div className={styles.historyHeader}><div><h2>{range === "24h" ? t("rawResolution") : t("hourlyResolution")}</h2><p>{t("timezoneNamed", { timezone: timeZone })}</p></div><div className={styles.rangeControl}>{(["24h", "7d"] as const).map((item) => <button type="button" key={item} aria-pressed={range === item} onClick={() => void changeRange(item)}>{t(item === "24h" ? "range24h" : "range7d")}</button>)}</div></div>
      {historyError && <p className={styles.notice} role="status">{t("historyFailed")}</p>}
      {loading && <p className={styles.loading} role="status">{common("loading")}</p>}
      <div className={loading ? styles.chartsLoading : styles.charts}>{history && chartMetrics.map((metric) => <EnvironmentChart key={metric} metric={metric} history={history} locale={locale} />)}{history && chartMetrics.length === 0 && <div className={styles.emptyChart}>{t("noHistory")}</div>}</div>
    </section>
  </main>;
}
