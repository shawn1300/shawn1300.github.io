import { idempotencyKey } from "@/lib/environment/ingest";
import type {
  EnvironmentIngestReading,
  EnvironmentIngestRoleResult,
  EnvironmentRole,
  ParsedEnvironmentIngest,
} from "@/types/environment";

export interface EnvironmentReadingWrite extends EnvironmentIngestReading {
  sensorId: string;
  collectedAt: string;
  idempotencyKey: string;
}

export interface EnvironmentReadingRepository {
  loadSensors(locationSlug: string): Promise<Map<EnvironmentRole, string>>;
  writeReading(
    value: EnvironmentReadingWrite
  ): Promise<"stored" | "duplicate">;
}

export type EnvironmentStoreErrorCode =
  | "SENSOR_MAPPING_MISSING"
  | "WRITE_FAILED";

export class EnvironmentStoreError extends Error {
  constructor(readonly code: EnvironmentStoreErrorCode) {
    super(code);
    this.name = "EnvironmentStoreError";
  }
}

const ROLE_ORDER: EnvironmentRole[] = ["indoor", "outdoor"];

export async function storeEnvironmentReadings(
  payload: ParsedEnvironmentIngest,
  repository: EnvironmentReadingRepository,
  receivedAt = new Date()
): Promise<EnvironmentIngestRoleResult[]> {
  const sensors = await repository.loadSensors("home");
  for (const reading of payload.readings) {
    if (!sensors.has(reading.role)) {
      throw new EnvironmentStoreError("SENSOR_MAPPING_MISSING");
    }
  }

  const writes = await Promise.allSettled(
    payload.readings.map(async (reading) => {
      const sensorId = sensors.get(reading.role);
      if (!sensorId) throw new EnvironmentStoreError("SENSOR_MAPPING_MISSING");
      const status = await repository.writeReading({
        ...reading,
        sensorId,
        collectedAt: receivedAt.toISOString(),
        idempotencyKey: idempotencyKey(reading.role, receivedAt),
      });
      return { role: reading.role, status } satisfies EnvironmentIngestRoleResult;
    })
  );

  if (writes.some((result) => result.status === "rejected")) {
    throw new EnvironmentStoreError("WRITE_FAILED");
  }

  const resultByRole = new Map<EnvironmentRole, EnvironmentIngestRoleResult>();
  for (const result of writes) {
    if (result.status === "fulfilled") {
      resultByRole.set(result.value.role, result.value);
    }
  }
  for (const role of payload.skippedRoles) {
    resultByRole.set(role, { role, status: "skipped" });
  }

  return ROLE_ORDER.flatMap((role) => {
    const result = resultByRole.get(role);
    return result ? [result] : [];
  });
}

