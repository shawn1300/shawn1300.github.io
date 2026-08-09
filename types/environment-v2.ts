import type {
  EnvironmentFreshness,
  EnvironmentHistoryRange,
  EnvironmentLocalizedName,
} from "@/types/environment";

export type EnvironmentSourceType = "home_assistant" | "esp32";

export type EnvironmentDevicePlacement = "indoor" | "outdoor" | "other";

export type EnvironmentMetricKey =
  | "temperatureC"
  | "humidityPercent"
  | "co2Ppm"
  | "pm25UgM3"
  | "batteryPercent";

export type EnvironmentMetricUnit = "°C" | "%" | "ppm" | "µg/m³";

export interface EnvironmentMetricDefinition {
  key: EnvironmentMetricKey;
  unit: EnvironmentMetricUnit;
  minimum: number;
  maximum: number;
  maximumFractionDigits: number;
  chartedByDefault: boolean;
  aggregation: "average" | "latest";
}

export interface EnvironmentLocationSummaryV2 {
  slug: string;
  name: EnvironmentLocalizedName;
  timezone: string;
  order: number;
}

export interface EnvironmentLatestMetricV2 {
  key: EnvironmentMetricKey;
  value: number;
  unit: EnvironmentMetricUnit;
  sourceUpdatedAt: string;
  freshness: Exclude<EnvironmentFreshness, "unavailable">;
}

export interface EnvironmentLatestDeviceV2 {
  slug: string;
  name: EnvironmentLocalizedName;
  placement: EnvironmentDevicePlacement;
  order: number;
  freshness: EnvironmentFreshness;
  metrics: Partial<Record<EnvironmentMetricKey, EnvironmentLatestMetricV2>>;
}

export type EnvironmentDerivedStatus = "available" | "insufficient_data";

export interface EnvironmentAqiReferenceV2 {
  status: EnvironmentDerivedStatus;
  standard: "HJ 633-2026" | "US EPA 2026 NowCast";
  value: number | null;
  category: string | null;
  calculatedAt: string | null;
}

export interface EnvironmentCo2ReferenceV2 {
  status: EnvironmentDerivedStatus;
  averagePpm: number | null;
  category: "good" | "adequate" | "poor" | null;
  calculatedAt: string | null;
}

export interface EnvironmentLatestResponseV2 {
  location: EnvironmentLocationSummaryV2;
  devices: EnvironmentLatestDeviceV2[];
  comparison: {
    indoorDevice: string;
    outdoorDevice: string;
    temperatureC: number | null;
    humidityPercent: number | null;
  } | null;
  airQuality: Record<
    string,
    {
      china: EnvironmentAqiReferenceV2;
      unitedStates: EnvironmentAqiReferenceV2;
    }
  >;
  co2: Record<string, EnvironmentCo2ReferenceV2>;
  updatedAt: string | null;
  freshness: EnvironmentFreshness;
}

export interface EnvironmentHistoryPointV2 {
  sourceUpdatedAt: string;
  value: number;
  sampleCount?: number;
}

export interface EnvironmentHistorySeriesV2 {
  device: string;
  deviceName: EnvironmentLocalizedName;
  placement: EnvironmentDevicePlacement;
  metric: EnvironmentMetricKey;
  unit: EnvironmentMetricUnit;
  points: EnvironmentHistoryPointV2[];
}

export interface EnvironmentHistoryResponseV2 {
  location: EnvironmentLocationSummaryV2;
  range: EnvironmentHistoryRange;
  resolution: "raw" | "hour";
  from: string;
  to: string;
  series: EnvironmentHistorySeriesV2[];
}

export interface EnvironmentIngestMetricResultV2 {
  metric: EnvironmentMetricKey;
  status: "stored" | "duplicate" | "skipped";
}

export interface EnvironmentIngestDeviceResultV2 {
  device: string;
  metrics: EnvironmentIngestMetricResultV2[];
}

export interface EnvironmentIngestReadingV2 {
  device: string;
  sourceUpdatedAt: string;
  metrics: Partial<Record<EnvironmentMetricKey, number>>;
}

export interface ParsedEnvironmentIngestV2 {
  schemaVersion: 2;
  sentAt: string;
  readings: EnvironmentIngestReadingV2[];
  skipped: Array<{ device: string; metric: string }>;
}

