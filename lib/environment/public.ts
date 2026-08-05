import type {
  EnvironmentFreshness,
  EnvironmentHistoryRange,
  EnvironmentHistoryResponse,
  EnvironmentHourlyHistoryPoint,
  EnvironmentHourlyHistoryResponse,
  EnvironmentLatestReading,
  EnvironmentLatestResponse,
  EnvironmentPublicLocation,
  EnvironmentRawHistoryPoint,
  EnvironmentRawHistoryResponse,
  EnvironmentRole,
} from "@/types/environment";

const FRESHNESS_LIMIT_MS = 25 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const PERTH_UTC_OFFSET_MS = 8 * HOUR_MS;
const ROLE_ORDER: EnvironmentRole[] = ["indoor", "outdoor"];

export interface EnvironmentRepositoryLocation {
  id: string;
  slug: string;
  name: { zh: string; en: string; ja: string };
  timezone: "Australia/Perth";
}

export interface EnvironmentRepositoryReading {
  role: EnvironmentRole;
  temperatureC: number;
  humidityPercent: number;
  batteryPercent: number | null;
  sourceUpdatedAt: string;
}

export interface EnvironmentPublicRepository {
  findEnabledLocation(
    slug: string
  ): Promise<EnvironmentRepositoryLocation | null>;
  findLatestReadings(
    locationId: string
  ): Promise<EnvironmentRepositoryReading[]>;
  findReadingsSince(
    locationId: string,
    since: Date
  ): Promise<EnvironmentRepositoryReading[]>;
}

export interface EnvironmentPublicService {
  latest(locationSlug: string): Promise<EnvironmentLatestResponse | null>;
  history(
    locationSlug: string,
    range: "24h"
  ): Promise<EnvironmentRawHistoryResponse | null>;
  history(
    locationSlug: string,
    range: "7d"
  ): Promise<EnvironmentHourlyHistoryResponse | null>;
  history(
    locationSlug: string,
    range: EnvironmentHistoryRange
  ): Promise<EnvironmentHistoryResponse | null>;
}

function parsedTime(value: string): number | null {
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function roundMeasurement(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateEnvironmentFreshness(
  sourceUpdatedAt: string,
  now = new Date()
): Exclude<EnvironmentFreshness, "unavailable"> {
  const sourceTime = parsedTime(sourceUpdatedAt);
  if (sourceTime === null || !Number.isFinite(now.getTime())) return "delayed";
  return now.getTime() - sourceTime > FRESHNESS_LIMIT_MS
    ? "delayed"
    : "fresh";
}

export function perthHourBucket(sourceUpdatedAt: string): string {
  const sourceTime = parsedTime(sourceUpdatedAt);
  if (sourceTime === null) throw new Error("INVALID_SOURCE_TIME");
  const localTime = sourceTime + PERTH_UTC_OFFSET_MS;
  const localBucket = Math.floor(localTime / HOUR_MS) * HOUR_MS;
  return new Date(localBucket - PERTH_UTC_OFFSET_MS).toISOString();
}

function publicLocation(
  location: EnvironmentRepositoryLocation
): EnvironmentPublicLocation {
  return {
    slug: location.slug,
    name: location.name,
    timezone: location.timezone,
  };
}

function newestByRole(readings: EnvironmentRepositoryReading[]) {
  const result: Record<EnvironmentRole, EnvironmentRepositoryReading | null> = {
    indoor: null,
    outdoor: null,
  };

  for (const reading of readings) {
    const timestamp = parsedTime(reading.sourceUpdatedAt);
    if (timestamp === null || !ROLE_ORDER.includes(reading.role)) continue;
    const current = result[reading.role];
    const currentTimestamp = current ? parsedTime(current.sourceUpdatedAt) : null;
    if (currentTimestamp === null || timestamp > currentTimestamp) {
      result[reading.role] = reading;
    }
  }
  return result;
}

function latestReading(
  reading: EnvironmentRepositoryReading | null,
  now: Date
): EnvironmentLatestReading | null {
  if (!reading) return null;
  return {
    temperatureC: reading.temperatureC,
    humidityPercent: reading.humidityPercent,
    batteryPercent: reading.batteryPercent,
    sourceUpdatedAt: new Date(reading.sourceUpdatedAt).toISOString(),
    freshness: calculateEnvironmentFreshness(reading.sourceUpdatedAt, now),
  };
}

function calculateDeltas(
  indoor: EnvironmentLatestReading | null,
  outdoor: EnvironmentLatestReading | null
) {
  if (!indoor || !outdoor) {
    return { temperatureC: null, humidityPercent: null };
  }
  return {
    temperatureC: roundMeasurement(
      indoor.temperatureC - outdoor.temperatureC
    ),
    humidityPercent: roundMeasurement(
      indoor.humidityPercent - outdoor.humidityPercent
    ),
  };
}

function overallFreshness(
  readings: Record<EnvironmentRole, EnvironmentLatestReading | null>
): EnvironmentFreshness {
  if (!readings.indoor && !readings.outdoor) return "unavailable";
  if (
    !readings.indoor ||
    !readings.outdoor ||
    readings.indoor.freshness === "delayed" ||
    readings.outdoor.freshness === "delayed"
  ) {
    return "delayed";
  }
  return "fresh";
}

function latestUpdatedAt(
  readings: Record<EnvironmentRole, EnvironmentLatestReading | null>
): string | null {
  const timestamps = ROLE_ORDER.flatMap((role) => {
    const value = readings[role]?.sourceUpdatedAt;
    return value ? [value] : [];
  });
  return timestamps.sort().at(-1) ?? null;
}

function boundedReadings(
  readings: EnvironmentRepositoryReading[],
  since: Date,
  now: Date
): EnvironmentRepositoryReading[] {
  const minimum = since.getTime();
  const maximum = now.getTime();
  return readings.filter((reading) => {
    const timestamp = parsedTime(reading.sourceUpdatedAt);
    return (
      timestamp !== null &&
      timestamp >= minimum &&
      timestamp <= maximum &&
      ROLE_ORDER.includes(reading.role)
    );
  });
}

function rawSeries(readings: EnvironmentRepositoryReading[]) {
  const series: Record<EnvironmentRole, EnvironmentRawHistoryPoint[]> = {
    indoor: [],
    outdoor: [],
  };
  for (const reading of readings) {
    series[reading.role].push({
      sourceUpdatedAt: new Date(reading.sourceUpdatedAt).toISOString(),
      temperatureC: reading.temperatureC,
      humidityPercent: reading.humidityPercent,
      batteryPercent: reading.batteryPercent,
    });
  }
  for (const role of ROLE_ORDER) {
    series[role].sort((left, right) =>
      left.sourceUpdatedAt.localeCompare(right.sourceUpdatedAt)
    );
  }
  return series;
}

function hourlySeries(readings: EnvironmentRepositoryReading[]) {
  type Accumulator = {
    temperatureTotal: number;
    humidityTotal: number;
    sampleCount: number;
  };
  const buckets: Record<EnvironmentRole, Map<string, Accumulator>> = {
    indoor: new Map(),
    outdoor: new Map(),
  };

  for (const reading of readings) {
    const bucket = perthHourBucket(reading.sourceUpdatedAt);
    const current = buckets[reading.role].get(bucket) ?? {
      temperatureTotal: 0,
      humidityTotal: 0,
      sampleCount: 0,
    };
    current.temperatureTotal += reading.temperatureC;
    current.humidityTotal += reading.humidityPercent;
    current.sampleCount += 1;
    buckets[reading.role].set(bucket, current);
  }

  const series: Record<EnvironmentRole, EnvironmentHourlyHistoryPoint[]> = {
    indoor: [],
    outdoor: [],
  };
  for (const role of ROLE_ORDER) {
    series[role] = [...buckets[role].entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([sourceUpdatedAt, value]) => ({
        sourceUpdatedAt,
        temperatureC: roundMeasurement(
          value.temperatureTotal / value.sampleCount
        ),
        humidityPercent: roundMeasurement(
          value.humidityTotal / value.sampleCount
        ),
        sampleCount: value.sampleCount,
      }));
  }
  return series;
}

export function createEnvironmentPublicService(
  repository: EnvironmentPublicRepository,
  now: () => Date = () => new Date()
): EnvironmentPublicService {
  async function latest(
    locationSlug: string
  ): Promise<EnvironmentLatestResponse | null> {
    const location = await repository.findEnabledLocation(locationSlug);
    if (!location) return null;

    const currentTime = now();
    const stored = newestByRole(
      await repository.findLatestReadings(location.id)
    );
    const readings = {
      indoor: latestReading(stored.indoor, currentTime),
      outdoor: latestReading(stored.outdoor, currentTime),
    };

    return {
      location: publicLocation(location),
      readings,
      deltas: calculateDeltas(readings.indoor, readings.outdoor),
      updatedAt: latestUpdatedAt(readings),
      freshness: overallFreshness(readings),
    };
  }

  async function history(
    locationSlug: string,
    range: EnvironmentHistoryRange
  ): Promise<EnvironmentHistoryResponse | null> {
    const location = await repository.findEnabledLocation(locationSlug);
    if (!location) return null;

    const currentTime = now();
    const duration = range === "24h" ? DAY_MS : 7 * DAY_MS;
    const since = new Date(currentTime.getTime() - duration);
    const readings = boundedReadings(
      await repository.findReadingsSince(location.id, since),
      since,
      currentTime
    );
    const base = {
      location: publicLocation(location),
      from: since.toISOString(),
      to: currentTime.toISOString(),
    };

    if (range === "24h") {
      return {
        ...base,
        range,
        resolution: "raw",
        series: rawSeries(readings),
      };
    }
    return {
      ...base,
      range,
      resolution: "hour",
      series: hourlySeries(readings),
    };
  }

  return { latest, history } as EnvironmentPublicService;
}

