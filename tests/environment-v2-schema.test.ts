import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/007_environment_monitoring_v2.sql", import.meta.url),
  "utf8"
);

const newTables = [
  "environment_sources",
  "environment_devices",
  "environment_device_metrics",
  "environment_metric_readings",
  "environment_location_comparisons",
];

test("v2 migration is atomic and isolates every normalized table behind RLS", () => {
  assert.match(migration, /BEGIN;/);
  assert.match(migration, /COMMIT;/);
  for (const table of newTables) {
    assert.match(migration, new RegExp(`CREATE TABLE ${table}\\b`));
    assert.match(migration, new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`));
  }
  assert.match(migration, /REVOKE ALL ON TABLE[\s\S]+FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /TO service_role/);
  assert.doesNotMatch(migration, /CREATE POLICY/);
});

test("v2 migration enforces identity, ranges, ordering and ten-minute idempotency", () => {
  assert.match(migration, /source_type IN \('home_assistant', 'esp32'\)/);
  assert.match(migration, /placement IN \('indoor', 'outdoor', 'other'\)/);
  assert.match(migration, /token_digest ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(migration, /UNIQUE \(metric_id, ten_minute_bucket\)/);
  assert.match(migration, /validate_environment_metric_reading/);
  for (const boundary of [
    "NEW.value BETWEEN -30 AND 100",
    "NEW.value BETWEEN 0 AND 100",
    "NEW.value BETWEEN 1 AND 50000",
    "NEW.value BETWEEN 0 AND 5000",
  ]) assert.ok(migration.includes(boundary));
});

test("v2 migration seeds home, maps legacy rows and preserves both source times", () => {
  assert.match(migration, /'home-assistant'[\s\S]+'home-indoor'[\s\S]+'home-outdoor'/);
  assert.match(migration, /token_digest, enabled\)\s*VALUES \('home-assistant',[\s\S]+NULL, true\)/);
  assert.match(migration, /FROM environment_readings reading/);
  assert.match(migration, /reading\.source_updated_at/);
  assert.match(migration, /reading\.collected_at/);
  assert.match(migration, /reading\.collected_at >= now\(\) - interval '30 days'/);
  assert.match(migration, /ON CONFLICT \(metric_id, ten_minute_bucket\) DO NOTHING/);
});

test("v2 retention deletes only legacy and modular environment rows", () => {
  assert.match(migration, /DELETE FROM environment_metric_readings/);
  assert.match(migration, /DELETE FROM environment_readings/);
  assert.match(migration, /RETURN modular_count \+ legacy_count/);
  assert.doesNotMatch(migration, /DELETE FROM (posts|diaries|comments)/);
  assert.match(migration, /cron\.unschedule\(jobid\)/);
  assert.match(migration, /cron\.schedule\(/);
});

test("v2 migration never contains a provisioned plaintext or digest", () => {
  assert.doesNotMatch(migration, /Bearer\s+[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(migration, /'[0-9a-f]{64}'/);
});
