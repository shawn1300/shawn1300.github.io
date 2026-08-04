import { createEnvironmentIngestHandler } from "@/lib/environment/handler";
import { createEnvironmentReadingRepository } from "@/lib/environment/supabase-store";
import { storeEnvironmentReadings } from "@/lib/environment/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export const POST = createEnvironmentIngestHandler({
  getExpectedToken: () => process.env.ENVIRONMENT_INGEST_TOKEN,
  async store(payload, receivedAt) {
    return storeEnvironmentReadings(
      payload,
      createEnvironmentReadingRepository(),
      receivedAt
    );
  },
  log(event) {
    console.info("Environment ingest", event);
  },
});

