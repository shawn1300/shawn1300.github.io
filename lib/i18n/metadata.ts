import type { Metadata } from "next";

import { localePath, type Locale } from "@/i18n/routing";

export function localizedAlternates(
  locale: Locale,
  pathname: string
): NonNullable<Metadata["alternates"]> {
  return {
    canonical: localePath(locale, pathname),
    languages: {
      "zh-CN": localePath("zh-CN", pathname),
      en: localePath("en", pathname),
      ja: localePath("ja", pathname),
      "x-default": localePath("zh-CN", pathname),
    },
  };
}
