"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const t = useTranslations("Admin.login");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast.error(error.message || t("failed"));
        return;
      }

      router.push("/admin");
      router.refresh();
    } catch {
      toast.error(t("failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-sm font-semibold tracking-tight text-foreground">
            Shawn&apos;s Blog
          </h1>
          <p className="text-sm text-muted-foreground">{t("title")}</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <Input
            type="email"
            placeholder={t("email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-10 text-sm bg-transparent border-border/60 focus-visible:ring-0 focus-visible:border-ring"
          />
          <Input
            type="password"
            placeholder={t("password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-10 text-sm bg-transparent border-border/60 focus-visible:ring-0 focus-visible:border-ring"
          />
          <Button
            type="submit"
            disabled={loading}
            className="w-full h-10 text-sm"
          >
            {loading ? t("submitting") : t("submit")}
          </Button>
        </form>
      </div>
    </div>
  );
}
