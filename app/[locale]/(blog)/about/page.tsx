import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { localizedAlternates } from "@/lib/i18n/metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "About" });
  return { title: t("title"), description: t("description"), alternates: localizedAlternates(locale, "/about") };
}

export default async function AboutPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "About" });
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-12 sm:py-24">
      <div className="mb-12 space-y-2">
        <h1 className="text-sm font-medium tracking-tight text-foreground">
          {t("title")}
        </h1>
      </div>

      <div className="prose prose-sm max-w-none space-y-6 text-sm text-foreground/85 leading-relaxed">
        <p>
          {t("intro")}
        </p>
        <p>
          {t("paragraph1")}
        </p>
        <p>
          {t("paragraph2")}
        </p>
        <p>
          {t("paragraph3")}
        </p>

        <div className="pt-4 space-y-2">
          <h2 className="text-sm font-medium text-foreground">{t("contact")}</h2>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/shawn1300"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <a
              href="mailto:shawn1300@outlook.com"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Email
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
