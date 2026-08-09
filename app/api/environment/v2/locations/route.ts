import { createEnvironmentPublicServiceV2 } from "@/lib/environment/v2/public";
import { createEnvironmentLocationsHandlerV2 } from "@/lib/environment/v2/public-handler";
import { createEnvironmentPublicRepositoryV2 } from "@/lib/environment/v2/supabase-public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;
export const GET = createEnvironmentLocationsHandlerV2({ list: () => createEnvironmentPublicServiceV2(createEnvironmentPublicRepositoryV2()).locations() });
