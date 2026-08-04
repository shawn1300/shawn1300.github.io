import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/006_environment_monitoring.sql", import.meta.url),
  "utf8"
);

test("environment migration creates only the isolated environment tables", () => {
  assert.match(migration, /BEGIN;/);
  assert.match(migration, /COMMIT;/);
  for (const table of [
    "environment_locations",
    "environment_sensors",
    "environment_readings",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE ${table}\\b`));
    assert.match(
      migration,
      new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
    );
  }
  assert.doesNotMatch(migration, /\bsensor_readings\b/);
});

test("environment migration enforces roles, ranges, and idempotency", () => {
  assert.match(migration, /role IN \('indoor', 'outdoor'\)/);
  assert.match(migration, /temperature_c BETWEEN -30 AND 100/);
  assert.match(migration, /humidity_percent BETWEEN 0 AND 100/);
  assert.match(migration, /battery_percent BETWEEN 0 AND 100/);
  assert.match(migration, /UNIQUE \(sensor_id, idempotency_key\)/);
  assert.match(migration, /UNIQUE \(location_id, role\)/);
});

test("environment migration seeds only home and its two fixed roles", () => {
  assert.match(migration, /VALUES \('home', '家', 'Home', '自宅', 'Australia\/Perth'\)/);
  assert.match(migration, /SELECT id, 'indoor'/);
  assert.match(migration, /SELECT id, 'outdoor'/);
});

test("environment migration configures independent 30-day cleanup", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION cleanup_environment_readings\(\)/);
  assert.match(migration, /collected_at < now\(\) - interval '30 days'/);
  assert.match(migration, /REVOKE ALL ON FUNCTION cleanup_environment_readings\(\) FROM PUBLIC/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION cleanup_environment_readings\(\) TO service_role/);
  assert.match(migration, /CREATE EXTENSION IF NOT EXISTS pg_cron/);
  assert.match(migration, /'environment-readings-retention'/);
  assert.match(migration, /'17 19 \* \* \*'/);
});
