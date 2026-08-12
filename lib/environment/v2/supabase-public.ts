import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  EnvironmentPublicRepositoryV2,
  EnvironmentRepositoryMetricReadingV2,
} from "@/lib/environment/v2/public";
import { readEnvironmentHistoryPagesV2 } from "@/lib/environment/v2/pagination";
import { createAdminSupabase } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

type EnvironmentDatabaseV2 = {
  public: {
    Tables: Pick<Database["public"]["Tables"],
      | "environment_locations" | "environment_devices" | "environment_device_metrics"
      | "environment_metric_readings" | "environment_location_comparisons">;
    Views: Record<string, never>;
    Functions: Database["public"]["Functions"];
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

class EnvironmentPublicRepositoryErrorV2 extends Error {
  constructor() {
    super("ENVIRONMENT_V2_PUBLIC_REPOSITORY_UNAVAILABLE");
    this.name = "EnvironmentPublicRepositoryErrorV2";
  }
}

export class SupabaseEnvironmentPublicRepositoryV2 implements EnvironmentPublicRepositoryV2 {
  constructor(private readonly supabase: SupabaseClient<EnvironmentDatabaseV2>) {}

  private location(row: Database["public"]["Tables"]["environment_locations"]["Row"]) {
    return {
      id: row.id, slug: row.slug,
      name: { zh: row.name_zh, en: row.name_en, ja: row.name_ja },
      timezone: row.timezone, order: row.display_order,
    };
  }

  async listPublicLocations() {
    const { data, error } = await this.supabase.from("environment_locations")
      .select("id, slug, name_zh, name_en, name_ja, timezone, display_order, enabled, public_enabled, created_at, updated_at")
      .eq("enabled", true).eq("public_enabled", true)
      .order("display_order").order("slug");
    if (error) throw new EnvironmentPublicRepositoryErrorV2();
    return (data ?? []).map((row) => this.location(row));
  }

  async findPublicLocation(slug: string) {
    const { data, error } = await this.supabase.from("environment_locations")
      .select("id, slug, name_zh, name_en, name_ja, timezone, display_order, enabled, public_enabled, created_at, updated_at")
      .eq("slug", slug).eq("enabled", true).eq("public_enabled", true).maybeSingle();
    if (error) throw new EnvironmentPublicRepositoryErrorV2();
    return data ? this.location(data) : null;
  }

  async findDevices(locationId: string) {
    const { data, error } = await this.supabase.from("environment_devices")
      .select("id, slug, name_zh, name_en, name_ja, placement, display_order")
      .eq("location_id", locationId).eq("enabled", true).order("display_order").order("slug");
    if (error) throw new EnvironmentPublicRepositoryErrorV2();
    return (data ?? []).map((row) => ({
      id: row.id, slug: row.slug, name: { zh: row.name_zh, en: row.name_en, ja: row.name_ja },
      placement: row.placement, order: row.display_order,
    }));
  }

  async findMetrics(deviceIds: string[]) {
    if (deviceIds.length === 0) return [];
    const { data, error } = await this.supabase.from("environment_device_metrics")
      .select("id, device_id, metric_key, display_order, show_aqi")
      .in("device_id", deviceIds).eq("enabled", true).order("display_order").order("metric_key");
    if (error) throw new EnvironmentPublicRepositoryErrorV2();
    return (data ?? []).map((row) => ({ id: row.id, deviceId: row.device_id, key: row.metric_key, order: row.display_order, showAqi: row.show_aqi }));
  }

  async findComparison(locationId: string) {
    const { data, error } = await this.supabase.from("environment_location_comparisons")
      .select("indoor_device_id, outdoor_device_id").eq("location_id", locationId).maybeSingle();
    if (error) throw new EnvironmentPublicRepositoryErrorV2();
    return data ? { indoorDeviceId: data.indoor_device_id, outdoorDeviceId: data.outdoor_device_id } : null;
  }

  private reading(row: { metric_id: string; value: number; source_updated_at: string }): EnvironmentRepositoryMetricReadingV2 {
    return { metricId: row.metric_id, value: Number(row.value), sourceUpdatedAt: row.source_updated_at };
  }

  async findLatestReadings(metricIds: string[]) {
    const results = await Promise.all(metricIds.map(async (metricId) => {
      const { data, error } = await this.supabase.from("environment_metric_readings")
        .select("metric_id, value, source_updated_at").eq("metric_id", metricId)
        .order("source_updated_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw new EnvironmentPublicRepositoryErrorV2();
      return data ? this.reading(data) : null;
    }));
    return results.filter((value): value is EnvironmentRepositoryMetricReadingV2 => value !== null);
  }

  async findReadingsSince(metricIds: string[], since: Date) {
    if (metricIds.length === 0) return [];
    const rows = await readEnvironmentHistoryPagesV2(async (from, to) => {
      const { data, error } = await this.supabase.from("environment_metric_readings")
        .select("id, metric_id, value, source_updated_at").in("metric_id", metricIds)
        .gte("source_updated_at", since.toISOString())
        .order("source_updated_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);
      if (error) throw new EnvironmentPublicRepositoryErrorV2();
      return data ?? [];
    });
    return rows.reverse().map((row) => this.reading(row));
  }
}

export function createEnvironmentPublicRepositoryV2() {
  return new SupabaseEnvironmentPublicRepositoryV2(
    createAdminSupabase() as unknown as SupabaseClient<EnvironmentDatabaseV2>
  );
}
