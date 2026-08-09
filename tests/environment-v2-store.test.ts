import assert from "node:assert/strict";
import test from "node:test";

import {
  EnvironmentStoreErrorV2,
  type EnvironmentMetricWriteV2,
  storeEnvironmentReadingsV2,
  tenMinuteBucket,
} from "../lib/environment/v2/store";
import type { ParsedEnvironmentIngestV2 } from "../types/environment-v2";

const receivedAt = new Date("2026-08-09T01:17:12.000Z");
const parsed: ParsedEnvironmentIngestV2 = {
  schemaVersion: 2,
  sentAt: "2026-08-09T01:16:00.000Z",
  readings: [
    {
      device: "garden-air",
      sourceUpdatedAt: "2026-08-09T01:15:00.000Z",
      metrics: { temperatureC: 22, humidityPercent: 45, co2Ppm: 700 },
    },
  ],
  skipped: [{ device: "garden-air", metric: "vocPpb" }],
};

test("v2 store applies one server bucket and retains partial skipped metrics", async () => {
  const writes: EnvironmentMetricWriteV2[] = [];
  const result = await storeEnvironmentReadingsV2(
    "source-id",
    parsed,
    {
      async loadDeviceMappings() {
        return new Map([
          [
            "garden-air",
            {
              device: "garden-air",
              metrics: new Map([
                ["temperatureC", "metric-temperature"],
                ["humidityPercent", "metric-humidity"],
              ]),
            },
          ],
        ]);
      },
      async writeMetric(value) {
        writes.push(value);
        return value.metricId === "metric-temperature" ? "stored" : "duplicate";
      },
    },
    receivedAt
  );
  assert.equal(tenMinuteBucket(receivedAt), "2026-08-09T01:10:00.000Z");
  assert.equal(writes.length, 2);
  assert.ok(writes.every((write) => write.tenMinuteBucket === "2026-08-09T01:10:00.000Z"));
  assert.deepEqual(result, [
    {
      device: "garden-air",
      metrics: [
        { metric: "temperatureC", status: "stored" },
        { metric: "humidityPercent", status: "duplicate" },
        { metric: "co2Ppm", status: "skipped" },
      ],
    },
  ]);
});

test("v2 store hides missing ownership and waits for independent writes", async () => {
  await assert.rejects(
    storeEnvironmentReadingsV2(
      "source-id",
      parsed,
      {
        async loadDeviceMappings() { return new Map(); },
        async writeMetric() { return "stored"; },
      },
      receivedAt
    ),
    (error) => error instanceof EnvironmentStoreErrorV2 && error.code === "SOURCE_MAPPING_INVALID"
  );

  let attempted = 0;
  await assert.rejects(
    storeEnvironmentReadingsV2(
      "source-id",
      parsed,
      {
        async loadDeviceMappings() {
          return new Map([["garden-air", { device: "garden-air", metrics: new Map([
            ["temperatureC", "one"], ["humidityPercent", "two"], ["co2Ppm", "three"],
          ]) }]]);
        },
        async writeMetric(value) {
          attempted += 1;
          if (value.metricId === "two") throw new Error("database detail");
          return "stored";
        },
      },
      receivedAt
    ),
    (error) => error instanceof EnvironmentStoreErrorV2 && error.code === "WRITE_FAILED"
  );
  assert.equal(attempted, 3);
});
