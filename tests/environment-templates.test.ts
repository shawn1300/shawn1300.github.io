import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(process.cwd(), "templates", "environment");

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

const requiredFiles = [
  "README.md",
  "esp32/station-template/station-template.ino",
  "esp32/station-template/environment-uploader.h",
  "esp32/station-template/environment-uploader.cpp",
  "esp32/station-template/sensor-adapter.h",
  "esp32/station-template/sensor-adapter.cpp",
  "esp32/station-template/device-config.example.h",
  "esp32/station-template/secrets.example.h",
  "esp32/station-template/trusted-roots.h",
  "esp32/station-template/.gitignore",
  "esp32/station-template/README.md",
  "home-assistant/environment-v2-package.yaml",
  "home-assistant/secrets.example.yaml",
  "home-assistant/configuration.example.yaml",
  "home-assistant/README.md",
];

test("reusable environment template tree is complete", () => {
  for (const relativePath of requiredFiles) {
    assert.doesNotThrow(() => read(relativePath), relativePath);
  }
});

test("ESP32 template keeps configuration separate and uses the proven relay contract", () => {
  const ignore = read("esp32/station-template/.gitignore");
  const sketch = read("esp32/station-template/station-template.ino");
  const uploader = [
    read("esp32/station-template/environment-uploader.h"),
    read("esp32/station-template/environment-uploader.cpp"),
  ].join("\n");
  const adapter = [
    read("esp32/station-template/sensor-adapter.h"),
    read("esp32/station-template/sensor-adapter.cpp"),
  ].join("\n");

  assert.match(ignore, /^\/secrets\.h$/m);
  assert.match(ignore, /^\/device-config\.h$/m);
  assert.match(sketch, /#include "device-config\.h"/);
  assert.match(sketch, /#include "secrets\.h"/);
  assert.match(
    uploader,
    /https:\/\/gbmxqegjkmzuvhisyxou\.supabase\.co\/functions\/v1\/environment-ingest-relay/
  );
  assert.match(uploader, /\\"schemaVersion\\":2/);
  assert.match(uploader, /20000/);
  assert.match(uploader, /setHandshakeTimeout\(12\)/);
  for (const metric of ["temperatureC", "humidityPercent", "pm25UgM3"]) {
    assert.match(`${uploader}\n${adapter}`, new RegExp(metric));
  }
});

test("Home Assistant template uses one safe ten-minute v2 batch", () => {
  const packageYaml = read("home-assistant/environment-v2-package.yaml");
  const configYaml = read("home-assistant/configuration.example.yaml");
  const secretYaml = read("home-assistant/secrets.example.yaml");

  assert.match(configYaml, /packages:\s*!include_dir_named packages/);
  assert.match(
    packageYaml,
    /https:\/\/shawn1300\.cc\.cd\/api\/environment\/v2\/ingest/
  );
  assert.match(packageYaml, /Authorization:\s*!secret environment_v2_authorization/);
  assert.match(packageYaml, /minutes:\s*"\/10"/);
  assert.equal((packageYaml.match(/time_pattern/g) ?? []).length, 1);
  assert.match(packageYaml, /is_number/);
  assert.match(packageYaml, /to_json/);
  assert.doesNotMatch(packageYaml, /\|\s*float\s*(?:\}|$)/m);
  assert.match(secretYaml, /Bearer <paste-source-token-here>/);
});

test("template examples contain no likely credentials or Supabase keys", () => {
  const all = requiredFiles.map(read).join("\n");
  const forbidden = [
    /sb_secret_/i,
    /SUPABASE_(?:ANON|PUBLISHABLE|SECRET|SERVICE_ROLE)_KEY\s*[:=]/i,
    /Authorization:\s*Bearer\s+[A-Za-z0-9_-]{32,}/i,
  ];
  for (const pattern of forbidden) assert.doesNotMatch(all, pattern);
});
