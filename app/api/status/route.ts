import { StatusConfigError } from "@/lib/status/config";
import { getStatusSnapshot } from "@/lib/status/komari";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

function unavailable(code: string) {
  return Response.json(
    { success: false, code },
    { status: 503, headers: { "cache-control": "no-store" } }
  );
}

export async function GET() {
  try {
    const snapshot = await getStatusSnapshot();
    return Response.json(snapshot, {
      headers: {
        "cache-control": "public, max-age=0, s-maxage=10, stale-while-revalidate=20",
      },
    });
  } catch (error) {
    const code = error instanceof StatusConfigError ? error.code : "STATUS_SERVICE_UNAVAILABLE";
    console.warn("Status snapshot unavailable", { code });
    return unavailable(code);
  }
}
