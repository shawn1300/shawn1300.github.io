import { createEnvironmentHistoryHandler } from "@/lib/environment/public-handler";
import { createEnvironmentPublicService } from "@/lib/environment/public";
import { createEnvironmentPublicRepository } from "@/lib/environment/supabase-public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export const GET = createEnvironmentHistoryHandler({
  async getHistory(location, range) {
    return createEnvironmentPublicService(
      createEnvironmentPublicRepository()
    ).history(location, range);
  },
  log(event) {
    console.info("Environment history", event);
  },
});

