import { createEnvironmentLatestHandler } from "@/lib/environment/public-handler";
import { createEnvironmentPublicService } from "@/lib/environment/public";
import { createEnvironmentPublicRepository } from "@/lib/environment/supabase-public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export const GET = createEnvironmentLatestHandler({
  async getLatest(location) {
    return createEnvironmentPublicService(
      createEnvironmentPublicRepository()
    ).latest(location);
  },
  log(event) {
    console.info("Environment latest", event);
  },
});

