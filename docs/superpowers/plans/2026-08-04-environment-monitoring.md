# Environment Public API and Page Implementation Plan

> Product design: `docs/superpowers/specs/2026-08-04-environment-monitoring-design.md`
> Resume entry: `docs/environment-next-steps.md`

**Status:** Data collection, public read APIs and the standalone localized page are implemented, deployed to Vercel Production via main push, and verified (noindex, sitemap, API projection, error paths).

## Constraints

- Read the relevant Next.js 16.2.7 guides in `node_modules/next/dist/docs/` before changing Route Handlers, layouts, metadata or caching.
- Do not add `/environment` to any navigation or sitemap.
- Do not expose raw environment tables to anonymous Supabase clients.
- Do not include database IDs, Xiaomi identifiers, Home Assistant entity IDs or secrets in public types.
- Preserve the five untracked `public/mom50ome-qr*` assets.
- Do not restore the removed Python/Xiaomi collector route.

## Task 1: Public environment domain

**Files:** `types/environment.ts`, new focused modules under `lib/environment/`, Node tests.

- [x] Define latest/history public response types separately from private ingest types.
- [x] Add pure freshness, delta, chronological sorting and Perth time helpers.
- [x] Add a server-only repository that queries only enabled locations, roles and bounded history.
- [x] Support safe partial data when only one role has readings.
- [x] Aggregate `7d` history hourly; keep `24h` at native ten-minute resolution.
- [x] Test fresh, delayed, missing, partial, invalid and boundary-time cases.

## Task 2: Public Route Handlers

**Files:** `app/api/environment/latest/route.ts`, `app/api/environment/history/route.ts`, route tests.

- [x] Implement `GET /api/environment/latest?location=home`.
- [x] Implement `GET /api/environment/history?location=home&range=24h|7d`.
- [x] Validate location and range through explicit allowlists.
- [x] Return fixed public errors and never expose database messages.
- [x] Add bounded CDN caching: latest ≤ 60 seconds, history ≤ 5 minutes.
- [x] Assert that responses contain no private identifiers or secret-shaped fields.

## Task 3: Independent localized shell

**Files:** `[locale]/(environment)` layout/page, three message JSON files, isolation test.

- [x] Add an `Environment` namespace to Chinese, English and Japanese messages.
- [x] Create a standalone layout that retains theme support but imports no blog Header, Footer, music or back-to-top components.
- [x] Add private robots metadata and omit all navigation/sitemap changes.
- [x] Server-render the first safe snapshot and serializable location list.
- [x] Verify `/environment`, `/en/environment` and `/ja/environment`.

## Task 4: Dashboard and charts

- [x] Implement the approved first-level location switcher with only real locations.
- [x] Implement indoor/outdoor current readings, battery, data time, freshness and deltas.
- [x] Add keyboard-accessible `24h/7d` controls.
- [x] Build accessible project-native SVG temperature and humidity charts.
- [x] Poll latest every 60 seconds while preserving the last valid snapshot on failure.
- [x] Implement partial, stale, empty and request-failure states.
- [x] Verify warm light and dark themes, reduced motion, desktop and mobile layouts.

## Task 5: Production verification

- [x] Run focused tests, full `npm test`, TypeScript, ESLint and `npm run build`.
- [x] Confirm page source contains `noindex, nofollow`.
- [x] Confirm navigation and sitemap do not contain `/environment`.
- [x] Inspect public JSON and browser network traffic for private fields.
- [x] Deploy to Vercel and verify all three localized paths with real data.
- [ ] Update `docs/environment-operations.md` only if the deployed read APIs change operations.

## Later project

After this plan is complete, design the Windows VRChat OSC bridge as a separate project consuming only the public latest endpoint.
