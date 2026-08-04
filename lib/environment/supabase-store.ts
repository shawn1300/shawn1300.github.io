import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  EnvironmentReadingRepository,
  EnvironmentReadingWrite,
} from "@/lib/environment/store";
import { createAdminSupabase } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";
import type { EnvironmentRole } from "@/types/environment";

type EnvironmentDatabase = {
  public: {
    Tables: Pick<
      Database["public"]["Tables"],
      | "environment_locations"
      | "environment_sensors"
      | "environment_readings"
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
      .from("environment_sensors")
      .select("id, role")
      .eq("location_id", location.id)
      .eq("enabled", true)
      .in("role", ["indoor", "outdoor"]);

    if (sensorError) throw new EnvironmentSupabaseError();
    return new Map(
      (sensors ?? []).map((sensor) => [sensor.role, sensor.id] as const)
    );
  }

  async writeReading(value: EnvironmentReadingWrite) {
    const { data, error } = await this.supabase
      .from("environment_readings")
      .upsert(
        {
          sensor_id: value.sensorId,
          temperature_c: value.temperatureC,
          humidity_percent: value.humidityPercent,
          battery_percent: value.batteryPercent,
          source_updated_at: value.sourceUpdatedAt,
          collected_at: value.collectedAt,
          idempotency_key: value.idempotencyKey,
        },
        {
          onConflict: "sensor_id,idempotency_key",
          ignoreDuplicates: true,
        }
      )
      .select("id")
      .maybeSingle();

    if (error) throw new EnvironmentSupabaseError();
    return data ? "stored" : "duplicate";
  }
}

export function createEnvironmentReadingRepository() {
  const client =
    createAdminSupabase() as unknown as SupabaseClient<EnvironmentDatabase>;
  return new SupabaseEnvironmentReadingRepository(client);
}
