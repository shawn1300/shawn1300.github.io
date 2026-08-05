import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateEnvironmentFreshness,
  createEnvironmentPublicService,
  perthHourBucket,
  type EnvironmentPublicRepository,
  type EnvironmentRepositoryReading,
} from "../lib/environment/public";

const now = new Date("2026-08-04T16:00:00.000Z");
const location = {
  id: "private-location-id",
  slug: "home",
  name: { zh: "家", en: "Home", ja: "自宅" },
  timezone: "Australia/Perth" as const,
};

function reading(
  role: "indoor" | "outdoor",
  sourceUpdatedAt: string,
  overrides: Partial<EnvironmentRepositoryReading> = {}
): EnvironmentRepositoryReading {
  return {
    role,
    temperatureC: role === "indoor" ? 26.3 : 24.8,
    humidityPercent: role === "indoor" ? 37.5 : 52.1,
    batteryPercent: role === "indoor" ? 100 : null,
    sourceUpdatedAt,
    ...overrides,
  };
}

function repository(options: {
  locationExists?: boolean;
  latest?: EnvironmentRepositoryReading[];
  history?: EnvironmentRepositoryReading[];
} = {}) {
  const requestedSince: Date[] = [];
  const value: EnvironmentPublicRepository = {
    async findEnabledLocation(slug) {
      return options.locationExists === false || slug !== "home" ? null : location;
    },
    async findLatestReadings() {
      return options.latest ?? [];
    },
    async findReadingsSince(_locationId, since) {
      requestedSince.push(since);
      return options.history ?? [];
    },
  };
  return { value, requestedSince };
}

test("freshness changes only after the 25-minute boundary", () => {
  assert.equal(
    calculateEnvironmentFreshness(
      "2026-08-04T15:35:00.000Z",
      now
    ),
    "fresh"
  );
  assert.equal(
    calculateEnvironmentFreshness(
      "2026-08-04T15:34:59.999Z",
      now
    ),
    "delayed"
  );
});

test("latest projects safe fields, newest role values, and indoor-minus-outdoor deltas", async () => {
  const fake = repository({
    latest: [
      reading("outdoor", "2026-08-04T15:49:00.000Z"),
      reading("indoor", "2026-08-04T15:20:00.000Z", {
        temperatureC: 99,
      }),
      reading("indoor", "2026-08-04T15:50:00.000Z"),
    ],
  });
  const service = createEnvironmentPublicService(fake.value, () => now);

  const result = await service.latest("home");
  assert.ok(result);
  assert.deepEqual(result.location, {
    slug: "home",
    name: { zh: "家", en: "Home", ja: "自宅" },
    timezone: "Australia/Perth",
  });
  assert.equal(result.readings.indoor?.temperatureC, 26.3);
  assert.equal(result.readings.indoor?.freshness, "fresh");
  assert.equal(result.readings.outdoor?.freshness, "fresh");
  assert.deepEqual(result.deltas, {
    temperatureC: 1.5,
    humidityPercent: -14.6,
  });
  assert.equal(result.updatedAt, "2026-08-04T15:50:00.000Z");
  assert.equal(result.freshness, "fresh");
  assert.equal(JSON.stringify(result).includes("private-location-id"), false);
});

test("latest preserves partial and empty data without inventing readings", async () => {
  const partial = createEnvironmentPublicService(
    repository({
      latest: [reading("indoor", "2026-08-04T15:30:00.000Z")],
    }).value,
    () => now
  );
  const partialResult = await partial.latest("home");
  assert.ok(partialResult);
  assert.equal(partialResult.readings.outdoor, null);
  assert.deepEqual(partialResult.deltas, {
    temperatureC: null,
    humidityPercent: null,
  });
  assert.equal(partialResult.freshness, "delayed");

  const empty = createEnvironmentPublicService(repository().value, () => now);
  const emptyResult = await empty.latest("home");
  assert.ok(emptyResult);
  assert.deepEqual(emptyResult.readings, { indoor: null, outdoor: null });
  assert.equal(emptyResult.updatedAt, null);
  assert.equal(emptyResult.freshness, "unavailable");
});

test("unknown or disabled locations return null", async () => {
  const service = createEnvironmentPublicService(
    repository({ locationExists: false }).value,
    () => now
  );
  assert.equal(await service.latest("home"), null);
  assert.equal(await service.history("home", "24h"), null);
});

test("24h history is bounded, chronological, raw, and partial-safe", async () => {
  const fake = repository({
    history: [
      reading("indoor", "2026-08-04T15:50:00.000Z"),
      reading("indoor", "2026-08-03T15:59:59.999Z", {
        temperatureC: 1,
      }),
      reading("indoor", "2026-08-03T16:00:00.000Z", {
        temperatureC: 25,
      }),
      reading("indoor", "2026-08-04T16:00:00.001Z", {
        temperatureC: 2,
      }),
      reading("indoor", "2026-08-04T14:00:00.000Z", {
        temperatureC: 26,
        batteryPercent: 88,
      }),
    ],
  });
  const service = createEnvironmentPublicService(fake.value, () => now);

  const result = await service.history("home", "24h");
  assert.ok(result);
  assert.equal(result.range, "24h");
  assert.equal(result.resolution, "raw");
  assert.equal(result.from, "2026-08-03T16:00:00.000Z");
  assert.equal(result.to, now.toISOString());
  assert.deepEqual(
    result.series.indoor.map((point) => point.sourceUpdatedAt),
    [
      "2026-08-03T16:00:00.000Z",
      "2026-08-04T14:00:00.000Z",
      "2026-08-04T15:50:00.000Z",
    ]
  );
  assert.equal(result.series.indoor[1].batteryPercent, 88);
  assert.deepEqual(result.series.outdoor, []);
  assert.equal(fake.requestedSince[0].toISOString(), result.from);
});

test("7d history uses Perth hourly buckets and rounded averages", async () => {
  const fake = repository({
    history: [
      reading("indoor", "2026-08-04T15:55:00.000Z", {
        temperatureC: 26.2,
        humidityPercent: 40.2,
      }),
      reading("indoor", "2026-08-04T15:05:00.000Z", {
        temperatureC: 24,
        humidityPercent: 38,
      }),
      reading("outdoor", "2026-08-04T16:00:00.000Z"),
    ],
  });
  const service = createEnvironmentPublicService(fake.value, () => now);

  const result = await service.history("home", "7d");
  assert.ok(result);
  assert.equal(result.resolution, "hour");
  assert.equal(result.from, "2026-07-28T16:00:00.000Z");
  assert.deepEqual(result.series.indoor, [
    {
      sourceUpdatedAt: "2026-08-04T15:00:00.000Z",
      temperatureC: 25.1,
      humidityPercent: 39.1,
      sampleCount: 2,
    },
  ]);
  assert.equal(result.series.outdoor[0].sampleCount, 1);
  assert.equal(
    perthHourBucket("2026-08-04T15:55:00.000Z"),
    "2026-08-04T15:00:00.000Z"
  );
});
