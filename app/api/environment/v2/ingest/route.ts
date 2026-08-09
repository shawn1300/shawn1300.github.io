import { createEnvironmentIngestHandlerV2 } from "@/lib/environment/v2/ingest-handler";
import { createEnvironmentRepositoryV2 } from "@/lib/environment/v2/supabase-store";
import { storeEnvironmentReadingsV2 } from "@/lib/environment/v2/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export const POST = createEnvironmentIngestHandlerV2({
  authenticate(digest) {
    return createEnvironmentRepositoryV2().authenticate(digest);
  },
  store(source, payload, receivedAt) {
    return storeEnvironmentReadingsV2(
      source.id,
      payload,
      createEnvironmentRepositoryV2(),
      receivedAt
    );
  },
  log(event) {
    console.info("Environment v2 ingest", event);
  },
});
