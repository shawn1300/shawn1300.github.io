import assert from "node:assert/strict";
import test from "node:test";

import { environmentConfiguration } from "../config/environment";
import {
  EnvironmentConfigurationError,
  type EnvironmentConfiguration,
  validateEnvironmentConfiguration,
} from "../lib/environment/config-schema";
import { renderEnvironmentConfigurationSql } from "../tools/environment-config";

function cloneConfiguration(): EnvironmentConfiguration {
  return structuredClone(environmentConfiguration);
}

function errorCode(value: EnvironmentConfiguration) {
  try {
    validateEnvironmentConfiguration(value);
    return null;
  } catch (error) {
    assert.ok(error instanceof EnvironmentConfigurationError);
    return error.code;
  }
}

test("the committed home environment configuration is valid and secret-free", () => {
  assert.equal(
    validateEnvironmentConfiguration(environmentConfiguration),
    environmentConfiguration
  );
  const serialized = JSON.stringify(environmentConfiguration).toLowerCase();
  for (const forbidden of ["token", "secret", "service_role", "password"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("configuration validation rejects duplicate slugs and broken ownership", () => {
  const duplicate = cloneConfiguration();
  duplicate.devices.push(structuredClone(duplicate.devices[0]));
  assert.equal(errorCode(duplicate), "DUPLICATE_SLUG");

  const location = cloneConfiguration();
  location.devices[0].location = "missing";
  assert.equal(errorCode(location), "UNKNOWN_LOCATION");

  const source = cloneConfiguration();
  source.devices[0].source = "missing";
  assert.equal(errorCode(source), "UNKNOWN_SOURCE");
});

test("configuration validation rejects invalid metrics and comparisons", () => {
  const duplicatedMetric = cloneConfiguration();
  duplicatedMetric.devices[0].metrics.push({
    key: "temperatureC",
    enabled: true,
    order: 5,
  });
  assert.equal(errorCode(duplicatedMetric), "DUPLICATE_METRIC");

  const aqi = cloneConfiguration();
  aqi.devices[0].metrics[0].showAqi = true;
  assert.equal(errorCode(aqi), "INVALID_AQI_METRIC");

  const comparison = cloneConfiguration();
  comparison.locations[0].comparison = {
    indoorDevice: "home-outdoor",
    outdoorDevice: "home-indoor",
  };
  assert.equal(errorCode(comparison), "INVALID_COMPARISON");

  const incompleteComparison = cloneConfiguration();
  incompleteComparison.devices[0].metrics = incompleteComparison.devices[0].metrics.filter(
    (metric) => metric.key !== "humidityPercent"
  );
  assert.equal(errorCode(incompleteComparison), "INVALID_COMPARISON");
});

test("configuration SQL generation is deterministic and contains no credentials", () => {
  const first = renderEnvironmentConfigurationSql(cloneConfiguration());
  const second = renderEnvironmentConfigurationSql(cloneConfiguration());
  assert.equal(first, second);
  assert.match(first, /environment_devices/);
  assert.match(first, /environment_device_metrics/);
  assert.match(first, /ON CONFLICT/);
  assert.doesNotMatch(first, /token_digest|service_role|password/i);
});
