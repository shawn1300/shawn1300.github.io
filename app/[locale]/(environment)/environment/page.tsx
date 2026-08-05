import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { createEnvironmentPublicService } from "@/lib/environment/public";
import { createEnvironmentPublicRepository } from "@/lib/environment/supabase-public";
import type { EnvironmentLatestResponse, EnvironmentRawHistoryResponse } from "@/types/environment";

import { EnvironmentDashboard } from "./environment-dashboard";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Environment" });
  return {
    title: t("metadataTitle"),
    description: t("metadataDescription"),
    robots: { index: false, follow: false },
  };
}

export default async function EnvironmentPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const service = createEnvironmentPublicService(
    createEnvironmentPublicRepository()
  );
  const [latestResult, historyResult] = await Promise.allSettled([
    service.latest("home"),
    service.history("home", "24h"),
  ]);

  const initialLatest: EnvironmentLatestResponse | null =
    latestResult.status === "fulfilled" ? latestResult.value : null;
  const initialHistory: EnvironmentRawHistoryResponse | null =
    historyResult.status === "fulfilled" ? historyResult.value : null;

  return (
    <EnvironmentDashboard
      initialLatest={initialLatest}
      initialHistory={initialHistory}
      initialLatestError={latestResult.status === "rejected"}
      initialHistoryError={historyResult.status === "rejected"}
    />
  );
}

