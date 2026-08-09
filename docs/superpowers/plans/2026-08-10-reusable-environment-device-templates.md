# Reusable Environment Device Templates Implementation Plan

> Design: `docs/superpowers/specs/2026-08-09-reusable-environment-device-templates-design.md`

**Status:** Complete. Repository templates and validation are finished; no production producer or runtime was changed.

## Constraints

- Do not modify or flash `firmware/dormitory-air-station`.
- Do not connect to or change the current Home Assistant server.
- Do not change Supabase, Vercel, the database schema, environment APIs or Edge Function behavior.
- Never copy real Wi-Fi credentials, entity IDs or source tokens into the template or tests.
- Keep ESP32 production uploads on the existing Supabase relay and Home Assistant uploads on the direct v2 website route.

## Task 1: Add failing template contract tests

**Files:** new `tests/environment-templates.test.ts`.

- [x] Assert the complete reusable template tree exists.
- [x] Assert template-local secret filenames are ignored.
- [x] Assert examples contain explicit placeholders but no likely plaintext credentials or Supabase keys.
- [x] Assert the ESP32 template contains the fixed relay URL, v2 schema, supported metric keys and bounded timeout values.
- [x] Assert the Home Assistant package contains one ten-minute automation, the direct v2 URL, secret reference and safe entity-state handling.
- [x] Run the focused test and confirm it fails because the template files do not exist.

## Task 2: Implement the self-contained ESP32 template

**Files:** new files under `templates/environment/esp32/station-template/`.

- [x] Add public and secret example configuration files plus template-local ignore rules.
- [x] Extract a sensor-independent uploader that owns Wi-Fi failover, UTC readiness, ten-minute windows, bounded v2 JSON and HTTPS upload.
- [x] Define the small metric/sample interface between sensor code and uploader.
- [x] Implement the SHT30/PMS5003 adapter with independent validation and averages.
- [x] Add the minimal Arduino sketch composition root and trusted CA bundle.
- [x] Add copy/configure/compile/flash/verify/rollback instructions without real secrets.
- [x] Compile the copied template with the installed Espressif ESP32 platform without uploading it.

## Task 3: Implement the Home Assistant v2 package template

**Files:** new files under `templates/environment/home-assistant/`.

- [x] Add the authoritative `!include_dir_named packages` configuration fragment.
- [x] Add a package with one marked edit block for device slugs and entity IDs.
- [x] Build a single v2 readings array while omitting unavailable and non-numeric values rather than coercing them to zero.
- [x] Add one direct-v2 `rest_command` and one ten-minute automation with no retry loop.
- [x] Add a Bearer secret example and ensure the package references it without embedding credentials.
- [x] Document backup, installation, `check_config`, controlled restart, manual run, logs, response codes and rollback.
- [x] Validate the YAML structure locally and document that target Home Assistant `check_config` remains authoritative.

## Task 4: Add shared onboarding and handoff documentation

**Files:** new `templates/environment/README.md`; update `docs/environment-configuration-guide.md`, `docs/environment-next-steps.md`.

- [x] Summarize the proven Home Assistant and ESP32 production paths without exposing private configuration.
- [x] Explain which template to copy and the two-file public/secret configuration model.
- [x] Link metadata, migration, token and three-window verification steps to the canonical guide.
- [x] State explicitly that current production producers are examples to observe, not files to overwrite.
- [x] Point future users and AI sessions to the template entry point.

## Task 5: Verify and deliver

- [x] Run focused template tests and the full repository test suite.
- [x] Run TypeScript validation, lint, production build and `git diff --check`.
- [x] Recompile the ESP32 template and record flash/RAM use.
- [x] Scan the exact diff for plaintext credentials and forbidden Supabase keys.
- [x] Confirm `firmware/dormitory-air-station` is unchanged and its local `secrets.h` remains ignored.
- [x] Mark this plan complete and commit the templates, tests, plan and documentation.

**Completion:** the repository contains two copyable, secret-safe templates and their validation evidence, while all current production systems remain untouched.

## Verification evidence

- Focused template contract tests: 4 passed.
- Full repository tests: 93 passed.
- TypeScript: passed.
- ESLint: 0 errors; 11 pre-existing warnings outside the template scope.
- Next.js 16.2.7 production build: passed.
- ESP32 template compile: 1,088,644 bytes flash (83%) and 50,592 bytes RAM (15%); no upload performed.
- Home Assistant YAML structure and five Jinja templates: parsed successfully; target `check_config` remains required before installation.
- Exact template secret scan and `git diff --check`: passed.
