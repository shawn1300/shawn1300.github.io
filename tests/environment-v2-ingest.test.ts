import assert from "node:assert/strict";
import test from "node:test";

import { bearerTokenDigest } from "../lib/environment/v2/auth";
import {
  EnvironmentIngestValidationErrorV2,
  parseEnvironmentIngestPayloadV2,
} from "../lib/environment/v2/ingest";

const now = new Date("2026-08-09T01:10:00.000Z");

function payload() {
  return {
    schemaVersion: 2,
    sentAt: "2026-08-09T01:09:00.000Z",
    readings: [
      {
        device: "garden-air",
        sourceUpdatedAt: "2026-08-09T01:08:00.000Z",
        metrics: { temperatureC: 21.5, humidityPercent: 0, pm25UgM3: 0 },
      },
    ],
  };
}

test("v2 token parsing returns only a digest for well-formed bearer secrets", () => {
  const token = "x".repeat(43);
  const digest = bearerTokenDigest(`Bearer ${token}`);
  assert.match(digest ?? "", /^[0-9a-f]{64}$/);
  assert.equal(digest?.includes(token), false);
  assert.equal(bearerTokenDigest("Bearer short"), null);
  assert.equal(bearerTokenDigest(null), null);
});

test("v2 parser preserves valid zero values and skips invalid metrics independently", () => {
  const raw = payload();
  raw.readings[0].metrics = {
    ...raw.readings[0].metrics,
    temperatureC: 200,
  };
  const parsed = parseEnvironmentIngestPayloadV2(raw, now);
  assert.deepEqual(parsed.readings[0].metrics, {
    humidityPercent: 0,
    pm25UgM3: 0,
  });
  assert.deepEqual(parsed.skipped, [
    { device: "garden-air", metric: "temperatureC" },
  ]);
});

test("v2 parser rejects duplicate devices, future times and all-invalid input", () => {
  const duplicate = payload();
  duplicate.readings.push(structuredClone(duplicate.readings[0]));
  assert.throws(
    () => parseEnvironmentIngestPayloadV2(duplicate, now),
    (error) => error instanceof EnvironmentIngestValidationErrorV2 && error.code === "INVALID_DEVICES"
  );

  const future = payload();
  future.sentAt = "2026-08-09T01:20:00.000Z";
  assert.throws(
    () => parseEnvironmentIngestPayloadV2(future, now),
    (error) => error instanceof EnvironmentIngestValidationErrorV2 && error.code === "INVALID_SENT_AT"
  );

  const invalid = payload();
  invalid.readings[0].metrics = {
    temperatureC: 500,
    humidityPercent: 200,
    pm25UgM3: -1,
  };
  assert.throws(
    () => parseEnvironmentIngestPayloadV2(invalid, now),
    (error) => error instanceof EnvironmentIngestValidationErrorV2 && error.code === "NO_VALID_READINGS"
  );
});
