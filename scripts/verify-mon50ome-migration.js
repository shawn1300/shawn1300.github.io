const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));

const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const checks = [
  {
    name: "thin root layout remains at app/layout.tsx",
    pass: () => exists("app/layout.tsx"),
  },
  {
    name: "root layout no longer imports blog shell components",
    pass: () => {
      const file = read("app/layout.tsx");
      return (
        !file.includes("@/components/layout/header") &&
        !file.includes("@/components/layout/footer") &&
        !file.includes("@/components/music/music-context") &&
        !file.includes("@/components/theme-provider")
      );
    },
  },
  {
    name: "blog layout contains the existing blog shell",
    pass: () => {
      if (!exists("app/(blog)/layout.tsx")) return false;
      const file = read("app/(blog)/layout.tsx");
      return (
        file.includes("ThemeProvider") &&
        file.includes("MusicProvider") &&
        file.includes("<Header />") &&
        file.includes("<Footer />") &&
        file.includes("<ThemeToaster />")
      );
    },
  },
  {
    name: "blog routes moved into route group without URL path changes",
    pass: () =>
      exists("app/(blog)/page.tsx") &&
      exists("app/(blog)/about/page.tsx") &&
      exists("app/(blog)/archive/page.tsx") &&
      exists("app/(blog)/categories/page.tsx") &&
      exists("app/(blog)/diaries/page.tsx") &&
      exists("app/(blog)/diaries/[slug]/page.tsx") &&
      exists("app/(blog)/gallery/page.tsx") &&
      exists("app/(blog)/friends/page.tsx") &&
      exists("app/(blog)/posts/[slug]/page.tsx") &&
      exists("app/(blog)/admin/layout.tsx"),
  },
  {
    name: "top-level blog page files are removed after route grouping",
    pass: () =>
      !exists("app/page.tsx") &&
      !exists("app/about") &&
      !exists("app/archive") &&
      !exists("app/categories") &&
      !exists("app/diaries") &&
      !exists("app/gallery") &&
      !exists("app/friends") &&
      !exists("app/posts") &&
      !exists("app/admin"),
  },
  {
    name: "api routes remain top-level",
    pass: () =>
      exists("app/api/comments/route.ts") &&
      exists("app/api/posts/route.ts") &&
      exists("app/api/diaries/route.ts"),
  },
  {
    name: "birthday page route files exist",
    pass: () =>
      exists("app/(celebration)/mon50ome/page.tsx") &&
      exists("app/(celebration)/mon50ome/content.ts") &&
      exists("app/(celebration)/mon50ome/birthday-card.tsx") &&
      exists("app/(celebration)/mon50ome/fireworks-canvas.tsx") &&
      exists("app/(celebration)/mon50ome/page.module.css") &&
      exists("app/(celebration)/mon50ome/opengraph-image.tsx"),
  },
  {
    name: "birthday metadata is private and route-specific",
    pass: () => {
      if (!exists("app/(celebration)/mon50ome/page.tsx")) return false;
      const file = read("app/(celebration)/mon50ome/page.tsx");
      return (
        file.includes("虞小琴女士五十岁生日快乐") &&
        file.includes("noindex") &&
        file.includes("nofollow") &&
        file.includes("/mon50ome")
      );
    },
  },
  {
    name: "birthday content preserves mini program copy",
    pass: () => {
      if (!exists("app/(celebration)/mon50ome/content.ts")) return false;
      const file = read("app/(celebration)/mon50ome/content.ts");
      return (
        file.includes("半生辛劳，半生光芒") &&
        file.includes("平安康健") &&
        file.includes("爱您的儿子")
      );
    },
  },
  {
    name: "birthday card is interactive client component",
    pass: () => {
      if (!exists("app/(celebration)/mon50ome/birthday-card.tsx")) return false;
      const file = read("app/(celebration)/mon50ome/birthday-card.tsx");
      return (
        file.startsWith('"use client";') &&
        file.includes("scrollIntoView") &&
        file.includes("FireworksCanvas")
      );
    },
  },
  {
    name: "fireworks use browser animation APIs safely",
    pass: () => {
      if (!exists("app/(celebration)/mon50ome/fireworks-canvas.tsx")) return false;
      const file = read("app/(celebration)/mon50ome/fireworks-canvas.tsx");
      return (
        file.startsWith('"use client";') &&
        file.includes("requestAnimationFrame") &&
        file.includes("devicePixelRatio") &&
        file.includes("prefers-reduced-motion") &&
        file.includes("visibilitychange")
      );
    },
  },
  {
    name: "birthday CSS is mobile-first and scoped",
    pass: () => {
      if (!exists("app/(celebration)/mon50ome/page.module.css")) return false;
      const file = read("app/(celebration)/mon50ome/page.module.css");
      return (
        file.includes("100svh") &&
        file.includes("clamp(") &&
        file.includes("@media (min-width: 768px)") &&
        file.includes("prefers-reduced-motion")
      );
    },
  },
];

const failed = checks.filter((check) => !check.pass());

if (failed.length > 0) {
  console.error("mon50ome migration verification failed:");
  for (const check of failed) {
    console.error(`- ${check.name}`);
  }
  process.exit(1);
}

console.log(`mon50ome migration verification passed (${checks.length} checks).`);
