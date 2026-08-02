import { useTranslations } from "next-intl";

export function TranslationPendingNotice() {
  const t = useTranslations("Common");
  return (
    <aside className="mb-8 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
      {t("translationPending")}
    </aside>
  );
}
