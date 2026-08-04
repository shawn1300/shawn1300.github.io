import assert from "node:assert/strict";
import test from "node:test";

import {
  EnvironmentStoreError,
  storeEnvironmentReadings,
  type EnvironmentReadingRepository,
  type EnvironmentReadingWrite,
} from "../lib/environment/store";
import type { ParsedEnvironmentIngest } from "../types/environment";

const receivedAt = new Date("2026-08-04T15:07:00.000Z");

function parsed(
  options: {
    includeOutdoor?: boolean;
    skippedRoles?: Array<"indoor" | "outdoor">;
  } = {}
): ParsedEnvironmentIngest {
  return {
    schemaVersion: 1,
    sentAt: "2026-08-04T15:06:59.000Z",
    readings: [
      {
        role: "indoor",
        temperatureC: 26.3,
        humidityPercent: 37.5,
        batteryPercent: 100,
        sourceUpdatedAt: "2026-08-04T15:06:30.000Z",
      },
      ...(options.includeOutdoor === false
        ? []
        : [
            {
              role: "outdoor" as const,
              temperatureC: 24.8,
              humidityPercent: 52.1,
              batteryPercent: null,
              sourceUpdatedAt: "2026-08-04T15:06:28.000Z",
            },
          ]),
    ],
    skippedRoles: options.skippedRoles ?? [],
  };
}

function fakeRepository(options: {
  sensors?: Map<"indoor" | "outdoor", string>;
  status?: "stored" | "duplicate";
  failRole?: "indoor" | "outdoor";
} = {}) {
  const writes: EnvironmentReadingWrite[] = [];
  const repository: EnvironmentReadingRepository = {
    async loadSensors() {
      return (
        options.sensors ??
        new Map([
          ["indoor", "sensor-indoor"],
          ["outdoor", "sensor-outdoor"],
        ])
      );
    },
    async writeReading(value) {
      writes.push(value);
      if (value.role === options.failRole) throw new Error("raw database secret");
      return options.status ?? "stored";
    },
  };
  return { repository, writes };
}

test("environment store maps both roles and writes one ten-minute bucket", async () => {
  const { repository, writes } = fakeRepository();
  const result = await storeEnvironmentReadings(parsed(), repository, receivedAt);

  assert.deepEqual(result, [
    { role: "indoor", status: "stored" },
    { role: "outdoor", status: "stored" },
  ]);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].sensorId, "sensor-indoor");
  assert.equal(writes[0].idempotencyKey, "indoor:2026-08-04T15:00:00.000Z");
  assert.equal(writes[0].collectedAt, "2026-08-04T15:07:00.000Z");
});

test("environment store preserves skipped roles and nullable battery", async () => {
  const { repository, writes } = fakeRepository();
  const result = await storeEnvironmentReadings(
    parsed({ includeOutdoor: false, skippedRoles: ["outdoor"] }),
    repository,
    receivedAt
  );

  assert.deepEqual(result, [
    { role: "indoor", status: "stored" },
    { role: "outdoor", status: "skipped" },
  ]);
  assert.equal(writes.length, 1);
});

test("environment store reports idempotent duplicates", async () => {
  const { repository } = fakeRepository({ status: "duplicate" });
  const result = await storeEnvironmentReadings(parsed(), repository, receivedAt);
  assert.deepEqual(result, [
    { role: "indoor", status: "duplicate" },
    { role: "outdoor", status: "duplicate" },
  ]);
});

test("environment store fails safely before writing when a sensor seed is missing", async () => {
  const { repository, writes } = fakeRepository({
    sensors: new Map([["indoor", "sensor-indoor"]]),
  });
  await assert.rejects(
    () => storeEnvironmentReadings(parsed(), repository, receivedAt),
    (error) => {
      assert.equal(error instanceof EnvironmentStoreError, true);
      assert.equal((error as EnvironmentStoreError).code, "SENSOR_MAPPING_MISSING");
      return true;
    }
  );
  assert.deepEqual(writes, []);
});

test("environment store lets the other role finish but exposes only a fixed write error", async () => {
  const { repository, writes } = fakeRepository({ failRole: "indoor" });
  await assert.rejects(
    () => storeEnvironmentReadings(parsed(), repository, receivedAt),
    (error) => {
      assert.equal(error instanceof EnvironmentStoreError, true);
      assert.equal((error as EnvironmentStoreError).code, "WRITE_FAILED");
      assert.equal(String(error).includes("raw database secret"), false);
      return true;
    }
  );
  assert.deepEqual(
    writes.map((item) => item.role).sort(),
    ["indoor", "outdoor"]
  );
});

