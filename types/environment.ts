export type EnvironmentRole = "indoor" | "outdoor";

export interface EnvironmentIngestReading {
  role: EnvironmentRole;
  temperatureC: number;
  humidityPercent: number;
  batteryPercent: number | null;
  sourceUpdatedAt: string;
}

export interface ParsedEnvironmentIngest {
  schemaVersion: 1;
  sentAt: string;
  readings: EnvironmentIngestReading[];
  skippedRoles: EnvironmentRole[];
}

export type EnvironmentIngestResultStatus =
  | "stored"
  | "duplicate"
  | "skipped";

export interface EnvironmentIngestRoleResult {
  role: EnvironmentRole;
  status: EnvironmentIngestResultStatus;
}

export interface EnvironmentLocalizedName {
  zh: string;
  en: string;
  ja: string;
}

export interface EnvironmentPublicLocation {
  slug: string;
  name: EnvironmentLocalizedName;
  timezone: "Australia/Perth";
}

export type EnvironmentFreshness = "fresh" | "delayed" | "unavailable";

export interface EnvironmentLatestReading {
  temperatureC: number;
  humidityPercent: number;
  batteryPercent: number | null;
  sourceUpdatedAt: string;
  freshness: Exclude<EnvironmentFreshness, "unavailable">;
}

export interface EnvironmentLatestResponse {
  location: EnvironmentPublicLocation;
  readings: Record<EnvironmentRole, EnvironmentLatestReading | null>;
  deltas: {
    temperatureC: number | null;
    humidityPercent: number | null;
  };
  updatedAt: string | null;
  freshness: EnvironmentFreshness;
}

export type EnvironmentHistoryRange = "24h" | "7d";

export interface EnvironmentRawHistoryPoint {
  sourceUpdatedAt: string;
  temperatureC: number;
  humidityPercent: number;
  batteryPercent: number | null;
}

export interface EnvironmentHourlyHistoryPoint {
  sourceUpdatedAt: string;
  temperatureC: number;
  humidityPercent: number;
  sampleCount: number;
}

interface EnvironmentHistoryResponseBase {
  location: EnvironmentPublicLocation;
  from: string;
  to: string;
}

export interface EnvironmentRawHistoryResponse
  extends EnvironmentHistoryResponseBase {
  range: "24h";
  resolution: "raw";
  series: Record<EnvironmentRole, EnvironmentRawHistoryPoint[]>;
}

export interface EnvironmentHourlyHistoryResponse
  extends EnvironmentHistoryResponseBase {
  range: "7d";
  resolution: "hour";
  series: Record<EnvironmentRole, EnvironmentHourlyHistoryPoint[]>;
}

export type EnvironmentHistoryResponse =
  | EnvironmentRawHistoryResponse
  | EnvironmentHourlyHistoryResponse;
