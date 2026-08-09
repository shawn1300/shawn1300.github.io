import { createHash, randomBytes } from "node:crypto";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { environmentConfiguration } from "../config/environment";
import {
  type EnvironmentConfiguration,
  validateEnvironmentConfiguration,
} from "../lib/environment/config-schema";

function sql(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

export function renderEnvironmentConfigurationSql(
  input: EnvironmentConfiguration
) {
  const configuration = validateEnvironmentConfiguration(input);
  const lines = [
    "-- Generated from config/environment.ts. Review before applying.",
    "BEGIN;",
  ];

  for (const location of [...configuration.locations].sort((a, b) =>
    a.slug.localeCompare(b.slug)
  )) {
    lines.push(
      `INSERT INTO environment_locations (slug, name_zh, name_en, name_ja, timezone, enabled, public_enabled, display_order) VALUES (${[
        location.slug,
        location.name.zh,
        location.name.en,
        location.name.ja,
        location.timezone,
      ]
        .map(sql)
        .join(", ")}, ${location.enabled}, ${location.public}, ${location.order}) ON CONFLICT (slug) DO UPDATE SET name_zh = EXCLUDED.name_zh, name_en = EXCLUDED.name_en, name_ja = EXCLUDED.name_ja, timezone = EXCLUDED.timezone, enabled = EXCLUDED.enabled, public_enabled = EXCLUDED.public_enabled, display_order = EXCLUDED.display_order;`
    );
  }

  for (const source of [...configuration.sources].sort((a, b) =>
    a.slug.localeCompare(b.slug)
  )) {
    lines.push(
      `INSERT INTO environment_sources (slug, name, source_type, enabled) VALUES (${sql(source.slug)}, ${sql(source.name)}, ${sql(source.type)}, ${source.enabled}) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, source_type = EXCLUDED.source_type, enabled = EXCLUDED.enabled;`
    );
  }

  for (const device of [...configuration.devices].sort((a, b) =>
    a.slug.localeCompare(b.slug)
  )) {
    lines.push(
      `INSERT INTO environment_devices (location_id, source_id, slug, name_zh, name_en, name_ja, placement, enabled, display_order) SELECT l.id, s.id, ${sql(device.slug)}, ${sql(device.name.zh)}, ${sql(device.name.en)}, ${sql(device.name.ja)}, ${sql(device.placement)}, ${device.enabled}, ${device.order} FROM environment_locations l CROSS JOIN environment_sources s WHERE l.slug = ${sql(device.location)} AND s.slug = ${sql(device.source)} ON CONFLICT (slug) DO UPDATE SET location_id = EXCLUDED.location_id, source_id = EXCLUDED.source_id, name_zh = EXCLUDED.name_zh, name_en = EXCLUDED.name_en, name_ja = EXCLUDED.name_ja, placement = EXCLUDED.placement, enabled = EXCLUDED.enabled, display_order = EXCLUDED.display_order;`
    );
    for (const metric of [...device.metrics].sort((a, b) =>
      a.key.localeCompare(b.key)
    )) {
      lines.push(
        `INSERT INTO environment_device_metrics (device_id, metric_key, enabled, display_order, show_aqi) SELECT id, ${sql(metric.key)}, ${metric.enabled}, ${metric.order}, ${Boolean(metric.showAqi)} FROM environment_devices WHERE slug = ${sql(device.slug)} ON CONFLICT (device_id, metric_key) DO UPDATE SET enabled = EXCLUDED.enabled, display_order = EXCLUDED.display_order, show_aqi = EXCLUDED.show_aqi;`
      );
    }
  }

  for (const location of configuration.locations.filter(
    (candidate) => candidate.comparison
  )) {
    lines.push(
      `INSERT INTO environment_location_comparisons (location_id, indoor_device_id, outdoor_device_id) SELECT l.id, i.id, o.id FROM environment_locations l CROSS JOIN environment_devices i CROSS JOIN environment_devices o WHERE l.slug = ${sql(location.slug)} AND i.slug = ${sql(location.comparison!.indoorDevice)} AND o.slug = ${sql(location.comparison!.outdoorDevice)} ON CONFLICT (location_id) DO UPDATE SET indoor_device_id = EXCLUDED.indoor_device_id, outdoor_device_id = EXCLUDED.outdoor_device_id;`
    );
  }

  lines.push("COMMIT;", "");
  return lines.join("\n");
}

function setClipboard(secret: string) {
  const commands =
    process.platform === "win32"
      ? [["clip.exe", []]]
      : process.platform === "darwin"
        ? [["pbcopy", []]]
        : [
            ["wl-copy", []],
            ["xclip", ["-selection", "clipboard"]],
          ];

  for (const [command, args] of commands as Array<[string, string[]]>) {
    const result = spawnSync(command, args, {
      input: secret,
      encoding: "utf8",
      windowsHide: true,
    });
    if (result.status === 0) return;
  }
  throw new Error("CLIPBOARD_UNAVAILABLE");
}

function generateToken(sourceSlug: string) {
  validateEnvironmentConfiguration(environmentConfiguration);
  if (!environmentConfiguration.sources.some((source) => source.slug === sourceSlug)) {
    throw new Error("UNKNOWN_SOURCE");
  }
  const token = randomBytes(32).toString("base64url");
  setClipboard(token);
  const digest = createHash("sha256").update(token).digest("hex");
  process.stdout.write(
    `Source: ${sourceSlug}\nSHA-256 digest: ${digest}\nThe plaintext token is in your clipboard. Store it in the source now; it will not be printed.\n`
  );
}

function generateMigration() {
  const directory = join(process.cwd(), "supabase", "migrations");
  const content = renderEnvironmentConfigurationSql(environmentConfiguration);
  const names = readdirSync(directory);
  const fingerprint = createHash("sha256").update(content).digest("hex").slice(0, 12);
  const existing = names.find((name) => name.endsWith(`_environment_configuration_${fingerprint}.sql`));
  if (existing) {
    process.stdout.write(`Configuration migration already exists: ${join(directory, existing)}\n`);
    return;
  }
  const nextNumber = Math.max(0, ...names.map((name) => Number.parseInt(name.slice(0, 3), 10)).filter(Number.isFinite)) + 1;
  const fileName = `${String(nextNumber).padStart(3, "0")}_environment_configuration_${fingerprint}.sql`;
  const path = join(directory, fileName);
  if (existsSync(path)) throw new Error("MIGRATION_ALREADY_EXISTS");
  writeFileSync(path, content, { encoding: "utf8", flag: "wx" });
  process.stdout.write(`Generated ${path}\n`);
}

const command = process.argv[2];
if (command === "validate") {
  validateEnvironmentConfiguration(environmentConfiguration);
  process.stdout.write("Environment configuration is valid.\n");
} else if (command === "generate-migration") {
  generateMigration();
} else if (command === "generate-token") {
  const sourceSlug = process.argv[3];
  if (!sourceSlug) throw new Error("SOURCE_SLUG_REQUIRED");
  generateToken(sourceSlug);
} else if (command) {
  throw new Error("UNKNOWN_COMMAND");
}
