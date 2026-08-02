import { permanentRedirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { isLocale, localePath } from "@/i18n/routing";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  permanentRedirect(localePath(isLocale(locale) ? locale : "zh-CN", "/mom50ome"));
}
