import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sourceAuditReference } from "@/lib/environment/v2/auth";
import type {
  EnvironmentDeviceMappingV2,
  EnvironmentIngestRepositoryV2,
  EnvironmentMetricWriteV2,
} from "@/lib/environment/v2/store";
import { createAdminSupabase } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";
import type { EnvironmentMetricKey } from "@/types/environment-v2";

type EnvironmentDatabaseV2 = {
  public: {
    Tables: Pick<
      Database["public"]["Tables"],
      | "environment_sources"
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

class EnvironmentRepositoryErrorV2 extends Error {
  constructor() {
    super("ENVIRONMENT_V2_REPOSITORY_UNAVAILABLE");
    this.name = "EnvironmentRepositoryErrorV2";
  }
}

export class SupabaseEnvironmentRepositoryV2
  implements EnvironmentIngestRepositoryV2
{
  constructor(private readonly supabase: SupabaseClient<EnvironmentDatabaseV2>) {}

  async authenticate(digest: string) {
    const { data, error } = await this.supabase
      .from("environment_sources")
      .select("id")
      .eq("token_digest", digest)
      .eq("enabled", true)
      .maybeSingle();
    if (error) throw new EnvironmentRepositoryErrorV2();
    return data ? { id: data.id, auditRef: sourceAuditReference(data.id) } : null;
  }

  async loadDeviceMappings(sourceId: string, devices: string[]) {
    if (devices.length === 0) return new Map<string, EnvironmentDeviceMappingV2>();
    const { data: rows, error } = await this.supabase
      .from("environment_devices")
      .select("id, slug")
      .eq("source_id", sourceId)
      .eq("enabled", true)
      .in("slug", devices);
    if (error) throw new EnvironmentRepositoryErrorV2();
    const deviceRows = rows ?? [];
    if (deviceRows.length === 0) return new Map<string, EnvironmentDeviceMappingV2>();
    const { data: metrics, error: metricError } = await this.supabase
      .from("environment_device_metrics")
      .select("id, device_id, metric_key")
      .in("device_id", deviceRows.map((device) => device.id))
      .eq("enabled", true);
    if (metricError) throw new EnvironmentRepositoryErrorV2();
    const byId = new Map(deviceRows.map((device) => [device.id, device]));
    const result = new Map<string, EnvironmentDeviceMappingV2>();
    for (const row of deviceRows) result.set(row.slug, { device: row.slug, metrics: new Map() });
    for (const metric of metrics ?? []) {
      const device = byId.get(metric.device_id);
      if (device) result.get(device.slug)?.metrics.set(metric.metric_key as EnvironmentMetricKey, metric.id);
    }
    return result;
  }

  async writeMetric(value: EnvironmentMetricWriteV2) {
    const { data, error } = await this.supabase
      .from("environment_metric_readings")
      .upsert(
        {
          metric_id: value.metricId,
          value: value.value,
          source_updated_at: value.sourceUpdatedAt,
          collected_at: value.collectedAt,
          ten_minute_bucket: value.tenMinuteBucket,
          idempotency_key: value.idempotencyKey,
        },
        { onConflict: "metric_id,ten_minute_bucket", ignoreDuplicates: true }
      )
      .select("id")
      .maybeSingle();
    if (error) throw new EnvironmentRepositoryErrorV2();
    return data ? "stored" as const : "duplicate" as const;
  }
}

export function createEnvironmentRepositoryV2() {
  return new SupabaseEnvironmentRepositoryV2(
    createAdminSupabase() as unknown as SupabaseClient<EnvironmentDatabaseV2>
  );
}
