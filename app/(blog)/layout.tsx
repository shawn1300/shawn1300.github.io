import { ThemeProvider } from "@/components/theme-provider";
import { MusicProvider } from "@/components/music/music-context";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { ThemeToaster } from "@/components/theme-toaster";

export default function BlogLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ThemeProvider>
      <MusicProvider>
        <div className="min-h-screen flex flex-col">
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
        <ThemeToaster />
      </MusicProvider>
    </ThemeProvider>
  );
}
