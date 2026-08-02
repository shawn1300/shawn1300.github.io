import type { Metadata } from "next";
import { BirthdayCard } from "./birthday-card";
import { getBirthdayContent } from "./content";
import type { Locale } from "@/i18n/routing";
import { localizedAlternates } from "@/lib/i18n/metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const { birthdayCopy } = getBirthdayContent(locale);
  return {
    title: { absolute: birthdayCopy.pageTitle },
    description: birthdayCopy.pageDescription,
    alternates: localizedAlternates(locale, "/mom50ome"),
    robots: "noindex, nofollow",
    openGraph: {
      title: birthdayCopy.pageTitle,
      description: birthdayCopy.pageDescription,
      url: localizedAlternates(locale, "/mom50ome").canonical as string,
      siteName: "Shawn's Blog",
      type: "website",
      locale: locale === "zh-CN" ? "zh_CN" : locale,
      images: [{ url: "/mom50ome/opengraph-image", width: 1200, height: 630, alt: birthdayCopy.pageTitle }],
    },
  };
}

export default function Mom50omePage() {
  return <BirthdayCard />;
}
