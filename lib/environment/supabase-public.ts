import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  EnvironmentPublicRepository,
  EnvironmentRepositoryLocation,
  EnvironmentRepositoryReading,
} from "@/lib/environment/public";
import { createAdminSupabase } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";
import type { EnvironmentRole } from "@/types/environment";

type EnvironmentDatabase = {
  public: {
    Tables: Pick<
      Database["public"]["Tables"],
      | "environment_locations"
      | "environment_devices"
      | "environment_device_metrics"
      | "environment_metric_readings"
    >;
    Views: Record<string, never>;
    Functions: Database["public"]["Functions"];
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

const MAX_HISTORY_READINGS_PER_ROLE = 1_100;

class EnvironmentPublicRepositoryError extends Error {
  constructor() {
    super("ENVIRONMENT_PUBLIC_REPOSITORY_UNAVAILABLE");
    this.name = "EnvironmentPublicRepositoryError";
  }
}

interface EnabledSensor {
  id: string;
  role: EnvironmentRole;
}

export class SupabaseEnvironmentPublicRepository
  implements EnvironmentPublicRepository
{
  constructor(private readonly supabase: SupabaseClient<EnvironmentDatabase>) {}

  async findEnabledLocation(
    slug: string
  ): Promise<EnvironmentRepositoryLocation | null> {
    const { data, error } = await this.supabase
      .from("environment_locations")
      .select("id, slug, name_zh, name_en, name_ja, timezone")
      .eq("slug", slug)
      .eq("enabled", true)
      .maybeSingle();

    if (error) throw new EnvironmentPublicRepositoryError();
    if (!data) return null;
    if (data.timezone !== "Australia/Perth") {
      throw new EnvironmentPublicRepositoryError();
    }
    return {
      id: data.id,
      slug: data.slug,
      name: { zh: data.name_zh, en: data.name_en, ja: data.name_ja },
      timezone: data.timezone,
    };
  }

  private async findEnabledSensors(locationId: string) {
    const { data, error } = await this.supabase
      .from("environment_devices")
      .select("id, placement")
      .eq("location_id", locationId)
      .eq("enabled", true)
      .in("placement", ["indoor", "outdoor"])
      .in("slug", ["home-indoor", "home-outdoor"]);

    if (error) throw new EnvironmentPublicRepositoryError();
    return (data ?? []).map((device) => ({
      id: device.id,
      role: device.placement as EnvironmentRole,
    }));
  }

  private readingFromMetrics(
    sensor: EnabledSensor,
    values: Map<string, { value: number; sourceUpdatedAt: string }>
  ): EnvironmentRepositoryReading | null {
    const temperature = values.get("temperatureC");
    const humidity = values.get("humidityPercent");
    if (!temperature || !humidity) return null;
    const battery = values.get("batteryPercent");
    return {
      role: sensor.role,
      temperatureC: Number(temperature.value),
      humidityPercent: Number(humidity.value),
      batteryPercent: battery ? Number(battery.value) : null,
      sourceUpdatedAt:
        [temperature.sourceUpdatedAt, humidity.sourceUpdatedAt, battery?.sourceUpdatedAt]
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) ?? temperature.sourceUpdatedAt,
    };
  }

  private async metricsForSensors(sensors: EnabledSensor[]) {
    if (sensors.length === 0) return [];
    const { data, error } = await this.supabase
      .from("environment_device_metrics")
      .select("id, device_id, metric_key")
      .in("device_id", sensors.map((sensor) => sensor.id))
      .eq("enabled", true)
      .in("metric_key", ["temperatureC", "humidityPercent", "batteryPercent"]);
    if (error) throw new EnvironmentPublicRepositoryError();
    return data ?? [];
  }

  async findLatestReadings(locationId: string) {
    const sensors = await this.findEnabledSensors(locationId);
    const metrics = await this.metricsForSensors(sensors);
    const results = await Promise.all(
      sensors.map(async (sensor) => {
        const sensorMetrics = metrics.filter((metric) => metric.device_id === sensor.id);
        const rows = await Promise.all(sensorMetrics.map(async (metric) => {
          const { data, error } = await this.supabase
            .from("environment_metric_readings")
            .select("value, source_updated_at")
            .eq("metric_id", metric.id)
            .order("source_updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) throw new EnvironmentPublicRepositoryError();
          return data ? [metric.metric_key, { value: Number(data.value), sourceUpdatedAt: data.source_updated_at }] as const : null;
        }));
        return this.readingFromMetrics(sensor, new Map(rows.filter((row): row is NonNullable<typeof row> => row !== null)));
      })
    );
    return results.filter(
      (reading): reading is EnvironmentRepositoryReading => reading !== null
    );
  }

  async findReadingsSince(locationId: string, since: Date) {
    const sensors = await this.findEnabledSensors(locationId);
    const metrics = await this.metricsForSensors(sensors);
    const results = await Promise.all(
      sensors.map(async (sensor) => {
        const sensorMetrics = metrics.filter((metric) => metric.device_id === sensor.id);
        if (sensorMetrics.length === 0) return [];
        const { data, error } = await this.supabase
          .from("environment_metric_readings")
          .select("metric_id, value, source_updated_at")
          .in("metric_id", sensorMetrics.map((metric) => metric.id))
          .gte("source_updated_at", since.toISOString())
          // 降序取最新一批，避免超出上限时丢掉最新读数；
          // 取回后反转回升序（领域层会再排序，这里保持输出整洁）
          .order("source_updated_at", { ascending: false })
          .limit(MAX_HISTORY_READINGS_PER_ROLE * 3);

        if (error) throw new EnvironmentPublicRepositoryError();
        const keyById = new Map(sensorMetrics.map((metric) => [metric.id, metric.metric_key]));
        const grouped = new Map<string, Map<string, { value: number; sourceUpdatedAt: string }>>();
        for (const row of (data ?? []).reverse()) {
          const key = keyById.get(row.metric_id);
          if (!key) continue;
          const group = grouped.get(row.source_updated_at) ?? new Map();
          group.set(key, { value: Number(row.value), sourceUpdatedAt: row.source_updated_at });
          grouped.set(row.source_updated_at, group);
        }
        return [...grouped.values()].flatMap((values) => {
          const reading = this.readingFromMetrics(sensor, values);
          return reading ? [reading] : [];
        });
      })
    );
    return results.flat();
  }
}

export function createEnvironmentPublicRepository() {
  const client =
    createAdminSupabase() as unknown as SupabaseClient<EnvironmentDatabase>;
  return new SupabaseEnvironmentPublicRepository(client);
}
