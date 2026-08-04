# Environment Monitoring Implementation Plan

> Design source: `docs/superpowers/specs/2026-08-04-environment-monitoring-design.md`

> **Superseded collection plan (2026-08-04):** Do not execute the `micloud`, `ssecurity`, local bootstrap, or GitHub Actions collection tasks in this document. Real-device feasibility was proven with the official Xiaomi Home integration in a private Home Assistant deployment. The replacement design is `docs/superpowers/specs/2026-08-04-home-assistant-environment-export-design.md`; a new implementation plan must replace the collection tasks before work continues. Database, standalone page, public API, 30-day retention, and VRChat goals remain valid.

**Goal:** Read two China-region Xiaomi `LYWSD03MMC` sensors through the existing Mi Home Bluetooth gateway, retain 30 days of readings in Supabase, publish an unlinked standalone `/environment` page, and expose a safe latest-reading API for a future VRChat OSC bridge.

**Architecture:** A small Python collector uses a one-time locally bootstrapped Xiaomi cloud session, not repeated username/password logins. GitHub Actions runs the token-based collector every 10 minutes and writes through the Supabase service role. Next.js Route Handlers project safe public JSON from private tables. A sibling route group under `[locale]` supplies an independent themed page without the blog shell.

**Tech stack:** Next.js 16.2.7 App Router, React 19.2.4, TypeScript, next-intl, next-themes, Supabase PostgreSQL/PostgREST, Python 3.12, `micloud==0.6`, GitHub Actions, project-native SVG charts.

---

## File map

Create:

- `collector/requirements.txt`
- `collector/environment_collector/__init__.py`
- `collector/environment_collector/config.py`
- `collector/environment_collector/models.py`
- `collector/environment_collector/xiaomi_cloud.py`
- `collector/environment_collector/supabase_store.py`
- `collector/environment_collector/bootstrap.py`
- `collector/environment_collector/collect.py`
- `collector/environment_collector/cleanup.py`
- `collector/tests/test_xiaomi_cloud.py`
- `collector/tests/test_supabase_store.py`
- `collector/tests/test_collect.py`
- `.github/workflows/environment-monitor.yml`
- `supabase/migrations/006_environment_monitoring.sql`
- `types/environment.ts`
- `lib/environment/model.ts`
- `lib/environment/data.ts`
- `tests/environment.test.ts`
- `app/api/environment/latest/route.ts`
- `app/api/environment/history/route.ts`
- `app/[locale]/(environment)/layout.tsx`
- `app/[locale]/(environment)/environment/page.tsx`
- `components/environment/environment-dashboard.tsx`
- `components/environment/environment-chart.tsx`
- `components/environment/environment-reading.tsx`
- `scripts/verify-environment-isolation.mjs`
- `docs/environment-operations.md`

Modify:

- `.gitignore`
- `package.json`
- `types/supabase.ts`
- `messages/zh-CN.json`
- `messages/en.json`
- `messages/ja.json`
- `README.md`

Do not modify:

- `components/layout/header.tsx`
- `app/sitemap.ts`
- `old-site/environment.html`
- existing `sensor_readings` data or policies

---

## Task 1: Establish collector tests and secret-safe configuration

**Files:** collector config/model files, `requirements.txt`, `.gitignore`, collector tests.

- [ ] Add `.collector-credentials.json` and `collector/.env` to `.gitignore` before producing any local session material.
- [ ] Pin Python 3.12-compatible dependencies. Use `micloud==0.6` for the signed Xiaomi request implementation and a current `requests` 2.x release; add `pytest` only as a test dependency.
- [ ] Define immutable `SensorReading`, `CloudDevice`, and `CollectorConfig` models.
- [ ] Make required production variables explicit: `MI_USER_ID`, `MI_SERVICE_TOKEN`, `MI_SSECURITY`, `MI_INDOOR_DID`, `MI_OUTDOOR_DID`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Reject blank, duplicated, or malformed indoor/outdoor DIDs before any network request.
- [ ] Add tests proving validation errors never echo secret values.
- [ ] Run `python -m pytest collector/tests -q`; expect config/model tests to pass.
- [ ] Commit with `test: establish environment collector contract`.

## Task 2: Implement the Xiaomi cloud adapter and local bootstrap

**Files:** `xiaomi_cloud.py`, `bootstrap.py`, `test_xiaomi_cloud.py`, operations documentation.

- [ ] Write failing tests for device-list parsing, exact model verification, MIoT property requests, partial property failures, token expiry, and log redaction.
- [ ] Hydrate `micloud.MiCloud` from `user_id`, `service_token`, and `ssecurity`; scheduled collection must not require the account password.
- [ ] Read devices from the `cn` server and call `/miotspec/prop/get` with temperature `(2,1)`, humidity `(2,2)`, and battery `(3,1)`.
- [ ] Verify both selected DIDs resolve to `miaomiaoce.sensor_ht.t2` before accepting values.
- [ ] Capture `isOnline` when the device list provides it. Leave `source_observed_at` null unless the cloud response supplies a real source timestamp.
- [ ] Keep library logging at INFO or higher because debug output in legacy clients may contain session material.
- [ ] Implement an interactive local bootstrap that prompts for username/password without echo, logs in once, lists matching devices locally, lets the user select indoor/outdoor, and writes `.collector-credentials.json` with restrictive local permissions where supported.
- [ ] Add a small stateful bootstrap authentication adapter for Xiaomi `notificationUrl` verification. It must preserve one HTTP session, validate an exact `https://account.xiaomi.com` origin, open the full challenge URL without logging its query string, prompt without echo for the one-time SMS/email code, submit it in the same session, and then resume login.
- [ ] Handle at most one `captchaUrl` challenge in the same session: validate the exact Xiaomi HTTPS origin, require a non-empty supported raster image no larger than 1 MiB, and verify its file signature. A missing content type or `application/octet-stream` is accepted only when the bytes have an exact JPEG, PNG, GIF, or WebP signature; HTML, JSON, SVG, and mismatched declarations remain rejected. Write the image only to a randomized OS temporary file, open it with the default viewer, prompt without echo, and delete or register exit cleanup for the file on every path. A second image challenge stops safely.
- [ ] Continue from a successful image captcha into the existing `notificationUrl` branch without restarting the password session.
- [ ] Add `browser_bootstrap.py` as a local fallback that accepts at most 64 KiB of hidden, one-line Xiaomi `xiaomiio` service-login JSON, strips an optional `&&&START&&&` XSSI prefix, requires authenticated `code=0`, and extracts `userId` plus a transient `passToken` without logging or persisting either source value.
- [ ] Send `userId` and `passToken` only as per-request cookies on one exact `https://account.xiaomi.com/pass/serviceLogin?sid=xiaomiio&_json=true` refresh. Do not place them in the persistent session cookie jar or client attributes; reject a refreshed `userId` that differs from the imported identity.
- [ ] Take `ssecurity` and a fresh `location` only from the authenticated refresh response, validate the completion URL using the strict HTTPS Xiaomi host allowlist with no user info or non-default port, consume it once to obtain `serviceToken`, clear transient references, verify the client retains no `passToken`, then reuse the normal device selection, real-read probe, and credential writer.
- [ ] Pin Playwright in `collector/requirements.txt` and launch the installed Microsoft Edge channel without running `playwright install` or downloading a bundled Chromium.
- [ ] Add `edge_bootstrap.py` with a visible, non-persistent browser context and a 10-minute deadline. The user enters credentials only on Xiaomi's official page; the collector must not inspect form fields, request bodies, an existing browser profile, extensions, or storage state.
- [ ] Add a strict response parser that accepts at most 64 KiB from only the exact Xiaomi `serviceLoginAuth2` and `serviceLogin` HTTPS endpoints, strips the optional XSSI prefix, requires `code=0`, and extracts only `userId`, `ssecurity`, and a validated fresh `location`.
- [ ] Reuse an existing matching `serviceToken` from the ephemeral context when present; otherwise consume the validated `location` once in that context, then read only matching `serviceToken` and optional `userId` cookies for Xiaomi's STS/API origins. Reject identity conflicts.
- [ ] Close the page, context, Edge, and Playwright before hydrating a password-free `MiCloud` client and calling the shared real-device bootstrap. Classify Edge absence, dependency absence, timeout, user close, malformed response, identity mismatch, and missing session material without leaking secrets.
- [ ] Add an independent `edge_diagnostic.py` command that leaves the strict production capture allowlist unchanged while observing JSON responses from only the exact `https://account.xiaomi.com` origin in a fresh non-persistent Edge context.
- [ ] Reject non-JSON and declared over-64-KiB responses before body access; discard undeclared bodies after one read when their actual size exceeds 64 KiB. Parse only the root object and one `data` object without recursive searching.
- [ ] Render only a sequence number, sanitized query-free path, status code, and fixed presence flags for `code=0`, `userId`, `ssecurity`, `location`, and `passToken`. Redact unsafe/long paths and runs of four or more digits; never render response values, arbitrary keys, bodies, cookies, or accounts.
- [ ] Permit the diagnostic command to continue through the existing real-device bootstrap only when one layer contains a complete strictly validated login candidate and its identity matches a restricted STS/API `serviceToken` cookie. Otherwise close Edge five seconds after a cloud cookie appears and report a sanitized incomplete-session conclusion.
- [ ] Refactor the post-authentication bootstrap work into one shared function so password verification and browser-response import cannot drift in device or secret-handling behavior.
- [ ] Test overlong/malformed input, unauthenticated status, missing `passToken`, per-request cookie isolation, refreshed identity mismatch, hostile refreshed completion URLs, missing `serviceToken`, response redaction, client `passToken` cleanup, and the shared successful probe path. Remind the user to clear the clipboard without reading or overwriting it automatically.
- [ ] Test the Edge flow with fake browser objects only: exact response origins and paths, overlong/malformed/unauthenticated bodies, hostile completion URLs, timeout, user close, existing cookie reuse, one-time completion navigation, identity mismatch, cleanup on every path, secret redaction, and the shared successful probe. Automated tests must not launch Edge or contact Xiaomi.
- [ ] Test the diagnostic flow with fake browser objects only: origin and media-type rejection, declared/actual size bounds, root versus one-level `data` flags, non-recursion, path and digit redaction, complete-session pass-through, cloud-cookie-only five-second failure, output-wide secret scanning, and cleanup on every path.
- [ ] Classify wrong credentials, rejected/expired verification, repeated or invalid image captcha, invalid verification origin, and network failure without logging raw Xiaomi responses, cookies, passwords, codes, tokens, or complete challenge URLs.
- [ ] Cover the verification branch with mocked responses, including origin rejection and secret-redaction assertions. Do not exercise a real account in automated tests.
- [ ] Never print tokens or full DIDs. Document how to upload each value with GitHub CLI or the GitHub Secrets UI without pasting them into source code or chat.
- [ ] Run collector unit tests.
- [ ] Commit with `feat: add Xiaomi environment cloud probe`.

## Task 3: Pass the real-device feasibility gate

**Files:** no production file changes unless the probe exposes a compatibility bug.

- [ ] User creates or chooses the dedicated China-region Xiaomi account and shares the Mi Home household to it where possible.
- [ ] User runs `python -m collector.environment_collector.bootstrap` locally. Credentials stay on the user's machine.
- [ ] Run a read-only probe for both selected sensors.
- [ ] Required success result: two exact model matches and valid temperature, humidity, and battery responses.
- [ ] Record whether `isOnline` and any source timestamp are actually available; this determines final UI wording.
- [ ] If shared-account access fails, repeat once with the primary account session.
- [ ] If both fail after supported image and SMS/email verification because of unsupported BLE cloud properties or API rejection, stop implementation and produce a feasibility report recommending the ESP32 fallback. Do not continue with fake data.
- [ ] If successful, upload only session/DID values to GitHub Secrets and continue.

## Task 4: Add the isolated Supabase schema and 30-day retention

**Files:** `006_environment_monitoring.sql`, `types/supabase.ts`, collector store tests.

- [ ] Write SQL contract tests or static assertions first for all three tables, unique constraints, range checks, indexes, RLS, and cleanup behavior.
- [ ] Create `environment_locations`, `environment_sensors`, and `environment_readings` exactly as approved in the design.
- [ ] Seed only the `home` location with translated names and `Australia/Perth`. The first successful collector run creates or updates the two sensor rows with real DIDs.
- [ ] Use `(sensor_id, idempotency_key)` as the reading uniqueness constraint.
- [ ] Enable RLS on all environment tables and add no anonymous direct-read or write policy. Reads go through server Route Handlers; writes use service role only.
- [ ] Add a service-only cleanup function or direct delete contract for `collected_at < now() - interval '30 days'`.
- [ ] Add environment table shapes to `types/supabase.ts` without weakening existing types.
- [ ] Apply the migration to a development Supabase project before production.
- [ ] Verify old `sensor_readings` remains untouched.
- [ ] Commit with `feat: add environment monitoring schema`.

## Task 5: Persist collection and schedule GitHub Actions

**Files:** `supabase_store.py`, `collect.py`, `cleanup.py`, workflow, Python tests.

- [ ] Write failing tests for location lookup, sensor upsert, idempotent reading upsert, one-sensor failure, range rejection, API error redaction, and 30-day cleanup.
- [ ] Implement PostgREST writes with the Supabase service role; do not add the Python Supabase SDK unless direct REST becomes materially more complex.
- [ ] Derive idempotency keys from GitHub run id plus sensor role. Local manual runs use a generated run UUID.
- [ ] Upsert indoor and outdoor independently so one failure does not discard the other.
- [ ] Add `.github/workflows/environment-monitor.yml` with:
  - Python 3.12
  - `cron: '*/10 * * * *'`
  - `workflow_dispatch`
  - concurrency group preventing overlapping collectors
  - least-privilege repository permissions
  - GitHub Secrets mapped only to the collector process
- [ ] Add a separate daily cleanup invocation. Cleanup failure must not roll back a successful collection.
- [ ] Ensure workflow logs show only role, success/failure, duration, and masked error categories.
- [ ] Run all Python tests and a manual workflow against development Supabase.
- [ ] Commit with `feat: schedule Xiaomi environment collection`.

## Task 6: Build the TypeScript environment domain layer

**Files:** `types/environment.ts`, `lib/environment/model.ts`, `lib/environment/data.ts`, `tests/environment.test.ts`.

- [ ] Start with failing Node tests for range parsing, public projection, per-sensor and aggregate freshness, indoor/outdoor deltas, one-sensor absence, 24-hour raw series, 7-day hourly aggregation, and Perth time behavior.
- [ ] Define a stable public API type that cannot contain `source_device_id`.
- [ ] Use source time and `source_online` when available. Otherwise label the timestamp as a cloud-read time and treat freshness as cloud-chain freshness only.
- [ ] Query with the existing cookie-free `createAdminSupabase()` server client.
- [ ] Keep database access in `server-only` modules; keep pure calculation helpers separately testable.
- [ ] Limit history queries to `24h` and `7d` and sort data deterministically.
- [ ] Run `npm test`.
- [ ] Commit with `feat: add environment data domain`.

## Task 7: Add safe public Route Handlers

**Files:** latest/history Route Handlers and tests.

- [ ] Write failing tests for missing/unknown location, invalid range, safe partial responses, and absence of internal identifiers.
- [ ] Implement `GET /api/environment/latest?location=home`.
- [ ] Implement `GET /api/environment/history?location=home&range=24h|7d`.
- [ ] Return 400 for invalid input, 404 for unknown/disabled locations, and a valid partial payload when only one sensor has data.
- [ ] Use Next.js 16's current Route Handler APIs. Because `cacheComponents` is disabled, do not use `use cache`.
- [ ] Set public CDN caching to at most 60 seconds for latest and 5 minutes for history, with a bounded stale-while-revalidate window.
- [ ] Log only internal error categories and return generic public errors.
- [ ] Run tests, lint, and a production build.
- [ ] Commit with `feat: expose environment read APIs`.

## Task 8: Add translations and the independent page shell

**Files:** three message JSON files, standalone layout, page, verification script.

- [ ] Add an `Environment` namespace in Chinese, English, and Japanese for headings, locations, indoor/outdoor labels, data-time wording, ranges, freshness, empty/error states, units, and accessibility labels.
- [ ] Create `[locale]/(environment)/layout.tsx` with only the existing `ThemeProvider`; exclude all blog-shell providers and components.
- [ ] Create the page metadata with `noindex, nofollow`, an absolute localized title, and no sitemap modification.
- [ ] Server-render the initial location list and latest snapshot; pass serializable safe data to the client dashboard.
- [ ] Add `scripts/verify-environment-isolation.mjs` to assert that the route exists, contains private robots metadata, uses ThemeProvider, and does not import Header, Footer, MusicProvider, or BackToTop.
- [ ] Add a `verify:environment` package script for the isolation check; no new JavaScript dependency is required.
- [ ] Verify `/environment`, `/en/environment`, and `/ja/environment` resolve under the current next-intl proxy.
- [ ] Commit with `feat: add standalone environment page shell`.

## Task 9: Implement the environment dashboard and SVG charts

**Files:** three environment components and focused tests.

- [ ] Implement the approved hierarchy: large place selector first, indoor/outdoor second, then comparison and range controls.
- [ ] With only one location, render `Home` as the active place without dead placeholder locations; retain a reusable switcher contract for future sites.
- [ ] Use semantic theme variables from `app/globals.css`. Default light mode and existing theme persistence must work through `next-themes`.
- [ ] Avoid generic rounded dashboard cards. Use whitespace, hairline separators, restrained typography, and the existing chart tokens.
- [ ] Implement two lightweight accessible SVG line charts: temperature and humidity. Distinguish indoor/outdoor by text legend and solid/dashed strokes, not color alone.
- [ ] Add keyboard-accessible `24h`/`7d` controls and informative empty chart states.
- [ ] Poll latest data every 60 seconds. Preserve the last valid client snapshot on refresh failure and label it honestly.
- [ ] Respect `prefers-reduced-motion` and avoid continuous animation.
- [ ] Stack indoor/outdoor sections on small screens and keep charts horizontally legible without page overflow.
- [ ] Commit with `feat: build environment monitoring dashboard`.

## Task 10: Verify privacy, behavior, and visual quality

**Files:** verification script and tests; no feature expansion.

- [ ] Run `npm test`, `npm run lint`, and `npm run build`.
- [ ] Run all Python collector tests.
- [ ] Run the isolation verification script.
- [ ] Start the production build locally and inspect `/environment` at desktop and mobile widths in both themes.
- [ ] Confirm page source contains `noindex, nofollow`.
- [ ] Confirm `/sitemap.xml`, desktop navigation, and mobile navigation do not contain `/environment`.
- [ ] Exercise fresh, stale, one-sensor-missing, all-empty, and request-failure fixtures.
- [ ] Check browser console and network panel for secrets, raw DIDs, hydration errors, and unbounded polling.
- [ ] Capture screenshots for the implementation review; do not add them to the production bundle unless needed as documentation.
- [ ] Commit fixes with focused messages rather than one broad cleanup commit.

## Task 11: Document operations and deploy

**Files:** `docs/environment-operations.md`, `README.md`.

- [ ] Document local bootstrap, GitHub Secret names, manual collection, token-expiry recovery, workflow reruns, Supabase migration order, cleanup verification, and the ESP32 fallback trigger.
- [ ] State explicitly that Xiaomi account credentials must never be sent through chat or committed.
- [ ] Document outdoor sensor shelter requirements.
- [ ] Document the future VRChat contract: latest endpoint, 144-character limit, `127.0.0.1:9000`, and `/chatbox/input`.
- [ ] Apply migration `006` to production Supabase.
- [ ] Configure GitHub Secrets and manually run the workflow once.
- [ ] Verify two production readings and then enable/confirm the scheduled workflow.
- [ ] Deploy the existing Vercel project and verify the production URL directly.
- [ ] Commit documentation with `docs: add environment operations guide`.

## Final acceptance checklist

- [ ] Cloud feasibility gate passed with both real `LYWSD03MMC` devices.
- [ ] No Xiaomi password is stored in GitHub; scheduled runs use session material only.
- [ ] Two independent readings arrive approximately every 10 minutes.
- [ ] Records older than 30 days are deleted daily.
- [ ] `/environment` is directly accessible, unlinked, omitted from sitemap, and marked `noindex, nofollow`.
- [ ] The page defaults to the blog's warm light theme and supports the existing dark theme.
- [ ] Indoor/outdoor current values, battery, data times, deltas, 24-hour chart, and 7-day chart all use real data.
- [ ] Partial, stale, and empty states are explicit.
- [ ] Public APIs contain no Xiaomi DID, token, gateway, or internal database error.
- [ ] The latest endpoint is sufficient for a later local VRChat OSC bridge without redesigning storage.
