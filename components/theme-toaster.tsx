"use client";

import { useTheme } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { useEffect, useState } from "react";

export function ThemeToaster() {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <Toaster position="bottom-center" theme="light" />;
  }

  return (
    <Toaster
      position="bottom-center"
      theme={(theme as "light" | "dark") || "light"}
    />
  );
}
