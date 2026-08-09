import { createEnvironmentPublicServiceV2 } from "@/lib/environment/v2/public";
import { createEnvironmentHistoryHandlerV2 } from "@/lib/environment/v2/public-handler";
import { createEnvironmentPublicRepositoryV2 } from "@/lib/environment/v2/supabase-public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;
export const GET = createEnvironmentHistoryHandlerV2({ history: (slug, range) => createEnvironmentPublicServiceV2(createEnvironmentPublicRepositoryV2()).history(slug, range) });
