import { isEnvironmentPublicSlug } from "@/lib/environment/v2/metrics";
import type { EnvironmentHistoryRange } from "@/types/environment";
import type { EnvironmentHistoryResponseV2, EnvironmentLatestResponseV2, EnvironmentLocationSummaryV2 } from "@/types/environment-v2";

function json(body: unknown, status: number, cache = "no-store") {
  return new Response(JSON.stringify(body), { status, headers: {
    "content-type": "application/json; charset=utf-8", "cache-control": cache,
  } });
}
function error(code: "INVALID_REQUEST" | "LOCATION_NOT_FOUND" | "SERVICE_UNAVAILABLE", status: number) {
  return json({ success: false, code }, status);
}
export function createEnvironmentLocationsHandlerV2(dependencies: { list(): Promise<EnvironmentLocationSummaryV2[]> }) {
  return async () => {
    try {
      return json(await dependencies.list(), 200, "public, max-age=0, s-maxage=60, stale-while-revalidate=60");
    } catch { return error("SERVICE_UNAVAILABLE", 503); }
  };
}
export function createEnvironmentLatestHandlerV2(dependencies: { latest(slug: string): Promise<EnvironmentLatestResponseV2 | null> }) {
  return async (_request: Request, context: { params: Promise<{ slug: string }> }) => {
    const { slug } = await context.params;
    if (!isEnvironmentPublicSlug(slug)) return error("INVALID_REQUEST", 400);
    try {
      const value = await dependencies.latest(slug);
      return value ? json(value, 200, "public, max-age=0, s-maxage=60, stale-while-revalidate=60") : error("LOCATION_NOT_FOUND", 404);
    } catch { return error("SERVICE_UNAVAILABLE", 503); }
  };
}
export function createEnvironmentHistoryHandlerV2(dependencies: { history(slug: string, range: EnvironmentHistoryRange): Promise<EnvironmentHistoryResponseV2 | null> }) {
  return async (request: Request, context: { params: Promise<{ slug: string }> }) => {
    const { slug } = await context.params;
    const values = new URL(request.url).searchParams.getAll("range");
    const range = values.length === 1 ? values[0] : null;
    if (!isEnvironmentPublicSlug(slug) || (range !== "24h" && range !== "7d")) return error("INVALID_REQUEST", 400);
    try {
      const value = await dependencies.history(slug, range);
      return value ? json(value, 200, "public, max-age=0, s-maxage=300, stale-while-revalidate=300") : error("LOCATION_NOT_FOUND", 404);
    } catch { return error("SERVICE_UNAVAILABLE", 503); }
  };
}
