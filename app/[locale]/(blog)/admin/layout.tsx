import { AdminSidebar } from "@/components/admin/sidebar";
import { AuthGuard } from "@/components/admin/auth-guard";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin" });
  return { title: t("metadataTitle"), robots: { index: false, follow: false } };
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="flex flex-col md:flex-row min-h-screen">
        <AdminSidebar />
        <main className="flex-1 p-4 md:p-8">
          <div className="max-w-4xl mx-auto">{children}</div>
        </main>
      </div>
    </AuthGuard>
  );
}
