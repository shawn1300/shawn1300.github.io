import { getStatusConfig, type StatusConfig, type StatusNodeConfig } from "@/lib/status/config";
import type { PublicStatusNode, StatusSnapshot, StatusUsageMetric } from "@/types/status";

type FetchLike = typeof fetch;

interface StatusServiceOptions {
  config?: StatusConfig;
  fetchImpl?: FetchLike;
  now?: number;
}

interface NodeResult {
  node: PublicStatusNode;
  sourceFailed: boolean;
}

const ONLINE_WINDOW_MS = 90_000;
const REQUEST_TIMEOUT_MS = 8_000;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nestedNumber(value: unknown, group: string, field: string) {
  return finiteNumber(record(record(value)?.[group])?.[field]);
}

function percentage(used: number | null, total: number | null) {
  if (used === null || total === null || total <= 0) return null;
  return Math.min(100, Math.max(0, (used / total) * 100));
}

function usageMetric(value: unknown, group: string): StatusUsageMetric {
  const used = nestedNumber(value, group, "used");
  const total = nestedNumber(value, group, "total");
  return { used, total, percent: percentage(used, total) };
}

function emptyNode(config: StatusNodeConfig): PublicStatusNode {
  return {
    name: config.name,
    flag: config.flag,
    location: config.location,
    provider: config.provider,
    os: config.os,
    arch: config.arch,
    online: false,
    cpuPercent: null,
    memory: { used: null, total: null, percent: null },
    disk: { used: null, total: null, percent: null },
    network: { up: null, down: null, totalUp: null, totalDown: null },
    uptimeSeconds: null,
    processCount: null,
    updatedAt: null,
  };
}

function latestPoint(data: unknown[]) {
  let latest: Record<string, unknown> | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;
  for (const item of data) {
    const candidate = record(item);
    if (!candidate || typeof candidate.updated_at !== "string") continue;
    const candidateTime = Date.parse(candidate.updated_at);
    if (Number.isFinite(candidateTime) && candidateTime > latestTime) {
      latest = candidate;
      latestTime = candidateTime;
    }
  }
  return latest;
}

function pointToNode(config: StatusNodeConfig, point: Record<string, unknown>, now: number): PublicStatusNode {
  const updatedAt = typeof point.updated_at === "string" ? point.updated_at : null;
  const updatedTime = updatedAt ? Date.parse(updatedAt) : Number.NaN;
  return {
    ...emptyNode(config),
    online: Number.isFinite(updatedTime) && now - updatedTime <= ONLINE_WINDOW_MS,
    cpuPercent: nestedNumber(point, "cpu", "usage"),
    memory: usageMetric(point, "ram"),
    disk: usageMetric(point, "disk"),
    network: {
      up: nestedNumber(point, "network", "up"),
      down: nestedNumber(point, "network", "down"),
      totalUp: nestedNumber(point, "network", "totalUp"),
      totalDown: nestedNumber(point, "network", "totalDown"),
    },
    uptimeSeconds: finiteNumber(point.uptime),
    processCount: finiteNumber(point.process),
    updatedAt,
  };
}

async function loadNode(
  baseUrl: string,
  apiKey: string | null,
  config: StatusNodeConfig,
  fetchImpl: FetchLike,
  now: number
): Promise<NodeResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${baseUrl}/api/recent/${encodeURIComponent(config.id)}`, {
      cache: "no-store",
      headers: {
        accept: "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) return { node: emptyNode(config), sourceFailed: true };
    const payload = record(await response.json());
    const data = payload?.status === "success" && Array.isArray(payload.data) ? payload.data : null;
    if (!data) return { node: emptyNode(config), sourceFailed: true };
    const point = latestPoint(data);
    return {
      node: point ? pointToNode(config, point, now) : emptyNode(config),
      sourceFailed: false,
    };
  } catch {
    return { node: emptyNode(config), sourceFailed: true };
  } finally {
    clearTimeout(timeout);
  }
}

function regionCount(nodes: PublicStatusNode[]) {
  return new Set(
    nodes.map((node) => node.location ?? node.flag).filter((value): value is string => Boolean(value))
  ).size;
}

export async function getStatusSnapshot(options: StatusServiceOptions = {}): Promise<StatusSnapshot> {
  const config = options.config ?? getStatusConfig();
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now();
  const results = await Promise.all(
    config.nodes.map((node) => loadNode(config.baseUrl, config.apiKey, node, fetchImpl, now))
  );
  const nodes = results.map((result) => result.node);

  return {
    success: true,
    generatedAt: new Date(now).toISOString(),
    degraded: results.some((result) => result.sourceFailed),
    summary: {
      total: nodes.length,
      online: nodes.filter((node) => node.online).length,
      regions: regionCount(nodes),
      networkUp: nodes.reduce((sum, node) => sum + (node.network.up ?? 0), 0),
      networkDown: nodes.reduce((sum, node) => sum + (node.network.down ?? 0), 0),
    },
    nodes,
  };
}

export function emptyStatusSnapshot(now = Date.now()): StatusSnapshot {
  return {
    success: true,
    generatedAt: new Date(now).toISOString(),
    degraded: true,
    summary: { total: 0, online: 0, regions: 0, networkUp: 0, networkDown: 0 },
    nodes: [],
  };
}
