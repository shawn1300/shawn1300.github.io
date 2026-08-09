import { notFound } from "next/navigation";

import { createEnvironmentPublicServiceV2 } from "@/lib/environment/v2/public";
import { createEnvironmentPublicRepositoryV2 } from "@/lib/environment/v2/supabase-public";

import { EnvironmentDashboard } from "./environment-dashboard";

export async function EnvironmentPageContent({ location, requireLocation = false }: { location: string; requireLocation?: boolean }) {
  const service = createEnvironmentPublicServiceV2(createEnvironmentPublicRepositoryV2());
  const [locationsResult, latestResult, historyResult] = await Promise.allSettled([
    service.locations(), service.latest(location), service.history(location, "24h"),
  ]);
  if (requireLocation && latestResult.status === "fulfilled" && latestResult.value === null) notFound();
  return <EnvironmentDashboard
    initialLocation={location}
    locations={locationsResult.status === "fulfilled" ? locationsResult.value : []}
    initialLatest={latestResult.status === "fulfilled" ? latestResult.value : null}
    initialHistory={historyResult.status === "fulfilled" ? historyResult.value : null}
    initialLatestError={latestResult.status === "rejected"}
    initialHistoryError={historyResult.status === "rejected"}
  />;
}
