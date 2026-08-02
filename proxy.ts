import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isLocale, localePath, routing } from "@/i18n/routing";

const handleInternationalization = createMiddleware(routing);
const localePrefixPattern = /^\/(zh-CN|en|ja)(?:\/|$)/;

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasExplicitLocale = localePrefixPattern.test(pathname);
  const savedLocale = request.cookies.get("BLOG_LOCALE")?.value;

  // Browser language is deliberately ignored. Only a language explicitly chosen
  // on this site may redirect a later visit to an unprefixed URL.
  if (
    !hasExplicitLocale &&
    isLocale(savedLocale) &&
    savedLocale !== routing.defaultLocale
  ) {
    const url = request.nextUrl.clone();
    url.pathname = localePath(savedLocale, pathname);
    return NextResponse.redirect(url);
  }

  return handleInternationalization(request);
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
