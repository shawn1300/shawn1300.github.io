import type {
  EnvironmentMetricDefinition,
  EnvironmentMetricKey,
} from "@/types/environment-v2";

export const ENVIRONMENT_METRICS = {
  temperatureC: {
    key: "temperatureC",
    unit: "°C",
    minimum: -30,
    maximum: 100,
    maximumFractionDigits: 1,
    chartedByDefault: true,
    aggregation: "average",
  },
  humidityPercent: {
    key: "humidityPercent",
    unit: "%",
    minimum: 0,
    maximum: 100,
    maximumFractionDigits: 1,
    chartedByDefault: true,
    aggregation: "average",
  },
  co2Ppm: {
    key: "co2Ppm",
    unit: "ppm",
    minimum: 1,
    maximum: 50_000,
    maximumFractionDigits: 0,
    chartedByDefault: true,
    aggregation: "average",
  },
  pm25UgM3: {
    key: "pm25UgM3",
    unit: "µg/m³",
    minimum: 0,
    maximum: 5_000,
    maximumFractionDigits: 1,
    chartedByDefault: true,
    aggregation: "average",
  },
  batteryPercent: {
    key: "batteryPercent",
    unit: "%",
    minimum: 0,
    maximum: 100,
    maximumFractionDigits: 0,
    chartedByDefault: false,
    aggregation: "latest",
  },
} as const satisfies Record<EnvironmentMetricKey, EnvironmentMetricDefinition>;

const METRIC_KEYS = new Set<string>(Object.keys(ENVIRONMENT_METRICS));
const DEVICE_PLACEMENTS = new Set(["indoor", "outdoor", "other"]);
const PUBLIC_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isEnvironmentMetricKey(
  value: unknown
): value is EnvironmentMetricKey {
  return typeof value === "string" && METRIC_KEYS.has(value);
}

export function environmentMetricDefinition(
  key: EnvironmentMetricKey
): EnvironmentMetricDefinition {
  return ENVIRONMENT_METRICS[key];
}

export function isEnvironmentMetricValue(
  key: EnvironmentMetricKey,
  value: unknown
): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  const definition = ENVIRONMENT_METRICS[key];
  return value >= definition.minimum && value <= definition.maximum;
}

export function isEnvironmentDevicePlacement(
  value: unknown
): value is "indoor" | "outdoor" | "other" {
  return typeof value === "string" && DEVICE_PLACEMENTS.has(value);
}

export function isEnvironmentPublicSlug(value: unknown): value is string {
  return typeof value === "string" && PUBLIC_SLUG.test(value);
}

export function isUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !value.endsWith("Z")) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}
