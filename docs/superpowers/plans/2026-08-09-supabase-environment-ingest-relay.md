# Supabase Environment Ingest Relay Implementation Plan

> Product design: `docs/superpowers/specs/2026-08-09-supabase-environment-ingest-relay-design.md`
> Existing v2 design: `docs/superpowers/specs/2026-08-09-modular-environment-monitoring-design.md`
> Firmware design: `docs/superpowers/specs/2026-08-09-dormitory-esp32-air-station-design.md`

**Status:** Complete. The relay is live, the ESP32 uses it for production uploads, and three consecutive hardware windows passed end to end.

## Constraints

- Do not change the database schema, RLS, existing v1/v2 Route Handlers or public environment DTOs.
- Do not give the Edge Function or ESP32 a Supabase publishable, anon, secret or service-role key.
- Keep the existing `dormitory-esp32` source token and v2 JSON contract.
- Configure only this function with `verify_jwt = false`; custom device authentication remains enforced by the fixed upstream v2 ingest.
- Do not log Authorization, token digests, request/response bodies, sensor values or raw upstream exceptions.
- Do not switch the firmware until deployed negative tests pass.
- Keep failed ten-minute windows non-retriable and non-replayable.

## Task 1: Implement the bounded relay handler

**Files:** new `supabase/functions/environment-ingest-relay/relay.ts`, new `tests/environment-ingest-relay.test.ts`.

- [x] Create a dependency-injected handler with a fixed upstream URL supplied only by trusted startup code.
- [x] Reject non-POST requests with `405 METHOD_NOT_ALLOWED` and an `Allow: POST` header.
- [x] Validate Bearer format and length before inspecting media type or body.
- [x] Accept only JSON media type and enforce 32 KiB using both declared and streamed byte counts.
- [x] Forward only Authorization, normalized JSON content type and the bounded raw body.
- [x] Bound the upstream request with an abort timeout.
- [x] Accept only bounded JSON upstream responses and normalize response headers.
- [x] Collapse network, timeout, non-JSON, oversized and unreadable upstream failures to fixed `503 INGEST_RELAY_UNAVAILABLE`.
- [x] Emit only fixed code, upstream status, duration and byte count to an injected logger.
- [x] Test outer validation order, stream limits, fixed target, request header allowlist, response passthrough, upstream rejection and log redaction.

**Checkpoint:** Node tests prove the function is not an open proxy and cannot leak supplied credentials through its events or responses.

## Task 2: Add the Supabase runtime entrypoint and config

**Files:** new `supabase/functions/environment-ingest-relay/index.ts`, new `supabase/config.toml`, `tsconfig.json` only if required for explicit Deno `.ts` imports.

- [x] Bind the pure handler to the fixed production v2 ingest URL and global fetch.
- [x] Use a 10-second upstream timeout and a structured, allowlisted console event.
- [x] Configure `[functions.environment-ingest-relay] verify_jwt = false` in version control.
- [x] Keep the entrypoint free of environment secrets and database clients.
- [x] Run TypeScript validation over the Next.js project and function sources.

**Checkpoint:** the deploy bundle consists only of the entrypoint and relay handler and contains no keys or plaintext device token.

## Task 3: Run repository verification

**Files:** function files and tests above.

- [x] Run the focused relay tests.
- [x] Run all existing environment monitoring tests.
- [x] Run the complete test suite, TypeScript validation and production build.
- [x] Run whitespace and sensitive-pattern checks over the exact diff.
- [x] Confirm `secrets.h` remains ignored and unchanged.

**Gate:** do not deploy unless every automated check passes.

## Task 4: Deploy and negatively verify the Edge Function

**Files:** deployed `environment-ingest-relay` function; no database migration.

- [x] Deploy the two function files with JWT verification disabled only for this function.
- [x] Verify no Authorization returns outer `401`.
- [x] Verify a syntactically valid wrong token returns upstream `401`.
- [x] Submit the real device token with an invalid v2 body and verify upstream `422` before the storage path is reached.
- [x] Inspect Edge Function logs for fixed fields only and confirm no token or body is present.
- [x] Confirm the existing direct v2 ingest and public API remain healthy.

**Production gate:** do not change the firmware until the Supabase endpoint demonstrates custom-token pass-through and zero-write negative behavior.

## Task 5: Switch and compile the ESP32 uploader

**Files:** `firmware/dormitory-air-station/dormitory-air-station.ino`, `firmware/dormitory-air-station/README.md`.

- [x] Change only the production ingest URL to the deployed Supabase function.
- [x] Keep the current three-route startup diagnostics and original website probe.
- [x] Split startup-probe and production-upload timeout constants.
- [x] Allow a 12-second TLS handshake and a 20-second complete production request while keeping startup probes bounded at 8 seconds.
- [x] Keep the same Authorization header, JSON payload, ten-minute aggregation and no-retry window clearing.
- [x] Update the firmware verification instructions and rollback reference.
- [x] Compile with the installed Espressif ESP32 platform and confirm flash/RAM limits.
- [x] Confirm `secrets.h` remains ignored and no secret entered the diff.

**Checkpoint:** a flashable firmware build targets only Supabase for production uploads and contains no Supabase key.

## Task 6: Hardware and end-to-end verification

**Files:** COM4 device, Edge Function logs, existing public APIs.

- [x] Flash the compiled firmware to `ESP32 Dev Module` on COM4.
- [x] Confirm startup networking completes and sensor sample counts continue increasing.
- [x] Confirm three consecutive ten-minute windows return upstream `200` at 22:46, 22:56 and 23:06 Australia/Perth time.
- [x] Confirm the successful response path remains compatible with the existing firmware log and window clearing.
- [x] Confirm the public dormitory latest timestamp and temperature/humidity/PM2.5 values advance.
- [x] Recheck function logs for secret-safe structured events.

**Completion:** three consecutive hardware windows passed. `firmware/dormitory-air-station/README.md` and `docs/environment-configuration-guide.md` document the Supabase relay as the active ESP32 route.
