"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Link } from "@/i18n/navigation";
import type { PublicStatusNode, StatusSnapshot } from "@/types/status";

import styles from "./status.module.css";

interface Props {
  initialSnapshot: StatusSnapshot;
  initialError: boolean;
}

const REFRESH_INTERVAL_MS = 15_000;
const DISPLAY_TIME_ZONE = "Australia/Perth";

function formatNumber(value: number, locale: string, maximumFractionDigits = 1) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

function formatPercent(value: number | null, locale: string) {
  return value === null ? "—" : formatNumber(value, locale) + "%";
}

function formatBytes(value: number | null, locale: string) {
  if (value === null || !Number.isFinite(value)) return "—";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let amount = Math.max(0, value);
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return formatNumber(amount, locale, amount >= 10 ? 1 : 2) + " " + units[index];
}

function formatRate(value: number | null, locale: string) {
  const bytes = formatBytes(value, locale);
  return bytes === "—" ? bytes : bytes + "/s";
}

function formatUptime(value: number | null, locale: string) {
  if (value === null || value < 0) return "—";
  const days = Math.floor(value / 86_400);
  const hours = Math.floor((value % 86_400) / 3_600);
  const minutes = Math.floor((value % 3_600) / 60);
  const parts = [];
  if (days) parts.push(formatNumber(days, locale, 0) + "d");
  if (hours || days) parts.push(formatNumber(hours, locale, 0) + "h");
  parts.push(formatNumber(minutes, locale, 0) + "m");
  return parts.join(" ");
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: DISPLAY_TIME_ZONE,
  }).format(new Date(value));
}

function meterLevel(value: number | null) {
  if (value === null) return "unknown";
  if (value >= 90) return "danger";
  if (value >= 75) return "warning";
  return "normal";
}

function UsageRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | null;
  detail: string;
}) {
  return (
    <div className={styles.usageRow}>
      <div className={styles.usageHeading}>
        <span>{label}</span>
        <strong>{value === null ? "—" : detail}</strong>
      </div>
      <div
        className={styles.meter}
        data-level={meterLevel(value)}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value ?? undefined}
      >
        <span style={{ width: String(Math.min(100, Math.max(0, value ?? 0))) + "%" }} />
      </div>
    </div>
  );
}

function ServerCard({ node, locale }: { node: PublicStatusNode; locale: string }) {
  const t = useTranslations("Status");
  const system = [node.os, node.arch].filter(Boolean).join(" / ") || t("unknownSystem");
  const memoryDetail =
    node.memory.percent === null
      ? "—"
      : formatPercent(node.memory.percent, locale) +
        " · " +
        formatBytes(node.memory.used, locale) +
        " / " +
        formatBytes(node.memory.total, locale);
  const diskDetail =
    node.disk.percent === null
      ? "—"
      : formatPercent(node.disk.percent, locale) +
        " · " +
        formatBytes(node.disk.used, locale) +
        " / " +
        formatBytes(node.disk.total, locale);

  return (
    <article className={styles.serverCard} data-online={node.online}>
      <header className={styles.cardHeader}>
        <div className={styles.serverIdentity}>
          <span className={styles.flag} aria-hidden="true">{node.flag ?? "◌"}</span>
          <div>
            <h2>{node.name}</h2>
            <p>{[node.provider, node.location].filter(Boolean).join(" · ") || t("monitoredNode")}</p>
          </div>
        </div>
        <span className={styles.onlineBadge} data-online={node.online}>
          <i aria-hidden="true" />
          {node.online ? t("online") : t("offline")}
        </span>
      </header>

      <dl className={styles.systemRow}>
        <div><dt>{t("system")}</dt><dd>{system}</dd></div>
        <div><dt>{t("processes")}</dt><dd>{node.processCount === null ? "—" : formatNumber(node.processCount, locale, 0)}</dd></div>
      </dl>

      <div className={styles.usageList}>
        <UsageRow label={t("cpu")} value={node.cpuPercent} detail={formatPercent(node.cpuPercent, locale)} />
        <UsageRow label={t("memory")} value={node.memory.percent} detail={memoryDetail} />
        <UsageRow label={t("disk")} value={node.disk.percent} detail={diskDetail} />
      </div>

      <dl className={styles.networkGrid}>
        <div><dt>{t("liveNetwork")}</dt><dd>↑ {formatRate(node.network.up, locale)}<br />↓ {formatRate(node.network.down, locale)}</dd></div>
        <div><dt>{t("totalTraffic")}</dt><dd>↑ {formatBytes(node.network.totalUp, locale)}<br />↓ {formatBytes(node.network.totalDown, locale)}</dd></div>
        <div><dt>{t("uptime")}</dt><dd>{formatUptime(node.uptimeSeconds, locale)}</dd></div>
        <div>
          <dt>{t("lastUpdated")}</dt>
          <dd>{node.updatedAt ? <time dateTime={node.updatedAt}>{formatDate(node.updatedAt, locale)}</time> : "—"}</dd>
        </div>
      </dl>
    </article>
  );
}

export function StatusDashboard({ initialSnapshot, initialError }: Props) {
  const locale = useLocale();
  const t = useTranslations("Status");
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [requestFailed, setRequestFailed] = useState(initialError);
  const [query, setQuery] = useState("");
  const [clock, setClock] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const response = await fetch("/api/status", { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("STATUS_REQUEST_FAILED");
      const next = (await response.json()) as StatusSnapshot;
      if (next.success !== true || !Array.isArray(next.nodes)) throw new Error("STATUS_RESPONSE_INVALID");
      setSnapshot(next);
      setRequestFailed(false);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setRequestFailed(true);
    }
  }, []);

  useEffect(() => {
    if (initialError) void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(interval);
      requestRef.current?.abort();
    };
  }, [initialError, refresh]);

  useEffect(() => {
    const updateClock = () => setClock(
      new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone: DISPLAY_TIME_ZONE,
      }).format(new Date())
    );
    updateClock();
    const interval = window.setInterval(updateClock, 1_000);
    return () => window.clearInterval(interval);
  }, [locale]);

  const filteredNodes = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase(locale);
    if (!normalized) return snapshot.nodes;
    return snapshot.nodes.filter((node) =>
      [node.name, node.location, node.provider, node.os, node.arch]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase(locale).includes(normalized))
    );
  }, [locale, query, snapshot.nodes]);

  const showNotice = requestFailed || snapshot.degraded;

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.topline}>
          <Link className={styles.brand} href="/">{t("brand")}</Link>
          <div className={styles.controls}><LanguageSwitcher /><ThemeToggle /></div>
        </div>
        <p className={styles.eyebrow}>{t("eyebrow")}</p>
        <div className={styles.titleRow}>
          <div>
            <h1>{t("title")}</h1>
            <p className={styles.subtitle}>{t("subtitle")}</p>
          </div>
          <p className={styles.refreshNote}>{t("autoRefresh")}</p>
        </div>
      </header>

      <section className={styles.summary} aria-label={t("summary")}>
        <div><span>{t("currentTime")}</span><strong>{clock ?? "—"}</strong></div>
        <div><span>{t("onlineServers")}</span><strong>{snapshot.summary.online} / {snapshot.summary.total}</strong></div>
        <div><span>{t("regions")}</span><strong>{snapshot.summary.regions}</strong></div>
        <div><span>{t("aggregateTraffic")}</span><strong>↑ {formatRate(snapshot.summary.networkUp, locale)}<br />↓ {formatRate(snapshot.summary.networkDown, locale)}</strong></div>
      </section>

      {showNotice && <p className={styles.notice} role="status">{t("requestFailed")}</p>}

      <section className={styles.servers} aria-labelledby="status-servers-heading">
        <div className={styles.serverTools}>
          <label className={styles.search}>
            <span className={styles.srOnly}>{t("searchPlaceholder")}</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchPlaceholder")}
            />
          </label>
          <p id="status-servers-heading">{t("serverSummary", { total: snapshot.summary.total, online: snapshot.summary.online })}</p>
        </div>

        {filteredNodes.length > 0 ? (
          <div className={styles.serverGrid}>
            {filteredNodes.map((node, index) => <ServerCard key={node.name + "-" + index} node={node} locale={locale} />)}
          </div>
        ) : (
          <div className={styles.emptyState}>{snapshot.nodes.length ? t("noSearchResults") : t("noNodes")}</div>
        )}
      </section>
    </main>
  );
}
