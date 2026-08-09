# Modular Environment Monitoring Implementation Plan

> Product design: `docs/superpowers/specs/2026-08-09-modular-environment-monitoring-design.md`
> Existing production design: `docs/superpowers/specs/2026-08-04-environment-monitoring-design.md`
> Operations boundary: `docs/environment-operations.md`

**Status:** Not started. Execute tasks in order and keep the existing Home Assistant v1 ingest and public `indoor/outdoor` contracts working at every deployable checkpoint.

## Constraints

- Read the relevant Next.js 16.2.7 guides in `node_modules/next/dist/docs/` before changing Route Handlers, dynamic routes, Server/Client Component boundaries, loading UI or navigation. The initial plan review covered Route Handlers, dynamic routes, linking/navigation, Server/Client Components and data fetching.
- Do not expose Home Assistant on a public port or restore the removed Xiaomi password/Cookie/MiService collector.
- Do not give ESP32 devices a Supabase key. All writers use the private v1 or v2 Route Handler.
- Do not place plaintext source tokens in source files, migrations, logs, responses, terminal output or documentation.
- Keep all raw environment tables behind RLS and project safe public DTOs through server-only repositories.
- Preserve the current v1 ingest request/response and v1 latest/history response contracts.
- Preserve `/environment` isolation, `noindex, nofollow`, sitemap omission and the existing light/dark themes.
- Preserve the five untracked `public/mom50ome-qr*` assets; never stage, alter or delete them.
- Use the official 2026 Chinese and U.S. AQI documents linked by the design. Do not derive health wording from memory.
- Add no charting library unless the project-native SVG approach proves insufficient; the approved design is implementable without one.
- Apply database migrations to production only after reviewing generated SQL and taking the existing backup/verification precautions.

## Task 1: Freeze contracts and add v2 domain types

**Files:** `types/environment.ts`, new `types/environment-v2.ts`, new `lib/environment/v2/metrics.ts`, tests under `tests/environment-v2-*.test.ts`.

- [ ] Add fixture-based contract tests that snapshot the approved v1 ingest results and v1 latest/history JSON before changing repositories.
- [ ] Define v2 source, placement, metric-key, device, latest, history, AQI, CO₂ reference and ingest result types in a separate file; do not widen v1 types.
- [ ] Define the fixed metric registry for `temperatureC`, `humidityPercent`, `co2Ppm`, `pm25UgM3` and `batteryPercent`.
- [ ] Encode display unit, hard validation range, decimal formatting, default chart visibility and aggregation behavior for every metric.
- [ ] Add pure guards for metric keys, placements, UTC timestamps and public slugs.
- [ ] Test all hard range boundaries, legitimate zeroes, nullable battery behavior and unknown metric rejection.
- [ ] Run focused v1/v2 type and domain tests before continuing.

**Checkpoint:** v2 types and registry exist with no runtime route or database behavior change.

## Task 2: Add declarative configuration and validation

**Files:** new `config/environment.ts`, new `lib/environment/config-schema.ts`, new `tools/environment-config.ts`, `package.json`, new `tests/environment-config.test.ts`.

- [ ] Define a serializable, secret-free configuration for locations, sources, devices, metrics and optional primary indoor/outdoor comparisons.
- [ ] Seed the configuration with the current `home`, Home Assistant source, indoor device, outdoor device, temperature/humidity/battery metrics and home-only comparison.
- [ ] Validate slug syntax and uniqueness, localized names, IANA timezones, source/device ownership, placements, metric keys, display order and comparison references.
- [ ] Reject comparisons whose two devices are missing, disabled, outside the location or do not share temperature/humidity.
- [ ] Add `environment:validate`, `environment:generate-migration` and `environment:generate-token` package scripts.
- [ ] Make migration generation deterministic and idempotent. The command writes only reviewed SQL under `supabase/migrations/` and never connects to Supabase.
- [ ] Make token generation use at least 32 random bytes, copy plaintext to the local clipboard, and output only the source slug, digest and non-secret setup guidance.
- [ ] Fail token generation safely when clipboard access is unavailable; never fall back to printing the token.
- [ ] Test valid home configuration, duplicate slugs, broken ownership, invalid metrics, invalid comparison and deterministic SQL generation.

**Checkpoint:** a developer can describe configuration and generate a migration without touching production or exposing secrets.

## Task 3: Create and verify the normalized database migration

**Files:** new `supabase/migrations/007_environment_monitoring_v2.sql`, `types/supabase.ts`, new `tests/environment-v2-schema.test.ts`, existing schema tests.

- [ ] Extend `environment_locations` with public visibility and ordering without changing the existing `home` row semantics.
- [ ] Create `environment_sources`, `environment_devices`, `environment_device_metrics`, `environment_metric_readings` and the location comparison relation.
- [ ] Add source type, placement, metric key, foreign-key and unique constraints matching the v2 registry.
- [ ] Enforce metric-specific hard ranges again in PostgreSQL through a fixed trigger/function keyed by the declared metric; do not rely on the Route Handler alone.
- [ ] Store only unique source token digests. Allow a null digest only for a metadata source that has not been provisioned for v2; v2 authentication must require a non-null digest. Revoke anonymous/authenticated table access and enable RLS on every new table.
- [ ] Add indexes for enabled public location ordering, source token lookup, device ordering, metric lookup and latest/history reads.
- [ ] Add the unique `(metric_id, ten_minute_bucket)` idempotency boundary.
- [ ] Update the cleanup function and pg_cron path so both legacy and v2 readings obey the independent 30-day retention policy without touching blog tables.
- [ ] Seed v2 metadata for current home/indoor/outdoor with an unprovisioned null v2 digest, then migrate the last 30 days of legacy temperature, humidity and battery values atomically. The existing v1 environment variable continues to authenticate Home Assistant during this step.
- [ ] Preserve original `source_updated_at` and `collected_at` values during migration.
- [ ] Make the migration safe to abort as a whole when a required seed, extension or constraint step fails.
- [ ] Update generated Supabase TypeScript table definitions without weakening unrelated table types.
- [ ] Test table isolation, RLS intent, constraints, indexes, seed scope, migration mapping, retention and absence of plaintext token literals.

**Production gate:** review the SQL, back up current environment rows, execute migration, then compare per-role counts and latest values before deploying code that writes v2.

## Task 4: Implement source authentication and v2 ingest parsing

**Files:** new `lib/environment/v2/auth.ts`, `lib/environment/v2/ingest.ts`, `lib/environment/v2/ingest-handler.ts`, new tests `environment-v2-ingest.test.ts` and `environment-v2-ingest-route.test.ts`.

- [ ] Keep authentication ahead of JSON parsing and value logging.
- [ ] Hash the supplied Bearer token and resolve exactly one enabled source through a server-only dependency.
- [ ] Use constant-shape generic failures for missing, malformed, unknown and disabled source credentials.
- [ ] Enforce JSON media type and a documented bounded request size suitable for multiple devices while remaining small enough for ESP32 uploads.
- [ ] Validate schema version 2, `sentAt`, one occurrence per device, source timestamps and metric records.
- [ ] Reject unknown devices and devices not owned by the authenticated source with the same non-enumerating fixed code.
- [ ] Validate only metrics declared for that enabled device and apply registry ranges.
- [ ] Preserve valid metrics when another metric or device is invalid; reject the request only when no metric remains valid.
- [ ] Return ordered, fixed `stored`, `duplicate` and `skipped` results without IDs, token data or database errors.
- [ ] Test malformed JSON, oversized streaming body, future timestamps, duplicates, ownership boundaries, partial success, all-invalid input and secret-safe errors/logs.

**Checkpoint:** v2 payloads can be authenticated and validated with in-memory dependencies; no production route writes yet.

## Task 5: Implement the v2 store and Supabase repository

**Files:** new `lib/environment/v2/store.ts`, `lib/environment/v2/supabase-store.ts`, new `app/api/environment/v2/ingest/route.ts`, new `tests/environment-v2-store.test.ts`, route tests.

- [ ] Resolve configured devices and metrics for the authenticated source in bounded queries.
- [ ] Generate a server-received UTC ten-minute bucket for every valid metric.
- [ ] Write each metric with source time, collected time and idempotency data using conflict-ignore semantics.
- [ ] Let independent valid metrics settle, but expose only fixed storage failure codes.
- [ ] Add the Node.js dynamic Route Handler with the existing duration and no-store security behavior.
- [ ] Keep structured logs limited to fixed source audit reference, result counts, code and duration.
- [ ] Test stored, duplicate, missing mapping, partial database rejection and repository error redaction.
- [ ] Verify an anonymous production request receives `401` before provisioning any ESP32 token.

**Checkpoint:** a dedicated test source can write v2 rows without affecting v1 consumers.

## Task 6: Adapt v1 ingest to the normalized store

**Files:** `app/api/environment/ingest/route.ts`, `lib/environment/store.ts`, `lib/environment/supabase-store.ts` or focused adapter modules, v1 ingest/store tests.

- [ ] Add a v1-to-v2 adapter mapping `indoor/outdoor` to the configured home devices and temperature/humidity/battery metrics.
- [ ] Keep the current `ENVIRONMENT_INGEST_TOKEN`, request validation, body limit, status codes, ordering and response JSON unchanged.
- [ ] Route validated v1 data into the normalized v2 repository without writing new legacy rows.
- [ ] Preserve ten-minute idempotency and partial valid-role behavior.
- [ ] Run all pre-existing v1 ingest parser, handler, route and store tests unchanged where possible.
- [ ] Add a migration integration fixture proving the adapter selects only the configured home devices.

**Production gate:** manually run the existing Home Assistant automation twice in one bucket, verify v2 rows are stored once, and confirm the public v1 endpoint still shows the same readings.

## Task 7: Implement official AQI and CO₂ reference calculators

**Files:** new `lib/environment/air-quality/china-aqi.ts`, `us-aqi.ts`, `hourly.ts`, `co2.ts`, source-attribution comments, new `tests/environment-air-quality.test.ts`.

- [ ] Transcribe the PM2.5 breakpoints, concentration preprocessing, interpolation, rounding and completeness rules from `HJ 633—2026`; record the standard/version beside the table.
- [ ] Transcribe the May 2026 EPA/AirNow PM2.5 breakpoints and 12-hour NowCast algorithm, including the minimum/maximum weight rule and recent valid-hour requirements.
- [ ] Create hourly concentrations from bounded ten-minute samples without filling missing periods.
- [ ] Return structured `insufficient_data` independently for China and U.S. calculations.
- [ ] Keep calculators pure and independent; do not reuse one country's final value for the other.
- [ ] Add official worked-example fixtures where available plus exact tests at every breakpoint and rounding boundary.
- [ ] Compute CO₂ current value and one-hour mean only with at least four valid ten-minute samples.
- [ ] Classify `<800`, `800..1500`, and `>1500 ppm` as ventilation reference bands and include the non-safety disclaimer key.
- [ ] Test gaps, stale samples, extreme valid values, insufficient data and boundary values.

**Accuracy gate:** review every threshold and fixture against the linked official documents before displaying a health-related label.

## Task 8: Implement the v2 public domain and repository

**Files:** new `lib/environment/v2/public.ts`, `lib/environment/v2/supabase-public.ts`, `lib/environment/v2/public-handler.ts`, `types/environment-v2.ts`, new public domain/repository/handler tests.

- [ ] Project enabled public locations ordered by configuration.
- [ ] Load enabled devices and declared metrics without exposing source metadata or internal IDs.
- [ ] Return latest values and 25-minute freshness per metric/device plus overall location freshness.
- [ ] Return 24-hour chronological raw series and 7-day location-timezone hourly series with newest-first query caps.
- [ ] Attach AQI and CO₂ derived references only to eligible configured metrics.
- [ ] Return home comparison values only when the configured primary indoor/outdoor devices both have the metric.
- [ ] Define allowlisted public DTO builders so `collected_at`, token data, source slug, UUID and idempotency fields cannot enter JSON.
- [ ] Test multiple locations, multiple devices, mixed metric sets, partial/stale data, non-public locations, disabled metadata and safe response keys.

**Checkpoint:** pure/public services produce complete v2 DTOs before HTTP routes or UI consume them.

## Task 9: Add v2 public Route Handlers

**Files:** new routes under `app/api/environment/v2/locations/`, route tests.

- [ ] Implement `GET /api/environment/v2/locations`.
- [ ] Implement `GET /api/environment/v2/locations/[slug]/latest` using async `RouteContext` params and runtime slug validation.
- [ ] Implement `GET /api/environment/v2/locations/[slug]/history?range=24h|7d`.
- [ ] Use fixed `400`, `404` and `503` public errors without database details.
- [ ] Keep latest CDN freshness at no more than 60 seconds and history at no more than 5 minutes.
- [ ] Keep Route Handlers dynamic because they read request URLs and current database state; do not opt into static generation.
- [ ] Assert safe cache headers, duplicate parameter rejection and absence of private/secret-shaped fields.

**Checkpoint:** v2 APIs are independently consumable by the new page and future non-browser clients.

## Task 10: Move v1 public reads onto the normalized domain

**Files:** `lib/environment/public.ts`, `lib/environment/supabase-public.ts`, v1 latest/history routes and tests, optional focused compatibility adapter.

- [ ] Resolve `home` primary indoor/outdoor devices from v2 metadata.
- [ ] Project their temperature, humidity, battery, source time and freshness into the exact v1 response types.
- [ ] Preserve indoor-minus-outdoor delta rounding and overall freshness behavior.
- [ ] Preserve 24-hour raw and 7-day Perth-hour aggregation behavior and response ordering.
- [ ] Run the frozen v1 contract fixtures and every existing `environment-public*` test.
- [ ] Compare production v1 JSON before and after deployment, ignoring only expected live values/timestamps.

**Compatibility gate:** do not begin the page migration until v1 response shape is byte-structure compatible and real Home Assistant readings advance through v2 storage.

## Task 11: Add dynamic location pages and instant-feeling navigation

**Files:** `app/[locale]/(environment)/environment/page.tsx`, new `app/[locale]/(environment)/environment/[location]/page.tsx`, `loading.tsx`, shared server loader/component, metadata and page tests.

- [ ] Keep `/environment` as the server-rendered `home` entry.
- [ ] Add `/environment/[location]` with async params, runtime slug validation and `notFound()` for unavailable/non-public locations.
- [ ] Share one server loader that starts locations/latest/24h history queries in parallel and preserves partial error flags.
- [ ] Pass only serializable public DTOs into the client dashboard.
- [ ] Add a meaningful environment loading shell so dynamic route prefetching and client transitions have immediate feedback.
- [ ] Keep metadata localized and private to robots for both base and dynamic pages.
- [ ] Use the locale-aware navigation layer and prefetch known location paths.
- [ ] Implement selector-driven data preloading: keep the last dashboard snapshot, load next latest/history in parallel, then update the independent URL through a Next-compatible client navigation/history path.
- [ ] Respond to browser Back/Forward by loading the URL location without a full reload.
- [ ] Preserve the current snapshot and URL when target loading fails.
- [ ] Test `/environment`, `/environment/home`, another location, invalid slug, all locales, noindex and sitemap isolation.

**UX gate:** throttle the v2 test API and verify that location selection gives immediate feedback without a white page or loss of theme/language controls.

## Task 12: Refactor the dashboard into modular device and metric views

**Files:** split focused components from `environment-dashboard.tsx`, update `environment.module.css`, `messages/zh-CN.json`, `en.json`, `ja.json`, page tests.

- [ ] Keep the top-level client boundary limited to navigation, polling, range and interaction state.
- [ ] Add the location selector with localized names and accessible pending/error states.
- [ ] Render current cards from device/metric metadata rather than hard-coded indoor/outdoor JSX.
- [ ] Preserve battery display as device health while omitting a default battery chart.
- [ ] Generate temperature, humidity, CO₂ and PM2.5 chart sections only when data exists.
- [ ] Preserve home temperature/humidity deltas and omit the entire delta module elsewhere.
- [ ] Add PM2.5 current concentration, separate China/U.S. reference blocks, standard versions, computation time, sample state and non-official disclaimer.
- [ ] Add CO₂ current value, one-hour mean, ventilation band, sample state and non-safety disclaimer.
- [ ] Preserve 60-second latest polling, 24h/7d history switching, last-valid snapshots and partial/stale/empty states.
- [ ] Add complete Chinese, English and Japanese messages and update locale completeness tests.
- [ ] Verify warm light/dark themes, narrow mobile cards and reduced-motion behavior.

## Task 13: Add nearest-series chart inspection

**Files:** `lib/environment/chart.ts`, new `lib/environment/chart-hit-test.ts`, focused chart component/client hook, CSS, tests.

- [ ] Extend the chart model with stable device/series identifiers and screen-space data points.
- [ ] Implement a pure two-dimensional nearest-point function across all visible series with a documented hit radius.
- [ ] Add pointer enter/move/leave behavior for mouse.
- [ ] Add Pointer Events with pointer capture for touch press/horizontal drag/release/cancel while preserving vertical page scrolling.
- [ ] Render one selected series only: vertical guide, selected point and an edge-aware tooltip.
- [ ] Show location, device, location-timezone timestamp, value and unit; never show all series together.
- [ ] Add focus, left/right point navigation, up/down series navigation and Escape clearing.
- [ ] Add an accessible live/status description equivalent to the visual tooltip.
- [ ] Distinguish series with color, dash and point styles, and create a deterministic style cycle for more devices than the base palette.
- [ ] Test nearest-series selection, equal-distance tie breaking, hit radius, first/last point, tooltip edge placement, touch lifecycle and keyboard transitions.
- [ ] Browser-verify desktop mouse hover, mobile emulation drag, vertical page scroll and dark theme contrast.

## Task 14: Write the configuration and operations tutorial

**Files:** new `docs/environment-configuration-guide.md`, `docs/environment-operations.md`, `docs/environment-next-steps.md`, README links, safe example snippets.

- [ ] Explain the v1/v2 architecture, RLS boundary and why ESP32 never receives a Supabase key.
- [ ] Document adding localized locations, sources, devices, placements, metrics and home-style comparisons.
- [ ] Document configuration validation, migration generation, SQL review, backup, execution and post-migration checks.
- [ ] Document clipboard-only token generation, device provisioning, rotation and revocation.
- [ ] Add Home Assistant v2 REST command and ten-minute automation examples using placeholders only.
- [ ] Add an ESP32 HTTPS JSON example with CA validation, time synchronization, bounded timeout and next-cycle retry.
- [ ] Document anonymous, wrong-token, partial-invalid, duplicate-bucket and real-reading acceptance checks.
- [ ] Add SQL health queries for latest values, gaps, per-source activity, idempotency and 30-day cleanup without selecting token digests.
- [ ] Document disabling metadata without deleting history and all fixed error codes.
- [ ] Update operations and next-steps documents to distinguish deployed state from remaining production actions.
- [ ] Scan documentation and fixtures for secret-shaped values, real entity IDs and private infrastructure details.

## Task 15: Full verification and production rollout

**Files:** all changed files; no unrelated cleanup.

- [ ] Run focused environment tests after every task.
- [ ] Run `npm.cmd test` and confirm the frozen v1 tests plus all new v2 tests pass.
- [ ] Run `npx.cmd tsc --noEmit`.
- [ ] Run focused ESLint while the local `.pytest_cache` permission issue exists; fix the project ignore only if the workspace confirms it is a repository problem rather than sandbox behavior.
- [ ] Run the full lint command when readable and `npm.cmd run build` with network access for Google Fonts or an approved local-font change.
- [ ] Start the development server and browser-verify base/dynamic locale routes, location transitions, charts, tooltips, themes and console/network errors.
- [ ] Render mobile and desktop screenshots for visual regression review.
- [ ] Apply the reviewed migration and verify old/new latest values before routing v1 writes to v2.
- [ ] Deploy v2 APIs first, verify anonymous `401`, fixed error paths, cache headers and public projection.
- [ ] Manually run Home Assistant twice in one bucket; verify one stored set and one duplicate set.
- [ ] Provision one test ESP32/source token, form three real ten-minute buckets, then rotate or revoke the test token.
- [ ] Deploy the page, verify all locale paths remain `noindex, nofollow`, sitemap remains clean, and no blog shell is loaded.
- [ ] Monitor Home Assistant/Vercel errors and v1/v2 freshness through at least three scheduled cycles.
- [ ] Commit only intended source, migration, tests and docs; keep `public/mom50ome-qr*` untracked.

## Rollback

- Before migration, back up current environment metadata and readings.
- If the migration fails, rely on its transaction rollback and do not deploy v2-writing code.
- If v2 routes fail after migration, disable new ESP32 sources and redeploy the last v1 application; retain v2 rows for diagnosis.
- If v1 compatibility fails, restore the prior application immediately, then backfill any v2-only interval after fixing the adapter.
- Never delete v2 or legacy readings during incident response, and never reopen Home Assistant port 8123 to the public internet.

## Completion

The implementation is complete only when the user can add a location and ESP32-backed device through the documented configuration/migration flow, Home Assistant and old public JSON remain compatible, location navigation feels continuous, mouse/touch/keyboard chart inspection works, AQI/CO₂ references are correctly qualified, all automated checks pass, and real ten-minute data has been verified in production.
