import assert from "node:assert/strict";
import test from "node:test";

import {
  ENVIRONMENT_METRICS,
  environmentMetricDefinition,
  isEnvironmentDevicePlacement,
  isEnvironmentMetricKey,
  isEnvironmentMetricValue,
  isEnvironmentPublicSlug,
  isUtcTimestamp,
} from "../lib/environment/v2/metrics";

test("v2 metric registry exposes only the approved metrics and units", () => {
  assert.deepEqual(Object.keys(ENVIRONMENT_METRICS), [
    "temperatureC",
    "humidityPercent",
    "co2Ppm",
    "pm25UgM3",
    "batteryPercent",
  ]);
  assert.equal(environmentMetricDefinition("temperatureC").unit, "°C");
  assert.equal(environmentMetricDefinition("pm25UgM3").unit, "µg/m³");
  assert.equal(ENVIRONMENT_METRICS.batteryPercent.chartedByDefault, false);
});

test("v2 metric guards enforce finite values and every hard boundary", () => {
  for (const [key, definition] of Object.entries(ENVIRONMENT_METRICS)) {
    assert.equal(isEnvironmentMetricKey(key), true);
    assert.equal(
      isEnvironmentMetricValue(definition.key, definition.minimum),
      true
    );
    assert.equal(
      isEnvironmentMetricValue(definition.key, definition.maximum),
      true
    );
    assert.equal(
      isEnvironmentMetricValue(definition.key, definition.minimum - 0.01),
      false
    );
    assert.equal(
      isEnvironmentMetricValue(definition.key, definition.maximum + 0.01),
      false
    );
  }
  assert.equal(isEnvironmentMetricKey("vocPpb"), false);
  assert.equal(isEnvironmentMetricValue("temperatureC", Number.NaN), false);
  assert.equal(isEnvironmentMetricValue("humidityPercent", 0), true);
  assert.equal(isEnvironmentMetricValue("pm25UgM3", 0), true);
  assert.equal(isEnvironmentDevicePlacement("other"), true);
  assert.equal(isEnvironmentDevicePlacement("garage"), false);
  assert.equal(isEnvironmentPublicSlug("home-office"), true);
  assert.equal(isEnvironmentPublicSlug("Home Office"), false);
  assert.equal(isUtcTimestamp("2026-08-09T00:00:00.000Z"), true);
  assert.equal(isUtcTimestamp("2026-08-09T08:00:00+08:00"), false);
});
