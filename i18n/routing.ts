import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["zh-CN", "en", "ja"],
  defaultLocale: "zh-CN",
  localePrefix: "as-needed",
  localeDetection: false,
  localeCookie: {
    name: "BLOG_LOCALE",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === "production",
  },
});

export type Locale = (typeof routing.locales)[number];

export function isLocale(value: string | null | undefined): value is Locale {
  return routing.locales.some((locale) => locale === value);
}

export function localePath(locale: Locale, pathname: string): string {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return locale === routing.defaultLocale
    ? normalizedPath
    : `/${locale}${normalizedPath === "/" ? "" : normalizedPath}`;
}
