import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { emptyStatusSnapshot, getStatusSnapshot } from "@/lib/status/komari";

import { StatusDashboard } from "./status-dashboard";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Status" });
  return {
    title: t("metadataTitle"),
    description: t("metadataDescription"),
    robots: { index: false, follow: false },
  };
}

export default async function StatusPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  try {
    return <StatusDashboard initialSnapshot={await getStatusSnapshot()} initialError={false} />;
  } catch {
    return <StatusDashboard initialSnapshot={emptyStatusSnapshot()} initialError />;
  }
}
