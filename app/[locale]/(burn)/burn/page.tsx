import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ThemeProvider } from "@/components/theme-provider";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { Locale } from "@/i18n/routing";

import { BurnReader } from "./burn-reader";

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Burn" });

  return {
    title: t("title"),
    description: t("metadataDescription"),
    robots: { index: false, follow: false, noarchive: true },
    referrer: "no-referrer",
  };
}

export default async function BurnPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Burn" });

  return (
    <ThemeProvider>
      <main className="mx-auto flex min-h-dvh w-full max-w-xl items-center px-4 py-10 sm:px-6">
        <Card className="w-full gap-0 py-0">
          <CardHeader className="border-b border-border p-5 sm:p-7">
            <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
          </CardHeader>
          <CardContent className="p-5 sm:p-7">
            <BurnReader />
          </CardContent>
        </Card>
      </main>
    </ThemeProvider>
  );
}
