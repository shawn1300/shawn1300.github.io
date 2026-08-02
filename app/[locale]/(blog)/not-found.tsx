"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

export default function NotFound() {
  const t = useTranslations("NotFound");
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
      <p className="text-6xl font-light text-muted-foreground/30 select-none">404</p>
      <p className="mt-4 text-sm text-muted-foreground">
        {t("message")}
      </p>
      <Link
        href="/"
        className="mt-8 text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
      >
        {t("backHome")}
      </Link>
    </div>
  );
}
