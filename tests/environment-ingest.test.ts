import assert from "node:assert/strict";
import test from "node:test";

import {
  EnvironmentIngestValidationError,
  bearerTokenMatches,
  idempotencyKey,
  parseEnvironmentIngestPayload,
} from "../lib/environment/ingest";

const now = new Date("2026-08-04T15:00:00.000Z");

function reading(
  role: "indoor" | "outdoor",
  overrides: Record<string, unknown> = {}
) {
  return {
    role,
    temperatureC: 26.3,
    humidityPercent: 37.5,
    batteryPercent: 100,
    sourceUpdatedAt: "2026-08-04T14:59:31.000Z",
    ...overrides,
  };
}

function payload(readings: unknown[]) {
  return {
    schemaVersion: 1,
    sentAt: "2026-08-04T15:00:00.000Z",
    readings,
  };
}

test("ingest parser accepts both fixed roles and preserves legitimate zeroes", () => {
  const result = parseEnvironmentIngestPayload(
    payload([
      reading("indoor", {
        temperatureC: 0,
        humidityPercent: 0,
        batteryPercent: 0,
      }),
      reading("outdoor"),
    ]),
    now
  );

  assert.equal(result.readings.length, 2);
  assert.deepEqual(result.skippedRoles, []);
  assert.equal(result.readings[0].temperatureC, 0);
  assert.equal(result.readings[0].humidityPercent, 0);
  assert.equal(result.readings[0].batteryPercent, 0);
});

test("ingest parser keeps one valid role when the other is unavailable", () => {
  const result = parseEnvironmentIngestPayload(
    payload([
      reading("indoor", { temperatureC: "unavailable" }),
      reading("outdoor"),
    ]),
    now
  );

  assert.deepEqual(result.readings.map((item) => item.role), ["outdoor"]);
  assert.deepEqual(result.skippedRoles, ["indoor"]);
});

test("ingest parser allows a missing battery without dropping temperature and humidity", () => {
  const result = parseEnvironmentIngestPayload(
    payload([reading("indoor", { batteryPercent: null })]),
    now
  );
  assert.equal(result.readings[0].batteryPercent, null);
});

test("ingest parser skips a role with an out-of-range supplied battery", () => {
  assert.throws(
    () =>
      parseEnvironmentIngestPayload(
        payload([reading("indoor", { batteryPercent: 101 })]),
        now
      ),
    (error) => {
      assert.equal(error instanceof EnvironmentIngestValidationError, true);
      assert.equal(
        (error as EnvironmentIngestValidationError).code,
        "NO_VALID_READINGS"
      );
      return true;
    }
  );
});

test("ingest parser rejects duplicate and unknown roles", () => {
  for (const readings of [
    [reading("indoor"), reading("indoor")],
    [reading("indoor"), { ...reading("outdoor"), role: "garage" }],
  ]) {
    assert.throws(
      () => parseEnvironmentIngestPayload(payload(readings), now),
      (error) => {
        assert.equal(error instanceof EnvironmentIngestValidationError, true);
        assert.equal(
          (error as EnvironmentIngestValidationError).code,
          "INVALID_ROLES"
        );
        return true;
      }
    );
  }
});

test("ingest parser rejects malformed versions, timestamps, and obvious future times", () => {
  const cases = [
    { ...payload([reading("indoor")]), schemaVersion: 2 },
    { ...payload([reading("indoor")]), sentAt: "not-a-date" },
    { ...payload([reading("indoor")]), sentAt: "2026-08-04T15:06:00.000Z" },
  ];

  for (const value of cases) {
    assert.throws(
      () => parseEnvironmentIngestPayload(value, now),
      EnvironmentIngestValidationError
    );
  }
});

test("ingest parser skips a role with a malformed or future source timestamp", () => {
  for (const sourceUpdatedAt of [
    "not-a-date",
    "2026-08-04T15:06:00.000Z",
  ]) {
    assert.throws(
      () =>
        parseEnvironmentIngestPayload(
          payload([reading("indoor", { sourceUpdatedAt })]),
          now
        ),
      (error) => {
        assert.equal(
          (error as EnvironmentIngestValidationError).code,
          "NO_VALID_READINGS"
        );
        return true;
      }
    );
  }
});

test("ingest validation errors expose only fixed codes", () => {
  const secretValue = "raw-value-that-must-not-leak";
  assert.throws(
    () =>
      parseEnvironmentIngestPayload(
        payload([reading("indoor", { temperatureC: secretValue })]),
        now
      ),
    (error) => {
      assert.equal(String(error).includes(secretValue), false);
      return true;
    }
  );
});

test("Bearer authentication accepts only the exact configured token", () => {
  assert.equal(bearerTokenMatches("Bearer correct-token", "correct-token"), true);
  assert.equal(bearerTokenMatches("Bearer wrong", "correct-token"), false);
  assert.equal(bearerTokenMatches("Bearer much-longer-wrong-token", "correct-token"), false);
  assert.equal(bearerTokenMatches("correct-token", "correct-token"), false);
  assert.equal(bearerTokenMatches(null, "correct-token"), false);
  assert.equal(bearerTokenMatches("Bearer correct-token", undefined), false);
});

test("idempotency keys use fixed UTC ten-minute buckets and roles", () => {
  assert.equal(
    idempotencyKey("indoor", new Date("2026-08-04T15:07:59.999Z")),
    "indoor:2026-08-04T15:00:00.000Z"
  );
  assert.equal(
    idempotencyKey("outdoor", new Date("2026-08-04T15:10:00.000Z")),
    "outdoor:2026-08-04T15:10:00.000Z"
  );
});

