import { getTranslations } from "next-intl/server";

import { redirect } from "@/i18n/navigation";
import { localePath, type Locale } from "@/i18n/routing";
import { getBurnOwnerAccess } from "@/lib/burn/owner";

import { BurnForm } from "./burn-form";

export default async function AdminBurnPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Burn" });
  const access = await getBurnOwnerAccess();

  if (access === "signed-out") redirect({ href: "/admin/login", locale });

  return (
    <section className="max-w-2xl space-y-6 py-3 sm:py-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("createDescription")}</p>
      </div>
      {access === "allowed" ? (
        <BurnForm readPath={localePath(locale, "/burn")} />
      ) : (
        <p className="rounded-lg border border-border p-4 text-sm" role="status">
          {t(access === "unconfigured" ? "unconfigured" : "forbidden")}
        </p>
      )}
    </section>
  );
}
