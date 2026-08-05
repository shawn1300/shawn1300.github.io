import type { Metadata } from "next";

import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function EnvironmentLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

