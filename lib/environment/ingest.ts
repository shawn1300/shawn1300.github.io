import { createHash, timingSafeEqual } from "node:crypto";

import type {
  EnvironmentIngestReading,
  EnvironmentRole,
  ParsedEnvironmentIngest,
} from "@/types/environment";

const ROLES = new Set<EnvironmentRole>(["indoor", "outdoor"]);
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const TEN_MINUTES_MS = 10 * 60 * 1000;
const UTC_TIMESTAMP =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/;

export type EnvironmentIngestValidationCode =
  | "INVALID_PAYLOAD"
  | "INVALID_SCHEMA_VERSION"
  | "INVALID_SENT_AT"
  | "INVALID_ROLES"
  | "NO_VALID_READINGS";

export class EnvironmentIngestValidationError extends Error {
  constructor(readonly code: EnvironmentIngestValidationCode) {
    super(code);
    this.name = "EnvironmentIngestValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseUtcTimestamp(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const match = UTC_TIMESTAMP.exec(value);
  if (!match) return null;

  const milliseconds = (match[2] ?? "").padEnd(3, "0");
  const canonical = `${match[1]}.${milliseconds}Z`;
  const parsed = new Date(canonical);
  if (!Number.isFinite(parsed.getTime())) return null;
  if (parsed.toISOString() !== canonical) return null;
  return parsed;
}

function isObviousFuture(value: Date, now: Date): boolean {
  return value.getTime() > now.getTime() + FUTURE_TOLERANCE_MS;
}

function nullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function inRange(value: number, minimum: number, maximum: number): boolean {
  return value >= minimum && value <= maximum;
}

function parseReading(
  input: Record<string, unknown>,
  role: EnvironmentRole,
  now: Date
): EnvironmentIngestReading | null {
  const temperatureC = nullableNumber(input.temperatureC);
  const humidityPercent = nullableNumber(input.humidityPercent);
  const sourceUpdatedAt = parseUtcTimestamp(input.sourceUpdatedAt);

  if (
    temperatureC === null ||
    humidityPercent === null ||
    sourceUpdatedAt === null ||
    isObviousFuture(sourceUpdatedAt, now) ||
    !inRange(temperatureC, -30, 100) ||
    !inRange(humidityPercent, 0, 100)
  ) {
    return null;
  }

  const batteryMissing =
    input.batteryPercent === null || input.batteryPercent === undefined;
  const batteryPercent = nullableNumber(input.batteryPercent);
  if (
    !batteryMissing &&
    (batteryPercent === null || !inRange(batteryPercent, 0, 100))
  ) {
    return null;
  }

  return {
    role,
    temperatureC,
    humidityPercent,
    batteryPercent,
    sourceUpdatedAt: sourceUpdatedAt.toISOString(),
  };
}

export function parseEnvironmentIngestPayload(
  input: unknown,
  now = new Date()
): ParsedEnvironmentIngest {
  if (!isRecord(input) || !Number.isFinite(now.getTime())) {
    throw new EnvironmentIngestValidationError("INVALID_PAYLOAD");
  }
  if (input.schemaVersion !== 1) {
    throw new EnvironmentIngestValidationError("INVALID_SCHEMA_VERSION");
  }

  const sentAt = parseUtcTimestamp(input.sentAt);
  if (!sentAt || isObviousFuture(sentAt, now)) {
    throw new EnvironmentIngestValidationError("INVALID_SENT_AT");
  }
  if (
    !Array.isArray(input.readings) ||
    input.readings.length === 0 ||
    input.readings.length > ROLES.size
  ) {
    throw new EnvironmentIngestValidationError("INVALID_ROLES");
  }

  const seen = new Set<EnvironmentRole>();
  const candidates: Array<{
    role: EnvironmentRole;
    input: Record<string, unknown>;
  }> = [];

  for (const item of input.readings) {
    if (!isRecord(item) || !ROLES.has(item.role as EnvironmentRole)) {
      throw new EnvironmentIngestValidationError("INVALID_ROLES");
    }
    const role = item.role as EnvironmentRole;
    if (seen.has(role)) {
      throw new EnvironmentIngestValidationError("INVALID_ROLES");
    }
    seen.add(role);
    candidates.push({ role, input: item });
  }

  const readings: EnvironmentIngestReading[] = [];
  const skippedRoles: EnvironmentRole[] = [];
  for (const candidate of candidates) {
    const parsed = parseReading(candidate.input, candidate.role, now);
    if (parsed) readings.push(parsed);
    else skippedRoles.push(candidate.role);
  }

  if (readings.length === 0) {
    throw new EnvironmentIngestValidationError("NO_VALID_READINGS");
  }

  return {
    schemaVersion: 1,
    sentAt: sentAt.toISOString(),
    readings,
    skippedRoles,
  };
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function bearerTokenMatches(
  authorization: string | null,
  expectedToken: string | undefined
): boolean {
  if (!authorization?.startsWith("Bearer ") || !expectedToken) return false;
  const suppliedToken = authorization.slice("Bearer ".length);
  if (!suppliedToken || /\s/.test(suppliedToken)) return false;
  return timingSafeEqual(digest(suppliedToken), digest(expectedToken));
}

export function idempotencyKey(role: EnvironmentRole, receivedAt: Date): string {
  const timestamp = receivedAt.getTime();
  if (!Number.isFinite(timestamp)) {
    throw new Error("INVALID_RECEIVED_AT");
  }
  const bucket = new Date(
    Math.floor(timestamp / TEN_MINUTES_MS) * TEN_MINUTES_MS
  );
  return `${role}:${bucket.toISOString()}`;
}

