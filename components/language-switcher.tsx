"use client";

import { Check, Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePathname, useRouter } from "@/i18n/navigation";
import { type Locale, routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("Languages");
  const common = useTranslations("Navigation");

  const switchLocale = (nextLocale: Locale) => {
    if (nextLocale === locale) return;
    const search = typeof window === "undefined" ? "" : window.location.search;
    router.replace(`${pathname}${search}`, { locale: nextLocale });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
            aria-label={common("changeLanguage")}
            title={common("changeLanguage")}
          />
        }
      >
        <Languages className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        {routing.locales.map((option) => (
          <DropdownMenuItem
            key={option}
            onClick={() => switchLocale(option)}
            className="gap-2"
          >
            <Check
              className={cn("h-3.5 w-3.5", option !== locale && "opacity-0")}
            />
            {t(option)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
