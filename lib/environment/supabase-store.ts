import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  EnvironmentReadingRepository,
  EnvironmentReadingWrite,
} from "@/lib/environment/store";
import { createAdminSupabase } from "@/lib/supabase/server";
import { tenMinuteBucket } from "@/lib/environment/v2/store";
import type { Database } from "@/types/supabase";
import type { EnvironmentRole } from "@/types/environment";
import type { EnvironmentMetricKey } from "@/types/environment-v2";

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

class EnvironmentSupabaseError extends Error {
  constructor() {
    super("ENVIRONMENT_REPOSITORY_UNAVAILABLE");
    this.name = "EnvironmentSupabaseError";
  }
}

export class SupabaseEnvironmentReadingRepository
  implements EnvironmentReadingRepository
{
  constructor(private readonly supabase: SupabaseClient<EnvironmentDatabase>) {}

  async loadSensors(locationSlug: string) {
    const { data: location, error: locationError } = await this.supabase
      .from("environment_locations")
      .select("id")
      .eq("slug", locationSlug)
      .eq("enabled", true)
      .maybeSingle();

    if (locationError) throw new EnvironmentSupabaseError();
    if (!location) return new Map<EnvironmentRole, string>();

    const { data: sensors, error: sensorError } = await this.supabase
      .from("environment_devices")
      .select("id, placement")
      .eq("location_id", location.id)
      .eq("enabled", true)
      .in("placement", ["indoor", "outdoor"])
      .in("slug", ["home-indoor", "home-outdoor"]);

    if (sensorError) throw new EnvironmentSupabaseError();
    return new Map(
      (sensors ?? []).map((sensor) => [sensor.placement as EnvironmentRole, sensor.id] as const)
    );
  }

  async writeReading(value: EnvironmentReadingWrite) {
    const { data: metrics, error: metricError } = await this.supabase
      .from("environment_device_metrics")
      .select("id, metric_key")
      .eq("device_id", value.sensorId)
      .eq("enabled", true)
      .in("metric_key", ["temperatureC", "humidityPercent", "batteryPercent"]);
    if (metricError) throw new EnvironmentSupabaseError();

    const values: Partial<Record<EnvironmentMetricKey, number | null>> = {
      temperatureC: value.temperatureC,
      humidityPercent: value.humidityPercent,
      batteryPercent: value.batteryPercent,
    };
    const expected = value.batteryPercent === null ? 2 : 3;
    const available = (metrics ?? []).filter((metric) => values[metric.metric_key] !== null);
    if (available.length !== expected) throw new EnvironmentSupabaseError();
    const bucket = tenMinuteBucket(new Date(value.collectedAt));
    const writes = await Promise.all(
      available.map(async (metric) => {
        const { data, error } = await this.supabase
          .from("environment_metric_readings")
          .upsert(
            {
              metric_id: metric.id,
              value: values[metric.metric_key] as number,
              source_updated_at: value.sourceUpdatedAt,
              collected_at: value.collectedAt,
              ten_minute_bucket: bucket,
              idempotency_key: `${value.idempotencyKey}:${metric.metric_key}`,
            },
            {
              onConflict: "metric_id,ten_minute_bucket",
              ignoreDuplicates: true,
            }
          )
          .select("id")
          .maybeSingle();
        if (error) throw new EnvironmentSupabaseError();
        return Boolean(data);
      })
    );
    return writes.some(Boolean) ? "stored" : "duplicate";
  }
}

export function createEnvironmentReadingRepository() {
  const client =
    createAdminSupabase() as unknown as SupabaseClient<EnvironmentDatabase>;
  return new SupabaseEnvironmentReadingRepository(client);
}
