import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { isEnvironmentPublicSlug } from "@/lib/environment/v2/metrics";

import { EnvironmentPageContent } from "../environment-page-content";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; location: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Environment" });
  return { title: t("metadataTitle"), description: t("metadataDescription"), robots: { index: false, follow: false } };
}

export default async function EnvironmentLocationPage({ params }: { params: Promise<{ locale: string; location: string }> }) {
  const { locale, location } = await params;
  setRequestLocale(locale);
  if (!isEnvironmentPublicSlug(location)) notFound();
  return <EnvironmentPageContent location={location} requireLocation />;
}
