import { startOfHour } from "date-fns";
import { TZDate } from "@date-fns/tz";

import { calculateChinaPm25Aqi } from "@/lib/environment/air-quality/china-aqi";
import { calculateCo2Reference } from "@/lib/environment/air-quality/co2";
import { calculateUsPm25NowCast } from "@/lib/environment/air-quality/us-aqi";
import { calculateEnvironmentFreshness } from "@/lib/environment/public";
import { environmentMetricDefinition } from "@/lib/environment/v2/metrics";
import type {
  EnvironmentDevicePlacement,
  EnvironmentHistoryResponseV2,
  EnvironmentLatestResponseV2,
  EnvironmentLocationSummaryV2,
  EnvironmentMetricKey,
} from "@/types/environment-v2";
import type { EnvironmentHistoryRange, EnvironmentLocalizedName } from "@/types/environment";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface EnvironmentRepositoryLocationV2 extends EnvironmentLocationSummaryV2 {
  id: string;
}
export interface EnvironmentRepositoryDeviceV2 {
  id: string;
  slug: string;
  name: EnvironmentLocalizedName;
  placement: EnvironmentDevicePlacement;
  order: number;
}
export interface EnvironmentRepositoryMetricV2 {
  id: string;
  deviceId: string;
  key: EnvironmentMetricKey;
  order: number;
  showAqi: boolean;
}
export interface EnvironmentRepositoryMetricReadingV2 {
  metricId: string;
  value: number;
  sourceUpdatedAt: string;
}
export interface EnvironmentRepositoryComparisonV2 {
  indoorDeviceId: string;
  outdoorDeviceId: string;
}

export interface EnvironmentPublicRepositoryV2 {
  listPublicLocations(): Promise<EnvironmentRepositoryLocationV2[]>;
  findPublicLocation(slug: string): Promise<EnvironmentRepositoryLocationV2 | null>;
  findDevices(locationId: string): Promise<EnvironmentRepositoryDeviceV2[]>;
  findMetrics(deviceIds: string[]): Promise<EnvironmentRepositoryMetricV2[]>;
  findComparison(locationId: string): Promise<EnvironmentRepositoryComparisonV2 | null>;
  findLatestReadings(metricIds: string[]): Promise<EnvironmentRepositoryMetricReadingV2[]>;
  findReadingsSince(metricIds: string[], since: Date): Promise<EnvironmentRepositoryMetricReadingV2[]>;
}

function publicLocation(location: EnvironmentRepositoryLocationV2): EnvironmentLocationSummaryV2 {
  return { slug: location.slug, name: location.name, timezone: location.timezone, order: location.order };
}

function rounded(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function createEnvironmentPublicServiceV2(
  repository: EnvironmentPublicRepositoryV2,
  clock: () => Date = () => new Date()
) {
  async function structure(slug: string) {
    const location = await repository.findPublicLocation(slug);
    if (!location) return null;
    const [devices, comparison] = await Promise.all([
      repository.findDevices(location.id),
      repository.findComparison(location.id),
    ]);
    const metrics = await repository.findMetrics(devices.map((device) => device.id));
    return { location, devices, metrics, comparison };
  }

  async function locations() {
    return (await repository.listPublicLocations()).map(publicLocation);
  }

  async function latest(slug: string): Promise<EnvironmentLatestResponseV2 | null> {
    const model = await structure(slug);
    if (!model) return null;
    const now = clock();
    const metricIds = model.metrics.map((metric) => metric.id);
    const [latestRows, derivedRows] = await Promise.all([
      repository.findLatestReadings(metricIds),
      repository.findReadingsSince(metricIds, new Date(now.getTime() - 12 * 60 * 60 * 1000)),
    ]);
    const latestByMetric = new Map(latestRows.map((reading) => [reading.metricId, reading]));
    const derivedByMetric = new Map<string, EnvironmentRepositoryMetricReadingV2[]>();
    for (const reading of derivedRows) {
      const values = derivedByMetric.get(reading.metricId) ?? [];
      values.push(reading);
      derivedByMetric.set(reading.metricId, values);
    }

    const devices = model.devices.map((device) => {
      const metrics = Object.fromEntries(
        model.metrics
          .filter((metric) => metric.deviceId === device.id)
          .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
          .flatMap((metric) => {
            const reading = latestByMetric.get(metric.id);
            return reading ? [[metric.key, {
              key: metric.key,
              value: rounded(reading.value),
              unit: environmentMetricDefinition(metric.key).unit,
              sourceUpdatedAt: new Date(reading.sourceUpdatedAt).toISOString(),
              freshness: calculateEnvironmentFreshness(reading.sourceUpdatedAt, now),
            }]] : [];
          })
      );
      const freshnessValues = Object.values(metrics).map((metric) => metric.freshness);
      const declaredMetricCount = model.metrics.filter((metric) => metric.deviceId === device.id).length;
      const freshness = freshnessValues.length === 0
        ? "unavailable" as const
        : freshnessValues.length === declaredMetricCount && freshnessValues.every((value) => value === "fresh")
          ? "fresh" as const
          : "delayed" as const;
      return { slug: device.slug, name: device.name, placement: device.placement, order: device.order, freshness, metrics };
    });

    const airQuality: EnvironmentLatestResponseV2["airQuality"] = {};
    const co2: EnvironmentLatestResponseV2["co2"] = {};
    for (const metric of model.metrics) {
      const device = model.devices.find((candidate) => candidate.id === metric.deviceId);
      if (!device) continue;
      const samples = (derivedByMetric.get(metric.id) ?? []).map((reading) => ({
        sourceUpdatedAt: reading.sourceUpdatedAt,
        value: reading.value,
      }));
      if (metric.key === "pm25UgM3" && metric.showAqi) {
        const china = calculateChinaPm25Aqi(samples, now);
        const unitedStates = calculateUsPm25NowCast(samples, now);
        airQuality[device.slug] = {
          china: {
            status: china.status,
            standard: "HJ 633-2026",
            value: china.aqi,
            category: china.category,
            calculatedAt: china.status === "available" ? now.toISOString() : null,
          },
          unitedStates: {
            status: unitedStates.status,
            standard: "US EPA 2026 NowCast",
            value: unitedStates.aqi,
            category: unitedStates.category,
            calculatedAt: unitedStates.status === "available" ? now.toISOString() : null,
          },
        };
      }
      if (metric.key === "co2Ppm") {
        const reference = calculateCo2Reference(samples, now);
        co2[device.slug] = {
          ...reference,
          calculatedAt: reference.status === "available" ? now.toISOString() : null,
        };
      }
    }

    let comparison: EnvironmentLatestResponseV2["comparison"] = null;
    if (model.comparison) {
      const indoor = model.devices.find((device) => device.id === model.comparison?.indoorDeviceId);
      const outdoor = model.devices.find((device) => device.id === model.comparison?.outdoorDeviceId);
      const indoorLatest = devices.find((device) => device.slug === indoor?.slug);
      const outdoorLatest = devices.find((device) => device.slug === outdoor?.slug);
      const delta = (key: "temperatureC" | "humidityPercent") => {
        const left = indoorLatest?.metrics[key]?.value;
        const right = outdoorLatest?.metrics[key]?.value;
        return left === undefined || right === undefined ? null : rounded(left - right);
      };
      if (indoor && outdoor) comparison = {
        indoorDevice: indoor.slug,
        outdoorDevice: outdoor.slug,
        temperatureC: delta("temperatureC"),
        humidityPercent: delta("humidityPercent"),
      };
    }
    const timestamps = devices.flatMap((device) =>
      Object.values(device.metrics).map((metric) => metric.sourceUpdatedAt)
    );
    const freshness = devices.length === 0 || devices.every((device) => device.freshness === "unavailable")
      ? "unavailable" as const
      : devices.every((device) => device.freshness === "fresh")
        ? "fresh" as const
        : "delayed" as const;
    return {
      location: publicLocation(model.location), devices, comparison, airQuality, co2,
      updatedAt: timestamps.sort().at(-1) ?? null,
      freshness,
    };
  }

  async function history(slug: string, range: EnvironmentHistoryRange): Promise<EnvironmentHistoryResponseV2 | null> {
    const model = await structure(slug);
    if (!model) return null;
    const now = clock();
    const since = new Date(now.getTime() - (range === "24h" ? DAY_MS : 7 * DAY_MS));
    const readings = (await repository.findReadingsSince(model.metrics.map((metric) => metric.id), since))
      .filter((reading) => {
        const time = Date.parse(reading.sourceUpdatedAt);
        return Number.isFinite(time) && time >= since.getTime() && time <= now.getTime();
      });
    const deviceById = new Map(model.devices.map((device) => [device.id, device]));
    const series = model.metrics
      .filter((metric) => environmentMetricDefinition(metric.key).chartedByDefault)
      .map((metric) => {
        const device = deviceById.get(metric.deviceId)!;
        const metricReadings = readings.filter((reading) => reading.metricId === metric.id);
        const points = range === "24h"
          ? metricReadings
              .sort((a, b) => a.sourceUpdatedAt.localeCompare(b.sourceUpdatedAt))
              .map((reading) => ({ sourceUpdatedAt: new Date(reading.sourceUpdatedAt).toISOString(), value: rounded(reading.value) }))
          : [...metricReadings.reduce((buckets, reading) => {
              const bucket = startOfHour(new TZDate(reading.sourceUpdatedAt, model.location.timezone)).toISOString();
              const values = buckets.get(bucket) ?? [];
              values.push(reading.value);
              buckets.set(bucket, values);
              return buckets;
            }, new Map<string, number[]>()).entries()]
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([sourceUpdatedAt, values]) => ({
                sourceUpdatedAt,
                value: rounded(values.reduce((sum, value) => sum + value, 0) / values.length),
                sampleCount: values.length,
              }));
        return {
          device: device.slug, deviceName: device.name, placement: device.placement,
          metric: metric.key, unit: environmentMetricDefinition(metric.key).unit, points,
        };
      });
    return {
      location: publicLocation(model.location), range,
      resolution: range === "24h" ? "raw" : "hour",
      from: since.toISOString(), to: now.toISOString(), series,
    };
  }

  return { locations, latest, history };
}
