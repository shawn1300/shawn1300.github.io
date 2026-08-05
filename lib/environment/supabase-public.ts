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
      | "environment_sensors"
      | "environment_readings"
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
      .from("environment_sensors")
      .select("id, role")
      .eq("location_id", locationId)
      .eq("enabled", true)
      .in("role", ["indoor", "outdoor"]);

    if (error) throw new EnvironmentPublicRepositoryError();
    return (data ?? []) as EnabledSensor[];
  }

  private reading(
    sensor: EnabledSensor,
    value: {
      temperature_c: number;
      humidity_percent: number;
      battery_percent: number | null;
      source_updated_at: string;
    }
  ): EnvironmentRepositoryReading {
    return {
      role: sensor.role,
      temperatureC: Number(value.temperature_c),
      humidityPercent: Number(value.humidity_percent),
      batteryPercent:
        value.battery_percent === null ? null : Number(value.battery_percent),
      sourceUpdatedAt: value.source_updated_at,
    };
  }

  async findLatestReadings(locationId: string) {
    const sensors = await this.findEnabledSensors(locationId);
    const results = await Promise.all(
      sensors.map(async (sensor) => {
        const { data, error } = await this.supabase
          .from("environment_readings")
          .select(
            "temperature_c, humidity_percent, battery_percent, source_updated_at"
          )
          .eq("sensor_id", sensor.id)
          .order("source_updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw new EnvironmentPublicRepositoryError();
        return data ? this.reading(sensor, data) : null;
      })
    );
    return results.filter(
      (reading): reading is EnvironmentRepositoryReading => reading !== null
    );
  }

  async findReadingsSince(locationId: string, since: Date) {
    const sensors = await this.findEnabledSensors(locationId);
    const results = await Promise.all(
      sensors.map(async (sensor) => {
        const { data, error } = await this.supabase
          .from("environment_readings")
          .select(
            "temperature_c, humidity_percent, battery_percent, source_updated_at"
          )
          .eq("sensor_id", sensor.id)
          .gte("source_updated_at", since.toISOString())
          // 降序取最新一批，避免超出上限时丢掉最新读数；
          // 取回后反转回升序（领域层会再排序，这里保持输出整洁）
          .order("source_updated_at", { ascending: false })
          .limit(MAX_HISTORY_READINGS_PER_ROLE);

        if (error) throw new EnvironmentPublicRepositoryError();
        return (data ?? []).reverse().map((value) => this.reading(sensor, value));
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

