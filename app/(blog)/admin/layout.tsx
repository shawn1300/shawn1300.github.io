import { AdminSidebar } from "@/components/admin/sidebar";
import { AuthGuard } from "@/components/admin/auth-guard";

export const metadata = {
  title: "后台管理",
};

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
