# ESP32 Multi-Route Connectivity Probe Implementation Plan

> Product design: `docs/superpowers/specs/2026-08-09-esp32-multi-route-connectivity-probe-design.md`
> Existing firmware design: `docs/superpowers/specs/2026-08-09-dormitory-esp32-air-station-design.md`

**Status:** Software complete; hardware validation pending. Keep the production ingest URL, payload, token handling, sensor sampling and Wi-Fi failover behavior unchanged.

## Constraints

- Run the probe only once per reboot, after Wi-Fi and UTC are ready.
- Never print or transmit Wi-Fi passwords, the source token, Authorization headers, or Supabase API keys.
- Keep TLS certificate verification enabled; do not call `setInsecure()`.
- The Supabase target is a TLS-only connectivity probe, not a Data API request.
- The Osaka target is an unauthenticated `HEAD /` request over port 80 and must not touch Home Assistant port 8123.
- A failed target must not prevent later probes or normal sensor sampling.
- Do not change the production upload target or the ten-minute aggregation behavior.

## Task 1: Generalize the HTTPS startup probe

**Files:** `firmware/dormitory-air-station/dormitory-air-station.ino`.

- [x] Replace the single-host probe state with one once-per-boot connectivity-probe state.
- [x] Add a small result enum covering DNS, TCP, TLS and HTTP outcomes.
- [x] Extract a reusable HTTPS probe that accepts a label and hostname.
- [x] Probe both `shawn1300.cc.cd` and the current public Supabase project hostname.
- [x] Preserve DNS, raw TCP and certificate-validating TLS timing and error details.

**Checkpoint:** both HTTPS targets produce independent results without sending HTTP data.

## Task 2: Add the Osaka HTTP probe and summary

**Files:** `firmware/dormitory-air-station/dormitory-air-station.ino`.

- [x] Connect directly to `217.142.225.118:80` with the existing bounded timeout.
- [x] Send `HEAD /` with only a Host header, a fixed non-secret User-Agent and `Connection: close`.
- [x] Read one bounded status line and accept only a syntactically valid HTTP status code.
- [x] Continue to the summary whether TCP, write, response wait or status parsing fails.
- [x] Print one final line containing the exact result of all three targets.
- [x] Mark the group complete before executing it so later Wi-Fi reconnects cannot repeat it.

**Checkpoint:** a reboot emits one three-target summary and then resumes the existing loop.

## Task 3: Document and verify the firmware

**Files:** `firmware/dormitory-air-station/README.md`, firmware files above.

- [x] Update the startup verification section with the three targets and interpretation boundary.
- [x] Run whitespace and secret-pattern checks over the change.
- [x] Compile with the installed Espressif ESP32 platform and `ESP32 Dev Module` target.
- [x] Confirm flash and dynamic-memory usage remain within board limits.
- [x] Confirm only the expected plan, firmware and README files changed.

**Hardware checkpoint:** flash COM4, capture the complete three-target summary, confirm sensor sample counts continue increasing, then use the result to select the next separately designed upload route.
