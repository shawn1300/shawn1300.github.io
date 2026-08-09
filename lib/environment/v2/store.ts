import type {
  EnvironmentIngestDeviceResultV2,
  EnvironmentMetricKey,
  ParsedEnvironmentIngestV2,
} from "@/types/environment-v2";

const TEN_MINUTES_MS = 10 * 60 * 1000;
const METRIC_ORDER: EnvironmentMetricKey[] = [
  "temperatureC",
  "humidityPercent",
  "co2Ppm",
  "pm25UgM3",
  "batteryPercent",
];

export interface EnvironmentMetricMappingV2 {
  metricId: string;
  metric: EnvironmentMetricKey;
}

export interface EnvironmentDeviceMappingV2 {
  device: string;
  metrics: Map<EnvironmentMetricKey, string>;
}

export interface EnvironmentMetricWriteV2 {
  metricId: string;
  value: number;
  sourceUpdatedAt: string;
  collectedAt: string;
  tenMinuteBucket: string;
  idempotencyKey: string;
}

export interface EnvironmentIngestRepositoryV2 {
  loadDeviceMappings(
    sourceId: string,
    devices: string[]
  ): Promise<Map<string, EnvironmentDeviceMappingV2>>;
  writeMetric(value: EnvironmentMetricWriteV2): Promise<"stored" | "duplicate">;
}

export class EnvironmentStoreErrorV2 extends Error {
  constructor(readonly code: "SOURCE_MAPPING_INVALID" | "WRITE_FAILED") {
    super(code);
    this.name = "EnvironmentStoreErrorV2";
  }
}

export function tenMinuteBucket(receivedAt: Date): string {
  if (!Number.isFinite(receivedAt.getTime())) throw new Error("INVALID_RECEIVED_AT");
  return new Date(
    Math.floor(receivedAt.getTime() / TEN_MINUTES_MS) * TEN_MINUTES_MS
  ).toISOString();
}

export async function storeEnvironmentReadingsV2(
  sourceId: string,
  payload: ParsedEnvironmentIngestV2,
  repository: EnvironmentIngestRepositoryV2,
  receivedAt = new Date()
): Promise<EnvironmentIngestDeviceResultV2[]> {
  const mappings = await repository.loadDeviceMappings(
    sourceId,
    payload.readings.map((reading) => reading.device)
  );
  const bucket = tenMinuteBucket(receivedAt);
  const result = new Map<string, Map<string, "stored" | "duplicate" | "skipped">>();
  const statusMap = (device: string) => {
    let value = result.get(device);
    if (!value) {
      value = new Map();
      result.set(device, value);
    }
    return value;
  };
  for (const skipped of payload.skipped) {
    if (METRIC_ORDER.includes(skipped.metric as EnvironmentMetricKey)) {
      statusMap(skipped.device).set(skipped.metric, "skipped");
    }
  }

  const writes: Array<Promise<void>> = [];
  for (const reading of payload.readings) {
    const mapping = mappings.get(reading.device);
    for (const [metric, value] of Object.entries(reading.metrics) as Array<[
      EnvironmentMetricKey,
      number
    ]>) {
      const metricId = mapping?.metrics.get(metric);
      if (!metricId) {
        statusMap(reading.device).set(metric, "skipped");
        continue;
      }
      writes.push(
        repository
          .writeMetric({
            metricId,
            value,
            sourceUpdatedAt: reading.sourceUpdatedAt,
            collectedAt: receivedAt.toISOString(),
            tenMinuteBucket: bucket,
            idempotencyKey: `v2:${reading.device}:${metric}:${bucket}`,
          })
          .then((status) => {
            statusMap(reading.device).set(metric, status);
          })
      );
    }
  }

  if (writes.length === 0) {
    throw new EnvironmentStoreErrorV2("SOURCE_MAPPING_INVALID");
  }
  const settled = await Promise.allSettled(writes);
  if (settled.some((item) => item.status === "rejected")) {
    throw new EnvironmentStoreErrorV2("WRITE_FAILED");
  }

  return [...result.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([device, metrics]) => ({
      device,
      metrics: [...metrics.entries()]
        .sort(([left], [right]) => {
          const li = METRIC_ORDER.indexOf(left as EnvironmentMetricKey);
          const ri = METRIC_ORDER.indexOf(right as EnvironmentMetricKey);
          return (li < 0 ? 99 : li) - (ri < 0 ? 99 : ri) || left.localeCompare(right);
        })
        .map(([metric, status]) => ({
          metric: metric as EnvironmentMetricKey,
          status,
        })),
    }));
}
