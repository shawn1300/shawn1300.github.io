import assert from "node:assert/strict";
import test from "node:test";

import { createEnvironmentPublicServiceV2, type EnvironmentPublicRepositoryV2 } from "../lib/environment/v2/public";

const now = new Date("2026-08-09T12:00:00.000Z");

function repository(): EnvironmentPublicRepositoryV2 {
  const location = { id: "location-id", slug: "home", name: { zh: "家", en: "Home", ja: "自宅" }, timezone: "Australia/Perth", order: 0 };
  const devices = [
    { id: "inside-id", slug: "home-indoor", name: { zh: "室内", en: "Indoor", ja: "室内" }, placement: "indoor" as const, order: 0 },
    { id: "outside-id", slug: "home-outdoor", name: { zh: "室外", en: "Outdoor", ja: "屋外" }, placement: "outdoor" as const, order: 1 },
  ];
  const metrics = [
    { id: "inside-temp", deviceId: "inside-id", key: "temperatureC" as const, order: 0, showAqi: false },
    { id: "inside-humidity", deviceId: "inside-id", key: "humidityPercent" as const, order: 1, showAqi: false },
    { id: "outside-temp", deviceId: "outside-id", key: "temperatureC" as const, order: 0, showAqi: false },
    { id: "outside-humidity", deviceId: "outside-id", key: "humidityPercent" as const, order: 1, showAqi: false },
  ];
  const readings = [
    { metricId: "inside-temp", value: 25, sourceUpdatedAt: "2026-08-09T11:55:00.000Z" },
    { metricId: "inside-humidity", value: 40, sourceUpdatedAt: "2026-08-09T11:55:00.000Z" },
    { metricId: "outside-temp", value: 20, sourceUpdatedAt: "2026-08-09T11:55:00.000Z" },
    { metricId: "outside-humidity", value: 55, sourceUpdatedAt: "2026-08-09T11:55:00.000Z" },
  ];
  return {
    async listPublicLocations() { return [location]; },
    async findPublicLocation(slug) { return slug === "home" ? location : null; },
    async findDevices() { return devices; },
    async findMetrics() { return metrics; },
    async findComparison() { return { indoorDeviceId: "inside-id", outdoorDeviceId: "outside-id" }; },
    async findLatestReadings() { return readings; },
    async findReadingsSince() { return readings; },
  };
}

test("v2 latest projects modular devices and home comparison without private fields", async () => {
  const value = await createEnvironmentPublicServiceV2(repository(), () => now).latest("home");
  assert.ok(value);
  assert.equal(value.devices.length, 2);
  assert.deepEqual(value.comparison, {
    indoorDevice: "home-indoor", outdoorDevice: "home-outdoor", temperatureC: 5, humidityPercent: -15,
  });
  assert.equal(value.freshness, "fresh");
  const serialized = JSON.stringify(value);
  for (const forbidden of ["token", "sourceId", "metricId", "location-id", "inside-id"]) assert.equal(serialized.includes(forbidden), false);
});

test("v2 history emits one independent series per device and metric", async () => {
  const value = await createEnvironmentPublicServiceV2(repository(), () => now).history("home", "24h");
  assert.ok(value);
  assert.equal(value.series.length, 4);
  assert.deepEqual(value.series.map((series) => `${series.device}:${series.metric}`), [
    "home-indoor:temperatureC", "home-indoor:humidityPercent", "home-outdoor:temperatureC", "home-outdoor:humidityPercent",
  ]);
});
