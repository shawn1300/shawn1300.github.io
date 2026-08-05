import assert from "node:assert/strict";
import test from "node:test";

import {
  createEnvironmentHistoryHandler,
  createEnvironmentLatestHandler,
} from "../lib/environment/public-handler";
import type {
  EnvironmentHistoryResponse,
  EnvironmentLatestResponse,
} from "../types/environment";

const latest: EnvironmentLatestResponse = {
  location: {
    slug: "home",
    name: { zh: "家", en: "Home", ja: "自宅" },
    timezone: "Australia/Perth",
  },
  readings: { indoor: null, outdoor: null },
  deltas: { temperatureC: null, humidityPercent: null },
  updatedAt: null,
  freshness: "unavailable",
};

const history: EnvironmentHistoryResponse = {
  location: latest.location,
  range: "24h",
  resolution: "raw",
  from: "2026-08-03T16:00:00.000Z",
  to: "2026-08-04T16:00:00.000Z",
  series: { indoor: [], outdoor: [] },
};

test("latest handler validates location and sets a 60-second CDN bound", async () => {
  const handler = createEnvironmentLatestHandler({
    getLatest: async () => latest,
  });
  const response = await handler(
    new Request("https://example.test/api/environment/latest?location=home")
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), latest);
  assert.equal(
    response.headers.get("cache-control"),
    "public, max-age=0, s-maxage=60, stale-while-revalidate=60"
  );

  const missing = await handler(
    new Request("https://example.test/api/environment/latest")
  );
  assert.equal(missing.status, 400);
  assert.equal(missing.headers.get("cache-control"), "no-store");

  const unknown = await handler(
    new Request("https://example.test/api/environment/latest?location=office")
  );
  assert.equal(unknown.status, 404);
});

test("history handler accepts only one location and an explicit range", async () => {
  const requested: Array<[string, "24h" | "7d"]> = [];
  const handler = createEnvironmentHistoryHandler({
    async getHistory(location, range) {
      requested.push([location, range]);
      return { ...history, range } as EnvironmentHistoryResponse;
    },
  });

  const response = await handler(
    new Request(
      "https://example.test/api/environment/history?location=home&range=7d"
    )
  );
  assert.equal(response.status, 200);
  assert.deepEqual(requested, [["home", "7d"]]);
  assert.equal(
    response.headers.get("cache-control"),
    "public, max-age=0, s-maxage=300, stale-while-revalidate=300"
  );

  for (const query of [
    "location=home",
    "location=home&range=30d",
    "location=home&location=home&range=24h",
    "location=home&range=24h&range=7d",
  ]) {
    const invalid = await handler(
      new Request(`https://example.test/api/environment/history?${query}`)
    );
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), {
      success: false,
      code: "INVALID_REQUEST",
    });
  }
});

test("public handlers return fixed not-found and service errors without leaking details", async () => {
  const notFound = createEnvironmentLatestHandler({
    getLatest: async () => null,
  });
  const missing = await notFound(
    new Request("https://example.test/api/environment/latest?location=home")
  );
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), {
    success: false,
    code: "LOCATION_NOT_FOUND",
  });

  const failing = createEnvironmentLatestHandler({
    async getLatest() {
      throw new Error("database-id token secret entity_id xiaomi_did");
    },
  });
  const failed = await failing(
    new Request("https://example.test/api/environment/latest?location=home")
  );
  const text = await failed.text();
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get("cache-control"), "no-store");
  assert.equal(text.includes("database-id"), false);
  assert.equal(text.includes("token"), false);
  assert.deepEqual(JSON.parse(text), {
    success: false,
    code: "SERVICE_UNAVAILABLE",
  });
});

test("approved public JSON has no private or secret-shaped fields", async () => {
  const handler = createEnvironmentLatestHandler({
    getLatest: async () => latest,
  });
  const response = await handler(
    new Request("https://example.test/api/environment/latest?location=home")
  );
  const text = await response.text();

  for (const forbidden of [
    '"id"',
    "sensorId",
    "locationId",
    "entityId",
    "entity_id",
    "xiaomi",
    "did",
    "token",
    "secret",
    "idempotencyKey",
    "collectedAt",
  ]) {
    assert.equal(text.toLowerCase().includes(forbidden.toLowerCase()), false);
  }
});

