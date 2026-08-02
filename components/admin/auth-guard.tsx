"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { useTranslations } from "next-intl";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("Admin");

  useEffect(() => {
    // 登录页不校验，否则形成死锁
    if (pathname === "/admin/login") {
      setAuthed(true);
      return;
    }

    const supabase = createClient();

    async function checkAuth() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push("/admin/login");
        } else {
          setAuthed(true);
        }
      } catch {
        // session 无效或网络异常，跳转到登录页
        router.push("/admin/login");
      }
    }

    checkAuth();
  }, [router, pathname]);

  if (!authed) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-sm text-muted-foreground">{t("checkingAuth")}</p>
      </div>
    );
  }

  return <>{children}</>;
}
