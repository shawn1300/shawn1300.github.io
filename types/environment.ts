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

