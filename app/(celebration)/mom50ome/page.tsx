import type { Metadata } from "next";
import { BirthdayCard } from "./birthday-card";
import { birthdayCopy } from "./content";

const pageTitle = "虞小琴女士五十岁生日快乐";

export const metadata: Metadata = {
  title: {
    absolute: pageTitle,
  },
  description: birthdayCopy.pageDescription,
  alternates: {
    canonical: "/mom50ome",
  },
  robots: "noindex, nofollow",
  openGraph: {
    title: pageTitle,
    description: birthdayCopy.pageDescription,
    url: "/mom50ome",
    siteName: "Shawn's Blog",
    type: "website",
    locale: "zh_CN",
    images: [
      {
        url: "/mom50ome/opengraph-image",
        width: 1200,
        height: 630,
        alt: pageTitle,
      },
    ],
  },
};

export default function Mom50omePage() {
  return <BirthdayCard />;
}
