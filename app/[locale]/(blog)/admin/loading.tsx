import { getTranslations } from "next-intl/server";

export default async function AdminLoading() {
  const t = await getTranslations("Common");
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <p className="text-sm text-muted-foreground">{t("loading")}</p>
    </div>
  );
}
