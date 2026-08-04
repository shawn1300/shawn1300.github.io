# Home Assistant Environment Export Implementation Plan

> Design source: `docs/superpowers/specs/2026-08-04-home-assistant-environment-export-design.md`

**Goal:** Export two real Xiaomi temperature/humidity sensors from the private Osaka Home Assistant instance to isolated Supabase tables every 10 minutes through a secret-protected Next.js ingest endpoint.

**Architecture:** Xiaomi Home keeps cloud state in Home Assistant. A native Home Assistant automation sends one versioned HTTPS payload to a Node.js Route Handler. The handler authenticates, validates each sensor independently, and upserts into private Supabase tables using the existing cookie-free Service Role client. Supabase Cron deletes readings older than 30 days.

**Scope:** This plan ends when at least three real 10-minute time buckets have been stored without duplicates. The public APIs and `/environment` UI remain a later phase governed by the existing environment page design.

**Next.js 16 references already reviewed:**

- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`
- `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`
- `node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md`

## Non-negotiable constraints

- Do not expose Home Assistant port `8123`; management continues through SSH forwarding.
- Do not store Xiaomi credentials, Home Assistant tokens, or Supabase Service Role credentials in the repository or chat.
- `ENVIRONMENT_INGEST_TOKEN` is server-only and must never use a `NEXT_PUBLIC_` prefix.
- Do not execute or revive the old `micloud`, MiService, `ssecurity`, or GitHub Actions collector path.
- Preserve unrelated untracked QR assets and all existing user changes.
- Apply the production Supabase migration only after local tests pass and the user confirms the SQL Editor step.

## Task 1: Limit Xiaomi Home to the two sensors

**Repository files:** none.

- [ ] Open Xiaomi Home integration configuration through the existing SSH tunnel.
- [ ] Enable device filtering in include mode.
- [ ] Select only `温湿度计-室内` and `温湿度计-室外`; do not individually delete devices.
- [ ] Confirm the fan, air conditioner, and speaker are absent from Home Assistant after the integration reloads.
- [ ] Confirm both remaining devices still expose temperature, humidity, and battery in metric units.
- [ ] Record the six entity IDs privately for later YAML configuration; entity IDs are configuration data and must not be sent in the ingest payload.

**Gate:** Stop if either sensor becomes unavailable after filtering. Restore the previous integration selection before continuing.

## Task 2: Add the isolated Supabase schema and retention contract

**Files:**

- Create: `supabase/migrations/006_environment_monitoring.sql`
- Modify: `types/supabase.ts`
- Create: `tests/environment-schema.test.ts`

- [ ] Write a static migration contract test first.
- [ ] Create `environment_locations`, `environment_sensors`, and `environment_readings` with UUID primary keys and foreign keys.
- [ ] Constrain location slug to a unique value and sensor role to `indoor|outdoor`.
- [ ] Constrain temperature to `-30..100`, humidity to `0..100`, and nullable battery to `0..100`.
- [ ] Store `source_updated_at`, server `collected_at`, and `idempotency_key`.
- [ ] Add unique `(sensor_id, idempotency_key)` and history lookup indexes.
- [ ] Seed only location `home` in `Australia/Perth` and its two sensor roles; do not store Xiaomi DID or Home Assistant entity IDs.
- [ ] Enable RLS on all three tables with no anonymous direct-read or write policy.
- [ ] Add a narrowly scoped cleanup function that deletes only environment readings older than 30 days.
- [ ] Add an idempotently named daily `pg_cron` schedule after verifying the Supabase project supports Cron.
- [ ] Extend `types/supabase.ts` with the three table types and cleanup function type.
- [ ] Run `npm test` and `npm run lint`.
- [ ] Commit with `feat: add environment monitoring schema`.

**Gate:** If Cron/`pg_cron` is unavailable, do not apply a migration that silently omits cleanup. Amend the design to use a protected daily Vercel Cron first.

## Task 3: Implement pure ingest validation and authentication

**Files:**

- Create: `types/environment.ts`
- Create: `lib/environment/ingest.ts`
- Create: `tests/environment-ingest.test.ts`

- [ ] Write failing tests for schema version, role allowlist, duplicate roles, malformed timestamps, future timestamps, number parsing, valid ranges, nullable battery, partial validity, and all-invalid payloads.
- [ ] Define the versioned request and fixed public result types without internal database IDs.
- [ ] Parse unknown input without type assertions leaking unchecked values downstream.
- [ ] Normalize valid numeric input while preserving legitimate zero values.
- [ ] Treat `unknown`, `unavailable`, non-numeric, and missing values as `null`, never zero.
- [ ] Derive a UTC 10-minute bucket idempotency suffix on the server.
- [ ] Implement Bearer Token comparison by hashing both values and using Node `timingSafeEqual`, so unequal token lengths do not create a timing branch.
- [ ] Ensure validation errors contain only fixed codes and field names, never raw payload values or tokens.
- [ ] Run focused tests, then `npm test` and `npm run lint`.
- [ ] Commit with `test: establish environment ingest contract`.

## Task 4: Add the Supabase environment store

**Files:**

- Create: `lib/environment/store.ts`
- Create: `tests/environment-store.test.ts`
- Modify: `lib/supabase/server.ts` only if a typed, cookie-free client boundary is needed.

- [ ] Define a small repository interface so unit tests can use a fake store without network access.
- [ ] Resolve only the seeded `home` location and `indoor/outdoor` sensor rows.
- [ ] Upsert each valid reading independently using `(sensor_id, idempotency_key)`.
- [ ] Preserve `source_updated_at`; generate `collected_at` server-side.
- [ ] Return only `stored|duplicate|skipped` by role.
- [ ] Convert Supabase failures to fixed internal categories without logging query bodies, secrets, or raw database errors in public responses.
- [ ] Test two valid sensors, one invalid sensor, duplicate bucket, missing seed rows, and database failure.
- [ ] Run focused tests, then `npm test`, `npm run lint`, and `npm run build`.
- [ ] Commit with `feat: add environment reading store`.

## Task 5: Add the private ingest Route Handler

**Files:**

- Create: `app/api/environment/ingest/route.ts`
- Create or extend: `tests/environment-ingest-route.test.ts`

- [ ] Keep the Route Handler thin by injecting the pure validator and store boundary where practical.
- [ ] Export `runtime = 'nodejs'` and `dynamic = 'force-dynamic'`; POST handlers are uncached by Next.js 16, and the explicit dynamic setting documents the boundary.
- [ ] Accept only POST with `application/json`.
- [ ] Reject declared or actual bodies larger than 16 KiB before JSON parsing completes.
- [ ] Return `503` if `ENVIRONMENT_INGEST_TOKEN` is absent, `401` for invalid credentials, `415` for media type, `400` for malformed JSON, `422` when no role is usable, and generic `503` for storage failure.
- [ ] Authenticate before parsing and do not enable CORS.
- [ ] Add `Cache-Control: no-store` to every response.
- [ ] Log only result category, valid role count, and duration.
- [ ] Test all status codes, partial success, duplicate response, token redaction, payload redaction, and absence of internal IDs.
- [ ] Run `npm test`, `npm run lint`, and `npm run build`.
- [ ] Commit with `feat: add private environment ingest endpoint`.

## Task 6: Apply and verify the Supabase migration

**Repository files:** no new source changes unless production exposes a migration defect.

- [ ] Confirm a current database backup exists before applying migration `006`.
- [ ] Confirm Supabase Cron is available.
- [ ] Apply `006_environment_monitoring.sql` through the Supabase SQL Editor or approved CLI workflow.
- [ ] Verify the three environment tables, two sensor seed rows, RLS state, constraints, indexes, cleanup function, and daily job.
- [ ] Confirm existing blog tables and old `sensor_readings` are unchanged.
- [ ] Use a development or synthetic transaction to prove duplicate upsert and 30-day cleanup behavior.

## Task 7: Configure the server-only ingest secret and deploy

**Files:** documentation only; no secret files are committed.

- [ ] Generate at least 32 random bytes locally without placing the value in a command argument, repository file, or chat.
- [ ] Add `ENVIRONMENT_INGEST_TOKEN` to the Vercel Production environment.
- [ ] Deploy the tested Next.js build.
- [ ] Verify an unauthenticated production request returns `401` and does not expose implementation details.
- [ ] Store the same secret in Home Assistant `/config/secrets.yaml` with restrictive host directory permissions.
- [ ] Do not add a Supabase Service Role Key or Home Assistant long-lived access token to the Osaka exporter configuration.

## Task 8: Configure Home Assistant export

**Server files outside the repository:**

- `/home/ubuntu/homeassistant/config/secrets.yaml`
- `/home/ubuntu/homeassistant/config/configuration.yaml`
- `/home/ubuntu/homeassistant/config/automations.yaml`

- [ ] Make timestamped, non-destructive backups of the three files before editing.
- [ ] Add a `rest_command` using a secret URL and a secret full Authorization header.
- [ ] Build one schema-version-1 JSON payload containing both fixed roles.
- [ ] Convert unavailable/non-numeric states to JSON null.
- [ ] Use each temperature entity's `last_updated` as `sourceUpdatedAt`.
- [ ] Add a `/10` minute time-pattern automation and a manual trigger path.
- [ ] Validate the Home Assistant configuration inside the container before restart.
- [ ] Restart only the Home Assistant container and verify normal memory use and clean logs.
- [ ] Manually trigger once and check the fixed success result without printing the secret or full payload.

**Rollback:** Restore the timestamped configuration backups and restart only Home Assistant. Do not delete its config directory or OAuth storage.

## Task 9: Pass the live data gate

- [ ] Confirm one indoor and one outdoor row after the manual trigger.
- [ ] Run for at least 20 minutes and observe at least three distinct 10-minute buckets for each available role.
- [ ] Confirm retries within one bucket do not create duplicates.
- [ ] Simulate one unavailable role without changing Xiaomi account or device ownership; confirm the other role stores successfully.
- [ ] Confirm source timestamps remain honest if a Xiaomi entity stops refreshing.
- [ ] Review Home Assistant, Vercel, and Supabase logs for tokens, entity IDs, Xiaomi IDs, raw payloads, and database errors.
- [ ] Record actual memory use on the 1 GB Osaka server.

## Task 10: Replace the historical operations guide

**Files:**

- Rewrite: `docs/environment-operations.md`
- Modify: `docs/superpowers/plans/2026-08-04-environment-monitoring.md`
- Modify: `README.md` only if it already links environment operations.

- [ ] Replace the historical login instructions with SSH tunnel, container health, Xiaomi OAuth renewal, device filter, automation reload, secret rotation, manual trigger, Supabase cleanup, and rollback procedures.
- [ ] Keep a short note that the old `ssecurity` route failed; do not retain executable obsolete commands in the primary operations path.
- [ ] Mark the data-export phase complete and route the remaining work to public API and `/environment` UI tasks.
- [ ] Run documentation link checks available in the repository.
- [ ] Commit with `docs: add Home Assistant environment operations`.

## Export-phase acceptance checklist

- [ ] Home Assistant remains private on `127.0.0.1:8123`.
- [ ] Only the two temperature/humidity devices are imported into Home Assistant.
- [ ] No external Home Assistant token or Supabase Service Role Key exists on the exporter path.
- [ ] The private endpoint authenticates and validates without leaking secrets.
- [ ] Indoor and outdoor readings arrive about every 10 minutes and remain independently writable.
- [ ] Duplicate requests do not create duplicate rows.
- [ ] Supabase retains only 30 days, independently of exporter uptime.
- [ ] At least three real time buckets pass the live gate.
- [ ] Existing blog tables, old ESP32 data, navigation, and public pages remain untouched in this phase.

