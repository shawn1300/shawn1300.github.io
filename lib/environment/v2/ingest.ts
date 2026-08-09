import {
  isEnvironmentMetricKey,
  isEnvironmentMetricValue,
  isEnvironmentPublicSlug,
  isUtcTimestamp,
} from "@/lib/environment/v2/metrics";
import type {
  EnvironmentIngestReadingV2,
  ParsedEnvironmentIngestV2,
} from "@/types/environment-v2";

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const MAX_DEVICES = 32;
const MAX_METRICS_PER_DEVICE = 16;

export type EnvironmentIngestValidationCodeV2 =
  | "INVALID_PAYLOAD"
  | "INVALID_SCHEMA_VERSION"
  | "INVALID_SENT_AT"
  | "INVALID_DEVICES"
  | "NO_VALID_READINGS";

export class EnvironmentIngestValidationErrorV2 extends Error {
  constructor(readonly code: EnvironmentIngestValidationCodeV2) {
    super(code);
    this.name = "EnvironmentIngestValidationErrorV2";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function timestamp(value: unknown, now: Date): string | null {
  if (!isUtcTimestamp(value)) return null;
  if (new Date(value).getTime() > now.getTime() + FUTURE_TOLERANCE_MS) return null;
  return value;
}

export function parseEnvironmentIngestPayloadV2(
  input: unknown,
  now = new Date()
): ParsedEnvironmentIngestV2 {
  if (!record(input) || !Number.isFinite(now.getTime())) {
    throw new EnvironmentIngestValidationErrorV2("INVALID_PAYLOAD");
  }
  if (input.schemaVersion !== 2) {
    throw new EnvironmentIngestValidationErrorV2("INVALID_SCHEMA_VERSION");
  }
  const sentAt = timestamp(input.sentAt, now);
  if (!sentAt) throw new EnvironmentIngestValidationErrorV2("INVALID_SENT_AT");
  if (
    !Array.isArray(input.readings) ||
    input.readings.length === 0 ||
    input.readings.length > MAX_DEVICES
  ) {
    throw new EnvironmentIngestValidationErrorV2("INVALID_DEVICES");
  }

  const seen = new Set<string>();
  const readings: EnvironmentIngestReadingV2[] = [];
  const skipped: Array<{ device: string; metric: string }> = [];

  for (const candidate of input.readings) {
    if (!record(candidate) || !isEnvironmentPublicSlug(candidate.device)) {
      throw new EnvironmentIngestValidationErrorV2("INVALID_DEVICES");
    }
    const device = candidate.device;
    if (seen.has(device)) {
      throw new EnvironmentIngestValidationErrorV2("INVALID_DEVICES");
    }
    seen.add(device);
    const sourceUpdatedAt = timestamp(candidate.sourceUpdatedAt, now);
    if (!sourceUpdatedAt || !record(candidate.metrics)) {
      for (const metric of Object.keys(record(candidate.metrics) ? candidate.metrics : {})) {
        if (isEnvironmentMetricKey(metric)) skipped.push({ device, metric });
      }
      continue;
    }
    const entries = Object.entries(candidate.metrics);
    if (entries.length === 0 || entries.length > MAX_METRICS_PER_DEVICE) {
      throw new EnvironmentIngestValidationErrorV2("INVALID_DEVICES");
    }
    const metrics: EnvironmentIngestReadingV2["metrics"] = {};
    for (const [key, value] of entries) {
      if (!isEnvironmentMetricKey(key)) continue;
      if (!isEnvironmentMetricValue(key, value)) {
        skipped.push({ device, metric: key });
        continue;
      }
      metrics[key] = value;
    }
    if (Object.keys(metrics).length > 0) {
      readings.push({ device, sourceUpdatedAt, metrics });
    }
  }

  if (readings.length === 0) {
    throw new EnvironmentIngestValidationErrorV2("NO_VALID_READINGS");
  }
  return { schemaVersion: 2, sentAt, readings, skipped };
}
