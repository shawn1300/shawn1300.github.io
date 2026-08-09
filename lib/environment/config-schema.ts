import { isEnvironmentMetricKey } from "@/lib/environment/v2/metrics";
import type {
  EnvironmentDevicePlacement,
  EnvironmentMetricKey,
  EnvironmentSourceType,
} from "@/types/environment-v2";
import type { EnvironmentLocalizedName } from "@/types/environment";

export interface EnvironmentLocationConfiguration {
  slug: string;
  name: EnvironmentLocalizedName;
  timezone: string;
  public: boolean;
  enabled: boolean;
  order: number;
  comparison?: {
    indoorDevice: string;
    outdoorDevice: string;
  };
}

export interface EnvironmentSourceConfiguration {
  slug: string;
  name: string;
  type: EnvironmentSourceType;
  enabled: boolean;
}

export interface EnvironmentDeviceConfiguration {
  slug: string;
  location: string;
  source: string;
  name: EnvironmentLocalizedName;
  placement: EnvironmentDevicePlacement;
  enabled: boolean;
  order: number;
  metrics: Array<{
    key: EnvironmentMetricKey;
    enabled: boolean;
    order: number;
    showAqi?: boolean;
  }>;
}

export interface EnvironmentConfiguration {
  locations: EnvironmentLocationConfiguration[];
  sources: EnvironmentSourceConfiguration[];
  devices: EnvironmentDeviceConfiguration[];
}

export type EnvironmentConfigurationErrorCode =
  | "INVALID_SLUG"
  | "DUPLICATE_SLUG"
  | "INVALID_LOCALIZED_NAME"
  | "INVALID_TIMEZONE"
  | "INVALID_ORDER"
  | "INVALID_SOURCE_TYPE"
  | "INVALID_PLACEMENT"
  | "UNKNOWN_LOCATION"
  | "UNKNOWN_SOURCE"
  | "INVALID_METRIC"
  | "DUPLICATE_METRIC"
  | "INVALID_AQI_METRIC"
  | "INVALID_COMPARISON";

export class EnvironmentConfigurationError extends Error {
  constructor(
    readonly code: EnvironmentConfigurationErrorCode,
    readonly path: string
  ) {
    super(`${code}:${path}`);
    this.name = "EnvironmentConfigurationError";
  }
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SOURCE_TYPES = new Set<EnvironmentSourceType>([
  "home_assistant",
  "esp32",
]);
const PLACEMENTS = new Set<EnvironmentDevicePlacement>([
  "indoor",
  "outdoor",
  "other",
]);

function requireSlug(value: string, path: string) {
  if (!SLUG.test(value)) {
    throw new EnvironmentConfigurationError("INVALID_SLUG", path);
  }
}

function requireOrder(value: number, path: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new EnvironmentConfigurationError("INVALID_ORDER", path);
  }
}

function requireLocalizedName(value: EnvironmentLocalizedName, path: string) {
  for (const locale of ["zh", "en", "ja"] as const) {
    if (typeof value?.[locale] !== "string" || !value[locale].trim()) {
      throw new EnvironmentConfigurationError(
        "INVALID_LOCALIZED_NAME",
        `${path}.${locale}`
      );
    }
  }
}

function requireTimezone(value: string, path: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
  } catch {
    throw new EnvironmentConfigurationError("INVALID_TIMEZONE", path);
  }
}

function uniqueSlugSet(values: Array<{ slug: string }>, path: string) {
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    requireSlug(value.slug, `${path}[${index}].slug`);
    if (seen.has(value.slug)) {
      throw new EnvironmentConfigurationError(
        "DUPLICATE_SLUG",
        `${path}[${index}].slug`
      );
    }
    seen.add(value.slug);
  }
  return seen;
}

export function validateEnvironmentConfiguration(
  configuration: EnvironmentConfiguration
): EnvironmentConfiguration {
  const locations = uniqueSlugSet(configuration.locations, "locations");
  const sources = uniqueSlugSet(configuration.sources, "sources");
  const devices = uniqueSlugSet(configuration.devices, "devices");

  for (const [index, location] of configuration.locations.entries()) {
    requireLocalizedName(location.name, `locations[${index}].name`);
    requireTimezone(location.timezone, `locations[${index}].timezone`);
    requireOrder(location.order, `locations[${index}].order`);
  }

  for (const [index, source] of configuration.sources.entries()) {
    if (!SOURCE_TYPES.has(source.type)) {
      throw new EnvironmentConfigurationError(
        "INVALID_SOURCE_TYPE",
        `sources[${index}].type`
      );
    }
  }

  const deviceBySlug = new Map(
    configuration.devices.map((device) => [device.slug, device])
  );
  for (const [index, device] of configuration.devices.entries()) {
    if (!locations.has(device.location)) {
      throw new EnvironmentConfigurationError(
        "UNKNOWN_LOCATION",
        `devices[${index}].location`
      );
    }
    if (!sources.has(device.source)) {
      throw new EnvironmentConfigurationError(
        "UNKNOWN_SOURCE",
        `devices[${index}].source`
      );
    }
    if (!PLACEMENTS.has(device.placement)) {
      throw new EnvironmentConfigurationError(
        "INVALID_PLACEMENT",
        `devices[${index}].placement`
      );
    }
    requireLocalizedName(device.name, `devices[${index}].name`);
    requireOrder(device.order, `devices[${index}].order`);

    const metricKeys = new Set<EnvironmentMetricKey>();
    for (const [metricIndex, metric] of device.metrics.entries()) {
      const path = `devices[${index}].metrics[${metricIndex}]`;
      if (!isEnvironmentMetricKey(metric.key)) {
        throw new EnvironmentConfigurationError("INVALID_METRIC", `${path}.key`);
      }
      if (metricKeys.has(metric.key)) {
        throw new EnvironmentConfigurationError(
          "DUPLICATE_METRIC",
          `${path}.key`
        );
      }
      if (metric.showAqi && metric.key !== "pm25UgM3") {
        throw new EnvironmentConfigurationError(
          "INVALID_AQI_METRIC",
          `${path}.showAqi`
        );
      }
      requireOrder(metric.order, `${path}.order`);
      metricKeys.add(metric.key);
    }
  }

  for (const [index, location] of configuration.locations.entries()) {
    if (!location.comparison) continue;
    const indoor = deviceBySlug.get(location.comparison.indoorDevice);
    const outdoor = deviceBySlug.get(location.comparison.outdoorDevice);
    const comparable = (device: EnvironmentDeviceConfiguration | undefined) => {
      const enabledMetrics = new Set(
        device?.metrics
          .filter((metric) => metric.enabled)
          .map((metric) => metric.key)
      );
      return Boolean(
        device?.enabled &&
          device.location === location.slug &&
          enabledMetrics.has("temperatureC") &&
          enabledMetrics.has("humidityPercent")
      );
    };
    if (
      !devices.has(location.comparison.indoorDevice) ||
      !devices.has(location.comparison.outdoorDevice) ||
      indoor?.placement !== "indoor" ||
      outdoor?.placement !== "outdoor" ||
      !comparable(indoor) ||
      !comparable(outdoor)
    ) {
      throw new EnvironmentConfigurationError(
        "INVALID_COMPARISON",
        `locations[${index}].comparison`
      );
    }
  }

  return configuration;
}
