# Reusable Environment Device Templates Design

Date: 2026-08-09  
Status: Approved design, pending implementation

## 1. Background and completed baseline

The environment monitoring system now has two proven producers:

- Home Assistant exports the two Xiaomi temperature/humidity devices for `home` every ten minutes through the stable v1 ingest route.
- The dormitory ESP32 reads SHT30 and PMS5003, uploads every ten minutes through the Supabase Edge Function relay, and has passed three consecutive end-to-end production windows.

The modular v2 contract, source-scoped tokens, device/metric mappings, public APIs and multi-location environment page already exist. The remaining problem is reuse: the working producer configurations are tied to their current location and are explained inside long operational documents rather than packaged as copyable templates.

This work adds reusable templates only. It does not modify, rebuild, flash or redeploy the existing dormitory ESP32; it does not install anything on the current Home Assistant server; and it does not change Supabase, Vercel or production data.

## 2. Goals

- Provide a self-contained ESP32 template with a reusable upload core and a working SHT30/PMS5003 example.
- Provide a copyable Home Assistant v2 package with one clearly marked device/entity configuration area.
- Make a new instance require only a public device configuration and a local secret configuration.
- Keep both templates on the existing v2 device and metric contract.
- Preserve the current authentication boundary: producers hold only a source token and never hold a Supabase key.
- Document the complete path from project metadata and source token creation to producer configuration and validation.

## 3. Non-goals

- No generator, setup wizard or blog administration UI.
- No refactor or reflash of `firmware/dormitory-air-station`.
- No changes to the current Home Assistant v1 automation for `home`.
- No production installation of the new Home Assistant package.
- No new database schema, migration, metric type, API route or Edge Function behavior.
- No Vercel, Supabase or hardware deployment in this stage.

## 4. Repository layout

```text
templates/environment/
├─ README.md
├─ esp32/
│  └─ station-template/
│     ├─ station-template.ino
│     ├─ environment-uploader.h
│     ├─ environment-uploader.cpp
│     ├─ sensor-adapter.h
│     ├─ sensor-adapter.cpp
│     ├─ device-config.example.h
│     ├─ secrets.example.h
│     ├─ trusted-roots.h
│     ├─ .gitignore
│     └─ README.md
└─ home-assistant/
   ├─ environment-v2-package.yaml
   ├─ secrets.example.yaml
   ├─ configuration.example.yaml
   └─ README.md
```

`templates/environment/README.md` is the common entry point. Each producer directory remains understandable and usable without reading the other producer template.

## 5. ESP32 template

### 5.1 Component boundaries

`environment-uploader.*` owns:

- ordered Wi-Fi failover;
- UTC synchronization readiness;
- ten-minute upload windows;
- bounded v2 JSON serialization;
- the fixed Supabase relay URL and HTTPS behavior;
- Bearer authorization;
- bounded response logging and failure classification;
- clearing completed or failed windows without replay.

`sensor-adapter.*` owns the SHT30/PMS5003 example:

- I2C and UART initialization;
- the PMS5003 warm-up period;
- independent temperature, humidity and PM2.5 sampling;
- range checks and per-metric averages;
- conversion into the standard v2 metric keys.

`station-template.ino` is a small composition root. It initializes the adapter and uploader, then delegates loop work. It must not contain secrets, site-specific slugs or the upload implementation.

### 5.2 Configuration

The user copies:

- `device-config.example.h` to `device-config.h` for non-secret settings;
- `secrets.example.h` to `secrets.h` for Wi-Fi credentials and the source token.

The public configuration contains the device slug, enabled metrics, pins, sampling intervals and upload interval. The secret configuration contains only the ordered Wi-Fi list and `SOURCE_TOKEN`.

Both generated local files are ignored by the template directory where appropriate. `secrets.h` is always ignored; the README explains whether a copied instance should commit its non-secret `device-config.h`.

### 5.3 Runtime behavior

- Each Wi-Fi is tried up to three times for fifteen seconds per attempt. All failures stop Wi-Fi attempts until reboot.
- NTP must produce a valid UTC clock before uploading.
- SHT30 samples every thirty seconds. PMS5003 samples every two seconds after a thirty-second warm-up.
- Metrics are accumulated independently. A missing metric does not suppress valid metrics.
- One v2 request is generated every ten minutes when at least one metric and a valid timestamp exist.
- Production upload uses the deployed Supabase relay, a twelve-second TLS handshake limit and a twenty-second request limit.
- Failed windows are cleared and are not retried or replayed.
- Logs may contain SSID, connectivity state, sample counts, HTTP status and a bounded safe response. They never contain Wi-Fi passwords, the source token or Authorization header.

### 5.4 Extending sensors

A future sensor implementation replaces or extends `sensor-adapter.*` and produces the standard metric collection consumed by the uploader. Adding CO2 or another supported metric must not require changes to Wi-Fi, time, JSON, authentication or HTTPS code.

The first example supports only the already-proven `temperatureC`, `humidityPercent` and `pm25UgM3` metrics. New metric types remain a separate schema/API design task.

## 6. Home Assistant template

### 6.1 Package shape

`environment-v2-package.yaml` is a Home Assistant package containing:

- one v2 `rest_command`;
- one ten-minute time-pattern automation;
- a single clearly marked edit block containing source-facing device slugs and entity IDs;
- Jinja construction of one bounded v2 `readings` array.

`configuration.example.yaml` shows only the package include needed by a standard container installation. `secrets.example.yaml` shows the required Bearer secret key without a real value.

### 6.2 Entity handling

- Device slugs must exactly match `config/environment.ts` and the applied configuration migration.
- Each configured entity is checked for `unknown`, `unavailable`, missing and non-numeric states.
- Invalid states are omitted rather than converted to zero.
- A device with no valid metrics is omitted; other valid devices continue in the same request.
- `sourceUpdatedAt` is derived from the newest accepted entity update for that device.
- An empty readings array does not call the rest command.
- The template supports temperature, humidity, battery, CO2 and PM2.5 keys already defined by v2.

### 6.3 Runtime behavior

- Home Assistant calls the direct website v2 ingest route; the ESP32-only Supabase relay is not required for the Osaka server path.
- The package sends one batch every ten minutes and does not loop on failure.
- The source token exists only in `/config/secrets.yaml` as a complete Bearer value.
- Logs and example files never include the real token, Xiaomi identifiers or private entity names from the current production system.
- Installation instructions require a timestamped backup, `check_config`, controlled restart, manual automation run and server log review.

## 7. Shared onboarding flow

For either producer:

1. Add the location, source, device and metrics to `config/environment.ts`.
2. Run configuration validation and generate the reviewed configuration migration.
3. Generate a source token, store only its digest in Supabase and put the plaintext only in the target producer's secret store.
4. Copy the appropriate template and edit its public configuration plus local secret configuration.
5. Validate locally without exposing secrets.
6. Install or flash only after reviewing the diff and target mappings.
7. Verify three ten-minute windows, public freshness and secret-safe logs.

## 8. Failure handling

- Invalid producer configuration fails before upload where practical.
- Authentication failures remain fixed `401` responses.
- Mapping and value errors remain fixed `422` responses.
- Temporary relay, website or storage failures remain fixed `503` responses and wait for the next window.
- Producer failures never create fake zero readings or fresh timestamps for old sensor states.
- Neither template owns database migration, token digest storage, retention or public page behavior.

## 9. Testing and verification

Repository checks will verify:

- the template tree contains every documented file;
- local secret files are ignored and examples contain placeholders only;
- no Supabase anon, publishable, secret or service-role key is present or requested;
- the ESP32 template uses the fixed relay, v2 schema and supported metric keys;
- the Home Assistant template uses the direct v2 route, safe entity checks and one ten-minute automation;
- documentation points to the canonical configuration guide and does not instruct users to alter the current production producers.

The ESP32 example will be compiled with the installed Espressif ESP32 platform. It will not be uploaded to COM4. The Home Assistant YAML will receive syntax/structure validation in the repository, while the target server remains responsible for Home Assistant's authoritative `check_config` before installation.

The existing full automated test suite, TypeScript validation and appropriate repository checks must continue to pass.

## 10. Delivery

Implementation adds and commits only the template files, their tests and documentation links. It updates `docs/environment-configuration-guide.md` and `docs/environment-next-steps.md` so a future user or AI starts from the reusable templates.

There is no production runtime deployment for static templates. The current ESP32, Home Assistant, Supabase function, database and Vercel application remain unchanged.
