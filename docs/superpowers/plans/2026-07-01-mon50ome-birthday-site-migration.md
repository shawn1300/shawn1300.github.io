# mon50ome Birthday Site Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent mobile-first birthday card website at `/mon50ome` by migrating the existing WeChat mini program into this Next.js App Router project.

**Architecture:** Keep one thin top-level root layout for global HTML, fonts, and CSS. Move all existing blog UI routes into `app/(blog)` with the old blog shell, then place the birthday page under `app/(celebration)/mon50ome` so it renders without Header, Footer, MusicProvider, or ThemeProvider UI chrome.

**Tech Stack:** Next.js 16.2.7 App Router, React 19.2.4, TypeScript, CSS Modules, browser Canvas API, existing Tailwind/shadcn global setup.

---

## File Structure

Create:

- `scripts/verify-mon50ome-migration.js` - local verification script for route isolation and birthday page invariants.
- `app/(blog)/layout.tsx` - existing blog shell moved out of the top-level root layout.
- `app/(celebration)/mon50ome/page.tsx` - `/mon50ome` server page and metadata.
- `app/(celebration)/mon50ome/content.ts` - birthday text and wish data.
- `app/(celebration)/mon50ome/birthday-card.tsx` - client-rendered birthday page sections and scroll controls.
- `app/(celebration)/mon50ome/fireworks-canvas.tsx` - client-rendered fireworks canvas.
- `app/(celebration)/mon50ome/page.module.css` - isolated birthday page styling.
- `app/(celebration)/mon50ome/opengraph-image.tsx` - route-specific share image.

Modify:

- `app/layout.tsx` - strip to the shared root HTML/body layout.

Move unchanged:

- `app/page.tsx` -> `app/(blog)/page.tsx`
- `app/about` -> `app/(blog)/about`
- `app/archive` -> `app/(blog)/archive`
- `app/categories` -> `app/(blog)/categories`
- `app/diaries` -> `app/(blog)/diaries`
- `app/gallery` -> `app/(blog)/gallery`
- `app/friends` -> `app/(blog)/friends`
- `app/posts` -> `app/(blog)/posts`
- `app/admin` -> `app/(blog)/admin`
- `app/loading.tsx` -> `app/(blog)/loading.tsx`
- `app/not-found.tsx` -> `app/(blog)/not-found.tsx`

Keep top-level:

- `app/api/**`
- `app/globals.css`
- `app/icon.png`
- `app/icon.svg.bak`
- `app/layout.tsx`
- `app/robots.ts`
- `app/sitemap.ts`

---

### Task 1: Add Migration Verification Script

**Files:**
- Create: `scripts/verify-mon50ome-migration.js`

- [ ] **Step 1: Create the verification script**

Create `scripts/verify-mon50ome-migration.js` with this content:

```js
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
```

- [ ] **Step 2: Run the verification script and confirm it fails before implementation**

Run:

```powershell
node scripts/verify-mon50ome-migration.js
```

Expected: FAIL with several missing route group and birthday page checks.

- [ ] **Step 3: Commit the failing verification script**

Run:

```powershell
git add scripts/verify-mon50ome-migration.js
git commit -m "test: add mon50ome migration verification"
```

Expected: commit succeeds. If the environment blocks `.git` writes, continue the implementation and report the commit blocker at the end.

---

### Task 2: Split Root Layout and Move Blog Routes

**Files:**
- Modify: `app/layout.tsx`
- Create: `app/(blog)/layout.tsx`
- Move: existing blog UI route files and folders listed in the File Structure section

- [ ] **Step 1: Verify move targets stay inside the workspace**

Run:

```powershell
Resolve-Path -LiteralPath 'D:\AI\project\shawn1300\app'
Resolve-Path -LiteralPath 'D:\AI\project\shawn1300'
```

Expected: both resolved paths are inside `D:\AI\project\shawn1300`.

- [ ] **Step 2: Create the blog route group directory**

Run:

```powershell
New-Item -ItemType Directory -Force -Path 'D:\AI\project\shawn1300\app\(blog)'
```

Expected: `app/(blog)` exists.

- [ ] **Step 3: Replace the top-level root layout with the thin shared layout**

Replace `app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Shawn's Blog",
    template: "%s — Shawn's Blog",
  },
  description: "Thoughts on code, design, and building things.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Create the blog shell layout**

Create `app/(blog)/layout.tsx` with:

```tsx
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
```

- [ ] **Step 5: Move existing blog route files and folders into `(blog)`**

Run:

```powershell
Move-Item -LiteralPath 'D:\AI\project\shawn1300\app\page.tsx' -Destination 'D:\AI\project\shawn1300\app\(blog)\page.tsx'
Move-Item -LiteralPath 'D:\AI\project\shawn1300\app\about' -Destination 'D:\AI\project\shawn1300\app\(blog)\about'
Move-Item -LiteralPath 'D:\AI\project\shawn1300\app\archive' -Destination 'D:\AI\project\shawn1300\app\(blog)\archive'
Move-Item -LiteralPath 'D:\AI\project\shawn1300\app\categories' -Destination 'D:\AI\project\shawn1300\app\(blog)\categories'
Move-Item -LiteralPath 'D:\AI\project\shawn1300\app\diaries' -Destination 'D:\AI\project\shawn1300\app\(blog)\diaries'
Move-Item -LiteralPath 'D:\AI\project\shawn1300\app\gallery' -Destination 'D:\AI\project\shawn1300\app\(blog)\gallery'
Move-Item -LiteralPath 'D:\AI\project\shawn1300\app\friends' -Destination 'D:\AI\project\shawn1300\app\(blog)\friends'
Move-Item -LiteralPath 'D:\AI\project\shawn1300\app\posts' -Destination 'D:\AI\project\shawn1300\app\(blog)\posts'
Move-Item -LiteralPath 'D:\AI\project\shawn1300\app\admin' -Destination 'D:\AI\project\shawn1300\app\(blog)\admin'
Move-Item -LiteralPath 'D:\AI\project\shawn1300\app\loading.tsx' -Destination 'D:\AI\project\shawn1300\app\(blog)\loading.tsx'
Move-Item -LiteralPath 'D:\AI\project\shawn1300\app\not-found.tsx' -Destination 'D:\AI\project\shawn1300\app\(blog)\not-found.tsx'
```

Expected: blog URL paths remain unchanged because `(blog)` is a route group.

- [ ] **Step 6: Run the migration verification script**

Run:

```powershell
node scripts/verify-mon50ome-migration.js
```

Expected: FAIL only on birthday page files and birthday-specific checks.

- [ ] **Step 7: Run lint after the route move**

Run:

```powershell
npm run lint
```

Expected: PASS or only existing unrelated lint findings. There should be no import errors from route moves because existing imports use the `@/` alias or remain local inside moved folders.

- [ ] **Step 8: Commit the route grouping change**

Run:

```powershell
git add app
git commit -m "refactor: isolate blog shell in route group"
```

Expected: commit succeeds. If `.git` writes are blocked, keep going and report the blocker.

---

### Task 3: Add Birthday Route Metadata and Static Content

**Files:**
- Create: `app/(celebration)/mon50ome/page.tsx`
- Create: `app/(celebration)/mon50ome/content.ts`

- [ ] **Step 1: Create the birthday route directory**

Run:

```powershell
New-Item -ItemType Directory -Force -Path 'D:\AI\project\shawn1300\app\(celebration)\mon50ome'
```

Expected: `app/(celebration)/mon50ome` exists.

- [ ] **Step 2: Create the static birthday content module**

Create `app/(celebration)/mon50ome/content.ts` with:

```ts
export const blessingLines = [
  "妈妈，今天想把最郑重、最明亮的祝福，都送给您。",
  "半生辛劳，半生光芒。谢谢您把许多普通日子，过成了家的底气和温暖。",
  "五十岁，是岁月赠予您的从容、丰盛与漂亮的新开始。",
  "愿往后的每一天，您少些操心，多些自在；身体康健，笑意常在。",
  "愿您所念皆有回响，所行皆是坦途，身边常有爱与好消息。",
] as const;

export const wishCards = [
  {
    index: "平",
    title: "平安康健",
    desc: "愿您身体一直硬朗，日子安安稳稳，少些操劳，多些轻松自在。",
  },
  {
    index: "安",
    title: "安稳顺心",
    desc: "愿家里常有温暖相伴，心里常有踏实安宁，凡事都顺顺当当。",
  },
  {
    index: "喜",
    title: "喜事常来",
    desc: "愿好消息常常出现，值得开心的小事每天都有，生活越过越亮。",
  },
  {
    index: "乐",
    title: "乐在当下",
    desc: "愿您多做喜欢的事，多见想见的人，往后的每一年都笑意盈盈。",
  },
] as const;

export const closingWishes = [
  "愿身体康健，脚步轻快",
  "愿心情自在，日日舒展",
  "愿家人常伴，灯火常暖",
  "愿好事常来，岁岁生辉",
] as const;

export const birthdayCopy = {
  pageTitle: "虞小琴女士五十岁生日快乐",
  pageDescription: "一份送给妈妈的五十岁生日祝福",
  heroBadge: "今日为您点亮",
  heroName: "虞小琴女士",
  heroTitle: "五十岁生日快乐",
  ageLabel: "Fifty and Brilliant",
  heroQuote: "半生辛劳，半生光芒。愿今日所有烟火，都为您而盛放。",
  heroButton: "收下这份祝福",
  blessingEyebrow: "生日寄语",
  blessingTitle: "给最值得被珍重的您",
  wishesEyebrow: "真挚祝愿",
  wishesTitle: "平安喜乐，岁岁有好光景",
  closingEyebrow: "生日快乐",
  closingTitle: "愿您往后的日子",
  closingAccent: "平安、明朗、顺心、常乐",
  closingDesc:
    "五十岁不是岁月的停顿，而是人生另一段从容与丰盛的开始。愿每一个清晨都有好心情，每一次回家都有温暖相迎。",
  sign: "爱您的儿子",
  replayButton: "再看一遍",
} as const;
```

- [ ] **Step 3: Create the birthday page shell**

Create `app/(celebration)/mon50ome/page.tsx` with:

```tsx
import type { Metadata } from "next";
import { BirthdayCard } from "./birthday-card";
import { birthdayCopy } from "./content";

export const metadata: Metadata = {
  title: {
    absolute: birthdayCopy.pageTitle,
  },
  description: birthdayCopy.pageDescription,
  alternates: {
    canonical: "/mon50ome",
  },
  robots: {
    index: false,
    follow: false,
    nocache: false,
  },
  openGraph: {
    title: birthdayCopy.pageTitle,
    description: birthdayCopy.pageDescription,
    url: "/mon50ome",
    siteName: "Shawn's Blog",
    type: "website",
    locale: "zh_CN",
    images: [
      {
        url: "/mon50ome/opengraph-image",
        width: 1200,
        height: 630,
        alt: birthdayCopy.pageTitle,
      },
    ],
  },
};

export default function Mon50omePage() {
  return <BirthdayCard />;
}
```

Expected: this references `BirthdayCard`, which will be created in Task 5.

- [ ] **Step 4: Run the migration verification script**

Run:

```powershell
node scripts/verify-mon50ome-migration.js
```

Expected: FAIL on missing `birthday-card.tsx`, `fireworks-canvas.tsx`, `page.module.css`, and `opengraph-image.tsx`.

- [ ] **Step 5: Commit route content and metadata**

Run:

```powershell
git add 'app/(celebration)/mon50ome/page.tsx' 'app/(celebration)/mon50ome/content.ts'
git commit -m "feat: add mon50ome route metadata and copy"
```

Expected: commit succeeds, unless `.git` writes are blocked.

---

### Task 4: Add Fireworks Canvas Component

**Files:**
- Create: `app/(celebration)/mon50ome/fireworks-canvas.tsx`

- [ ] **Step 1: Create the browser fireworks component**

Create `app/(celebration)/mon50ome/fireworks-canvas.tsx` with:

```tsx
"use client";

import { useEffect, useRef } from "react";
import styles from "./page.module.css";

interface FireworkColor {
  r: number;
  g: number;
  b: number;
}

interface TrailPoint {
  x: number;
  y: number;
}

interface FireworkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: FireworkColor;
  gravity: number;
}

interface FireworkRocket {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  vx: number;
  vy: number;
  size: number;
  color: FireworkColor;
  trail: TrailPoint[];
  particles: FireworkParticle[];
  exploded: boolean;
}

const FIREWORK_COLORS: FireworkColor[] = [
  { r: 255, g: 226, b: 147 },
  { r: 255, g: 125, b: 104 },
  { r: 255, g: 168, b: 211 },
  { r: 151, g: 216, b: 255 },
  { r: 176, g: 238, b: 203 },
  { r: 255, g: 255, b: 238 },
];

const LAUNCH_INTERVAL_MS = 1100;
const MAX_ACTIVE_ROCKETS = 5;
const PARTICLE_COUNT_MIN = 34;
const PARTICLE_COUNT_MAX = 46;
const PARTICLE_TAIL_STEPS = 2;
const ROCKET_TRAIL_LENGTH = 18;

const randomBetween = (min: number, max: number) =>
  Math.random() * (max - min) + min;

const toRgba = (color: FireworkColor, alpha: number) =>
  `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;

const pickFireworkColor = () =>
  FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];

const createRocket = (width: number, height: number): FireworkRocket => {
  const targetX = randomBetween(width * 0.12, width * 0.88);
  const targetY = randomBetween(height * 0.12, height * 0.58);
  const startX = targetX + randomBetween(-width * 0.18, width * 0.18);
  const startY = height + randomBetween(18, 86);
  const distanceX = targetX - startX;
  const distanceY = targetY - startY;
  const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
  const speed = randomBetween(7.2, 9.4);

  return {
    x: startX,
    y: startY,
    targetX,
    targetY,
    vx: (distanceX / distance) * speed,
    vy: (distanceY / distance) * speed,
    size: randomBetween(2.2, 3.8),
    color: pickFireworkColor(),
    trail: [],
    particles: [],
    exploded: false,
  };
};

const explodeRocket = (rocket: FireworkRocket) => {
  rocket.exploded = true;
  rocket.particles = [];

  const count = Math.floor(randomBetween(PARTICLE_COUNT_MIN, PARTICLE_COUNT_MAX + 1));
  for (let index = 0; index < count; index += 1) {
    const angle = Math.PI * 2 * (index / count) + randomBetween(-0.12, 0.12);
    const power = randomBetween(2.2, 5.7);
    const color = index % 5 === 0 ? pickFireworkColor() : rocket.color;
    const life = randomBetween(38, 58);

    rocket.particles.push({
      x: rocket.x,
      y: rocket.y,
      vx: Math.cos(angle) * power,
      vy: Math.sin(angle) * power,
      size: randomBetween(1.2, 2.9),
      life,
      maxLife: life,
      color,
      gravity: randomBetween(0.026, 0.046),
    });
  }
};

const updateRocket = (rocket: FireworkRocket) => {
  if (!rocket.exploded) {
    rocket.x += rocket.vx;
    rocket.y += rocket.vy;
    rocket.vy += 0.036;
    rocket.trail.push({ x: rocket.x, y: rocket.y });

    if (rocket.trail.length > ROCKET_TRAIL_LENGTH) {
      rocket.trail.shift();
    }

    if (rocket.y <= rocket.targetY || rocket.vy >= 0) {
      explodeRocket(rocket);
    }

    return;
  }

  rocket.particles.forEach((particle) => {
    particle.vy += particle.gravity;
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.vx *= 0.986;
    particle.vy *= 0.986;
    particle.life -= 1;
  });

  rocket.particles = rocket.particles.filter((particle) => particle.life > 0);
};

const drawCircle = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string
) => {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
};

const drawParticleTail = (
  ctx: CanvasRenderingContext2D,
  particle: FireworkParticle,
  alpha: number
) => {
  const tailX = particle.x - particle.vx * PARTICLE_TAIL_STEPS * 4.2;
  const tailY = particle.y - particle.vy * PARTICLE_TAIL_STEPS * 4.2;

  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(particle.x, particle.y);
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1, particle.size * 1.6);
  ctx.strokeStyle = toRgba(particle.color, alpha * 0.5);
  ctx.stroke();
};

const drawRocket = (ctx: CanvasRenderingContext2D, rocket: FireworkRocket) => {
  if (!rocket.exploded) {
    rocket.trail.forEach((point, index) => {
      if (index === 0) return;

      const previous = rocket.trail[index - 1];
      const alpha = index / rocket.trail.length;
      ctx.beginPath();
      ctx.moveTo(previous.x, previous.y);
      ctx.lineTo(point.x, point.y);
      ctx.lineCap = "round";
      ctx.lineWidth = 1 + alpha * 2.8;
      ctx.strokeStyle = toRgba(rocket.color, alpha * 0.78);
      ctx.stroke();
    });

    drawCircle(ctx, rocket.x, rocket.y, rocket.size * 2.4, toRgba(rocket.color, 0.22));
    drawCircle(ctx, rocket.x, rocket.y, rocket.size, toRgba({ r: 255, g: 255, b: 255 }, 0.92));
    return;
  }

  rocket.particles.forEach((particle, index) => {
    const alpha = Math.max(particle.life / particle.maxLife, 0);

    drawParticleTail(ctx, particle, alpha);

    if (index % 3 === 0) {
      drawCircle(ctx, particle.x, particle.y, particle.size * 2.4, toRgba(particle.color, alpha * 0.12));
    }

    drawCircle(ctx, particle.x, particle.y, particle.size * 1.4, toRgba(particle.color, alpha * 0.86));
  });
};

export function FireworksCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const rocketsRef = useRef<FireworkRocket[]>([]);
  const launchClockRef = useRef(0);
  const lastFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let disposed = false;
    let visible = !document.hidden;
    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(rect.width, window.innerWidth);
      height = Math.max(rect.height, window.innerHeight);
      dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const drawStaticGlow = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "rgba(58, 2, 12, 0.2)";
      ctx.fillRect(0, 0, width, height);

      const glow = ctx.createRadialGradient(width * 0.5, height * 0.24, 0, width * 0.5, height * 0.24, width * 0.72);
      glow.addColorStop(0, "rgba(255, 225, 150, 0.16)");
      glow.addColorStop(1, "rgba(255, 225, 150, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
    };

    const launchRandomFirework = () => {
      const rockets = rocketsRef.current;

      if (rockets.length >= MAX_ACTIVE_ROCKETS) {
        rockets.shift();
      }

      rockets.push(createRocket(width, height));
    };

    const render = (timestamp: number) => {
      if (disposed) return;

      if (!visible) {
        lastFrameRef.current = timestamp;
        frameRef.current = window.requestAnimationFrame(render);
        return;
      }

      const lastFrame = lastFrameRef.current ?? timestamp;
      const delta = Math.min(timestamp - lastFrame, 64);
      lastFrameRef.current = timestamp;

      if (reducedMotionQuery.matches) {
        drawStaticGlow();
        frameRef.current = window.requestAnimationFrame(render);
        return;
      }

      launchClockRef.current += delta;
      if (launchClockRef.current > LAUNCH_INTERVAL_MS) {
        launchRandomFirework();
        launchClockRef.current = 0;
      }

      ctx.fillStyle = "rgba(58, 2, 12, 0.22)";
      ctx.fillRect(0, 0, width, height);

      const rockets = rocketsRef.current;
      for (let index = rockets.length - 1; index >= 0; index -= 1) {
        const rocket = rockets[index];
        updateRocket(rocket);
        drawRocket(ctx, rocket);

        if (rocket.exploded && rocket.particles.length === 0) {
          rockets.splice(index, 1);
        }
      }

      frameRef.current = window.requestAnimationFrame(render);
    };

    const handleVisibilityChange = () => {
      visible = !document.hidden;
      lastFrameRef.current = null;
    };

    resize();
    launchRandomFirework();
    launchRandomFirework();

    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    frameRef.current = window.requestAnimationFrame(render);

    return () => {
      disposed = true;
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.fireworksCanvas} aria-hidden="true" />;
}
```

- [ ] **Step 2: Run TypeScript-adjacent lint check after creating the component**

Run:

```powershell
npm run lint
```

Expected: FAIL until `page.module.css` exists, or PASS if CSS is already present from Task 5. There should be no React 19 `useRef()` missing-initial-value issue.

- [ ] **Step 3: Commit the fireworks component**

Run:

```powershell
git add 'app/(celebration)/mon50ome/fireworks-canvas.tsx'
git commit -m "feat: add mon50ome fireworks canvas"
```

Expected: commit succeeds, unless `.git` writes are blocked.

---

### Task 5: Add Birthday Card Component and Styles

**Files:**
- Create: `app/(celebration)/mon50ome/birthday-card.tsx`
- Create: `app/(celebration)/mon50ome/page.module.css`

- [ ] **Step 1: Create the birthday card component**

Create `app/(celebration)/mon50ome/birthday-card.tsx` with:

```tsx
"use client";

import { useRef } from "react";
import { FireworksCanvas } from "./fireworks-canvas";
import { birthdayCopy, blessingLines, closingWishes, wishCards } from "./content";
import styles from "./page.module.css";

export function BirthdayCard() {
  const topRef = useRef<HTMLDivElement | null>(null);
  const blessingRef = useRef<HTMLElement | null>(null);

  const scrollToBlessing = () => {
    blessingRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const scrollToTop = () => {
    topRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <div ref={topRef} className={styles.shell}>
      <FireworksCanvas />
      <div className={styles.backgroundWash} aria-hidden="true" />

      <main className={styles.page}>
        <section className={styles.hero} aria-labelledby="mon50ome-title">
          <div className={`${styles.ribbon} ${styles.ribbonTop}`} aria-hidden="true" />
          <div className={`${styles.ribbon} ${styles.ribbonBottom}`} aria-hidden="true" />
          <span className={`${styles.star} ${styles.starOne}`} aria-hidden="true">✦</span>
          <span className={`${styles.star} ${styles.starTwo}`} aria-hidden="true">✦</span>
          <span className={`${styles.star} ${styles.starThree}`} aria-hidden="true">✦</span>

          <div className={styles.heroStage}>
            <p className={styles.heroBadge}>{birthdayCopy.heroBadge}</p>

            <div className={styles.heroTitleWrap}>
              <p className={styles.heroName}>{birthdayCopy.heroName}</p>
              <h1 id="mon50ome-title" className={styles.heroTitle}>
                {birthdayCopy.heroTitle}
              </h1>
            </div>

            <div className={styles.ageMark} aria-label="50岁">
              <div className={`${styles.ageRing} ${styles.ageRingOuter}`} aria-hidden="true" />
              <div className={`${styles.ageRing} ${styles.ageRingInner}`} aria-hidden="true" />
              <span className={styles.ageNumber}>50</span>
              <span className={styles.ageLabel}>{birthdayCopy.ageLabel}</span>
            </div>

            <p className={styles.heroQuote}>{birthdayCopy.heroQuote}</p>

            <button className={styles.heroButton} type="button" onClick={scrollToBlessing}>
              {birthdayCopy.heroButton}
            </button>
          </div>
        </section>

        <section ref={blessingRef} className={`${styles.section} ${styles.blessingSection}`}>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionEyebrow}>{birthdayCopy.blessingEyebrow}</p>
            <h2 className={styles.sectionTitle}>{birthdayCopy.blessingTitle}</h2>
          </div>

          <div className={styles.blessingCard}>
            {blessingLines.map((line) => (
              <p key={line} className={styles.blessingLine}>
                {line}
              </p>
            ))}
          </div>
        </section>

        <section className={`${styles.section} ${styles.wishesSection}`}>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionEyebrow}>{birthdayCopy.wishesEyebrow}</p>
            <h2 className={styles.sectionTitle}>{birthdayCopy.wishesTitle}</h2>
          </div>

          <div className={styles.wishList}>
            {wishCards.map((wish) => (
              <article key={wish.title} className={styles.wishCard}>
                <span className={styles.wishIndex}>{wish.index}</span>
                <h3 className={styles.wishTitle}>{wish.title}</h3>
                <p className={styles.wishDesc}>{wish.desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={`${styles.section} ${styles.closingSection}`}>
          <div className={styles.closingCard}>
            <p className={styles.closingEyebrow}>{birthdayCopy.closingEyebrow}</p>
            <h2 className={styles.closingTitle}>{birthdayCopy.closingTitle}</h2>
            <p className={styles.closingAccent}>{birthdayCopy.closingAccent}</p>
            <p className={styles.closingDesc}>{birthdayCopy.closingDesc}</p>

            <div className={styles.closingWishList}>
              {closingWishes.map((wish) => (
                <p key={wish} className={styles.closingWishItem}>
                  {wish}
                </p>
              ))}
            </div>

            <div className={styles.closingDivider} aria-hidden="true" />
            <p className={styles.closingSign}>{birthdayCopy.sign}</p>

            <button className={styles.replayButton} type="button" onClick={scrollToTop}>
              {birthdayCopy.replayButton}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Create the scoped birthday CSS module**

Create `app/(celebration)/mon50ome/page.module.css` with:

```css
.shell {
  position: relative;
  min-height: 100svh;
  overflow-x: hidden;
  color: #fff5dc;
  background:
    radial-gradient(circle at 50% 0%, rgba(255, 219, 128, 0.2), transparent 32rem),
    linear-gradient(120deg, rgba(255, 225, 158, 0.08) 0, rgba(255, 225, 158, 0) 34%),
    linear-gradient(180deg, #5a0610 0%, #8c0c18 34%, #a71220 60%, #640812 100%);
}

.shell::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    repeating-linear-gradient(135deg, rgba(255, 231, 178, 0.045) 0, rgba(255, 231, 178, 0.045) 1px, transparent 1px, transparent 18px),
    linear-gradient(180deg, rgba(255, 246, 222, 0.08), rgba(255, 246, 222, 0));
}

.fireworksCanvas {
  position: fixed;
  inset: 0;
  z-index: 1;
  display: block;
  width: 100vw;
  height: 100svh;
  pointer-events: none;
}

.backgroundWash {
  position: fixed;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgba(35, 0, 8, 0.74), rgba(102, 7, 21, 0.38) 52%, rgba(35, 0, 8, 0)),
    linear-gradient(115deg, rgba(255, 224, 150, 0.16), rgba(255, 224, 150, 0) 42%),
    radial-gradient(circle at 78% 22%, rgba(151, 216, 255, 0.08), transparent 14rem);
  opacity: 0.68;
}

.page {
  position: relative;
  z-index: 3;
  width: min(100%, 760px);
  margin: 0 auto;
  overflow: hidden;
}

.hero {
  position: relative;
  min-height: 100svh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(1.5rem, 7svh, 3rem) 1.25rem calc(2rem + env(safe-area-inset-bottom));
  overflow: hidden;
}

.heroStage {
  position: relative;
  z-index: 2;
  width: 100%;
  max-width: 42rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.ribbon {
  position: absolute;
  z-index: 1;
  width: clamp(13rem, 58vw, 28rem);
  height: clamp(2.2rem, 9vw, 4.6rem);
  border-radius: 999px;
  border: 1px solid rgba(255, 228, 159, 0.2);
  background: linear-gradient(90deg, rgba(255, 241, 203, 0), rgba(255, 215, 121, 0.26), rgba(255, 241, 203, 0));
  animation: ribbonFloat 5200ms ease-in-out infinite;
}

.ribbonTop {
  top: 8%;
  left: -9rem;
  transform: rotate(-22deg);
}

.ribbonBottom {
  right: -10rem;
  bottom: 12%;
  transform: rotate(24deg);
  animation-delay: 900ms;
}

.star {
  position: absolute;
  z-index: 1;
  color: rgba(255, 238, 184, 0.88);
  line-height: 1;
  text-shadow: 0 0 1.4rem rgba(255, 218, 115, 0.58);
  animation: starPulse 3600ms ease-in-out infinite;
}

.starOne {
  top: 15%;
  right: 14%;
  font-size: clamp(1.2rem, 5vw, 2rem);
}

.starTwo {
  left: 9%;
  bottom: 24%;
  font-size: clamp(1rem, 4vw, 1.6rem);
  animation-delay: 700ms;
}

.starThree {
  right: 18%;
  bottom: 10%;
  font-size: clamp(0.9rem, 3vw, 1.4rem);
  animation-delay: 1400ms;
}

.heroBadge {
  margin: 0 0 0.9rem;
  padding: 0.45rem 0.9rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 227, 154, 0.34);
  background: rgba(255, 247, 225, 0.08);
  color: #ffe4a3;
  font-size: clamp(0.8rem, 3.2vw, 0.95rem);
  line-height: 1.3;
}

.heroTitleWrap {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.heroName {
  margin: 0;
  color: #fff9ea;
  font-size: clamp(1.8rem, 8.2vw, 3rem);
  font-weight: 650;
  line-height: 1.2;
  text-shadow: 0 0.5rem 1.8rem rgba(44, 0, 7, 0.26);
}

.heroTitle {
  margin: 0.35rem 0 0;
  color: #ffe2a0;
  font-size: clamp(2rem, 9.4vw, 3.4rem);
  font-weight: 750;
  line-height: 1.16;
  letter-spacing: 0;
  text-shadow: 0 0.6rem 1.9rem rgba(44, 0, 7, 0.28);
}

.ageMark {
  position: relative;
  width: clamp(12.5rem, 48vw, 18rem);
  aspect-ratio: 1;
  margin: clamp(1rem, 4.5svh, 2.2rem) 0 clamp(0.9rem, 4svh, 1.9rem);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.ageRing {
  position: absolute;
  border-radius: 50%;
  box-sizing: border-box;
}

.ageRingOuter {
  inset: 0;
  border: 1px solid rgba(255, 225, 148, 0.56);
  box-shadow: 0 0 2.6rem rgba(255, 217, 119, 0.22), inset 0 0 0 1.1rem rgba(255, 247, 223, 0.05);
  animation: ringBreath 4200ms ease-in-out infinite;
}

.ageRingInner {
  inset: 1.4rem;
  border: 1px solid rgba(255, 246, 218, 0.28);
}

.ageNumber {
  position: relative;
  z-index: 1;
  color: #ffe69f;
  font-size: clamp(5.9rem, 25vw, 8.8rem);
  font-weight: 760;
  line-height: 0.95;
  text-shadow: 0 0.85rem 2.1rem rgba(52, 0, 8, 0.32);
}

.ageLabel {
  position: relative;
  z-index: 1;
  margin-top: 0.45rem;
  color: rgba(255, 248, 226, 0.9);
  font-size: clamp(0.72rem, 2.8vw, 0.9rem);
  line-height: 1.2;
}

.heroQuote {
  max-width: 36rem;
  margin: 0;
  color: rgba(255, 248, 230, 0.94);
  font-size: clamp(1rem, 3.7vw, 1.18rem);
  line-height: 1.72;
}

.heroButton,
.replayButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  font: inherit;
  font-size: clamp(0.95rem, 3.6vw, 1.08rem);
  font-weight: 650;
  line-height: 1;
  cursor: pointer;
  transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease;
}

.heroButton {
  width: min(100%, 13rem);
  min-height: 3.2rem;
  margin-top: 1.35rem;
  color: #67100e;
  background: linear-gradient(180deg, #fff1c9 0%, #f5c864 100%);
  box-shadow: 0 1.1rem 2.4rem rgba(61, 0, 7, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.62);
  animation: buttonBreath 2800ms ease-in-out infinite;
}

.heroButton:hover,
.replayButton:hover {
  transform: translateY(-1px);
}

.section {
  position: relative;
  z-index: 1;
  padding: 2.8rem 1.25rem;
  scroll-margin-top: 1rem;
}

.sectionHeader {
  max-width: 42rem;
  margin: 0 auto 1.1rem;
}

.sectionEyebrow {
  margin: 0;
  color: #ffd47d;
  font-size: clamp(0.78rem, 3vw, 0.95rem);
  line-height: 1.3;
}

.sectionTitle {
  margin: 0.35rem 0 0;
  color: #fff4d8;
  font-size: clamp(1.45rem, 6vw, 2.5rem);
  font-weight: 760;
  line-height: 1.28;
  letter-spacing: 0;
}

.blessingCard {
  position: relative;
  max-width: 42rem;
  margin: 0 auto;
  padding: clamp(1.35rem, 5vw, 2.1rem);
  border-radius: 8px;
  color: #68101d;
  background: linear-gradient(180deg, rgba(255, 250, 235, 0.98), rgba(255, 238, 207, 0.96));
  border: 1px solid rgba(255, 228, 170, 0.72);
  box-shadow: 0 1.25rem 3.4rem rgba(53, 0, 7, 0.18);
}

.blessingLine {
  margin: 0 0 0.68rem;
  font-size: clamp(1rem, 3.8vw, 1.15rem);
  line-height: 1.92;
}

.blessingLine:last-child {
  margin-bottom: 0;
}

.wishList {
  max-width: 42rem;
  margin: 0 auto;
  display: grid;
  gap: 0.75rem;
}

.wishCard {
  position: relative;
  min-height: 5.9rem;
  padding: 1.05rem 1.1rem 1.05rem 4.25rem;
  border-radius: 8px;
  background: rgba(255, 247, 223, 0.1);
  border: 1px solid rgba(255, 230, 168, 0.24);
  box-shadow: 0 1rem 2.4rem rgba(51, 0, 6, 0.12);
}

.wishIndex {
  position: absolute;
  top: 1.1rem;
  left: 1.1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  aspect-ratio: 1;
  border-radius: 50%;
  color: #711016;
  background: #ffe4a4;
  font-size: 0.9rem;
  font-weight: 760;
}

.wishTitle {
  margin: 0;
  color: #fff1c9;
  font-size: clamp(1.1rem, 4.2vw, 1.35rem);
  font-weight: 750;
  line-height: 1.3;
}

.wishDesc {
  margin: 0.4rem 0 0;
  color: rgba(255, 247, 225, 0.9);
  font-size: clamp(0.94rem, 3.5vw, 1.05rem);
  line-height: 1.72;
}

.closingSection {
  min-height: 100svh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3rem 1.25rem calc(3.4rem + env(safe-area-inset-bottom));
}

.closingCard {
  width: 100%;
  max-width: 42rem;
  padding: clamp(1.5rem, 5.5vw, 2.6rem) clamp(1.25rem, 5vw, 2rem) clamp(1.4rem, 5vw, 2.3rem);
  border-radius: 8px;
  text-align: center;
  color: #fff6df;
  background: linear-gradient(180deg, rgba(255, 246, 222, 0.13), rgba(255, 246, 222, 0.07));
  border: 1px solid rgba(255, 228, 165, 0.28);
  box-shadow: 0 1.4rem 3.4rem rgba(47, 0, 7, 0.16);
}

.closingEyebrow {
  margin: 0;
  color: #ffd886;
  font-size: clamp(0.9rem, 3.2vw, 1rem);
  line-height: 1.35;
}

.closingTitle {
  margin: 0.8rem 0 0;
  color: #fff8e4;
  font-size: clamp(1.55rem, 6.2vw, 2.65rem);
  font-weight: 760;
  line-height: 1.34;
  letter-spacing: 0;
}

.closingAccent {
  margin: 0.2rem 0 0;
  color: #ffe29c;
  font-size: clamp(1.45rem, 5.8vw, 2.5rem);
  font-weight: 760;
  line-height: 1.34;
}

.closingDesc {
  margin: 1.1rem 0 0;
  color: rgba(255, 248, 226, 0.92);
  font-size: clamp(0.98rem, 3.7vw, 1.12rem);
  line-height: 1.82;
  text-align: left;
}

.closingWishList {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;
  margin-top: 1.1rem;
}

.closingWishItem {
  min-height: 3.25rem;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.72rem 0.55rem;
  border-radius: 8px;
  color: #ffe7aa;
  background: rgba(255, 238, 191, 0.1);
  border: 1px solid rgba(255, 226, 154, 0.22);
  font-size: clamp(0.82rem, 3.1vw, 0.98rem);
  line-height: 1.38;
}

.closingDivider {
  width: 6.4rem;
  height: 1px;
  margin: 1.35rem auto 1rem;
  background: linear-gradient(90deg, rgba(255, 230, 168, 0), rgba(255, 230, 168, 1), rgba(255, 230, 168, 0));
}

.closingSign {
  margin: 0;
  color: #ffe6a4;
  font-size: clamp(1.05rem, 4vw, 1.25rem);
  line-height: 1.4;
}

.replayButton {
  min-width: 10rem;
  min-height: 3rem;
  margin-top: 1.1rem;
  color: #fff7e6;
  background: rgba(255, 241, 210, 0.12);
  border: 1px solid rgba(255, 226, 154, 0.32);
}

@media (max-height: 700px) {
  .hero {
    padding-top: 1.25rem;
    padding-bottom: calc(1.5rem + env(safe-area-inset-bottom));
  }

  .heroBadge {
    margin-bottom: 0.55rem;
  }

  .ageMark {
    width: clamp(10.5rem, 42vw, 14rem);
    margin-top: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .heroButton {
    min-height: 2.8rem;
    margin-top: 1rem;
  }

  .closingSection {
    padding-top: 2rem;
    padding-bottom: calc(2.4rem + env(safe-area-inset-bottom));
  }

  .closingDesc {
    margin-top: 0.8rem;
    line-height: 1.66;
  }
}

@media (min-width: 768px) {
  .page {
    width: min(calc(100% - 3rem), 760px);
  }

  .hero {
    padding-left: 2rem;
    padding-right: 2rem;
  }

  .section {
    padding-left: 2rem;
    padding-right: 2rem;
  }

  .wishList {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .wishCard {
    min-height: 11rem;
    padding-left: 1.2rem;
    padding-top: 4.15rem;
  }

  .wishIndex {
    top: 1.2rem;
    left: 1.2rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ribbon,
  .star,
  .ageRingOuter,
  .heroButton {
    animation: none;
  }

  .heroButton:hover,
  .replayButton:hover {
    transform: none;
  }
}

@keyframes ribbonFloat {
  0%,
  100% {
    opacity: 0.62;
  }

  50% {
    opacity: 1;
  }
}

@keyframes starPulse {
  0%,
  100% {
    opacity: 0.42;
    transform: scale(0.9);
  }

  50% {
    opacity: 1;
    transform: scale(1.14);
  }
}

@keyframes ringBreath {
  0%,
  100% {
    transform: scale(1);
  }

  50% {
    transform: scale(1.035);
  }
}

@keyframes buttonBreath {
  0%,
  100% {
    transform: scale(1);
    box-shadow: 0 1.1rem 2.4rem rgba(61, 0, 7, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.62);
  }

  50% {
    transform: scale(1.018);
    box-shadow: 0 1.35rem 3rem rgba(255, 206, 95, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.72);
  }
}
```

- [ ] **Step 3: Run the migration verification script**

Run:

```powershell
node scripts/verify-mon50ome-migration.js
```

Expected: FAIL only on missing `opengraph-image.tsx`.

- [ ] **Step 4: Run lint**

Run:

```powershell
npm run lint
```

Expected: PASS. If lint reports line-length or formatting concerns in the new files, format them without changing behavior.

- [ ] **Step 5: Commit birthday card and styles**

Run:

```powershell
git add 'app/(celebration)/mon50ome/birthday-card.tsx' 'app/(celebration)/mon50ome/page.module.css'
git commit -m "feat: add mon50ome birthday card UI"
```

Expected: commit succeeds, unless `.git` writes are blocked.

---

### Task 6: Add Route-Specific Open Graph Image

**Files:**
- Create: `app/(celebration)/mon50ome/opengraph-image.tsx`

- [ ] **Step 1: Create generated OG image**

Create `app/(celebration)/mon50ome/opengraph-image.tsx` with:

```tsx
import { ImageResponse } from "next/og";
import { birthdayCopy } from "./content";

export const alt = birthdayCopy.pageTitle;
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #5a0610 0%, #9b111f 54%, #5f0713 100%)",
          color: "#fff6df",
          position: "relative",
          overflow: "hidden",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -160,
            left: -120,
            width: 520,
            height: 520,
            borderRadius: 520,
            background: "rgba(255, 226, 156, 0.14)",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: -100,
            bottom: -150,
            width: 560,
            height: 560,
            borderRadius: 560,
            background: "rgba(255, 168, 211, 0.12)",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 260,
            height: 260,
            borderRadius: 260,
            border: "4px solid rgba(255, 230, 160, 0.7)",
            boxShadow: "0 0 52px rgba(255, 218, 115, 0.22)",
            color: "#ffe69f",
            fontSize: 132,
            fontWeight: 800,
            lineHeight: 1,
          }}
        >
          50
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginTop: 34,
          }}
        >
          <div
            style={{
              color: "#fff9ea",
              fontSize: 58,
              fontWeight: 700,
              lineHeight: 1.16,
            }}
          >
            {birthdayCopy.heroName}
          </div>
          <div
            style={{
              marginTop: 10,
              color: "#ffe2a0",
              fontSize: 70,
              fontWeight: 800,
              lineHeight: 1.12,
            }}
          >
            {birthdayCopy.heroTitle}
          </div>
        </div>
        <div
          style={{
            marginTop: 28,
            color: "rgba(255, 248, 226, 0.9)",
            fontSize: 28,
          }}
        >
          {birthdayCopy.heroQuote}
        </div>
      </div>
    ),
    size
  );
}
```

- [ ] **Step 2: Run the migration verification script**

Run:

```powershell
node scripts/verify-mon50ome-migration.js
```

Expected: PASS with `mon50ome migration verification passed (12 checks).`

- [ ] **Step 3: Run lint**

Run:

```powershell
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Commit OG image**

Run:

```powershell
git add 'app/(celebration)/mon50ome/opengraph-image.tsx'
git commit -m "feat: add mon50ome open graph image"
```

Expected: commit succeeds, unless `.git` writes are blocked.

---

### Task 7: Build and Manual Route Verification

**Files:**
- No source file changes expected.

- [ ] **Step 1: Run production build**

Run:

```powershell
npm run build
```

Expected: PASS. There should be no route conflict between root pages and `(blog)` pages, and no TypeScript error from React 19 refs.

- [ ] **Step 2: Start the local dev server**

Run:

```powershell
npm run dev
```

Expected: dev server starts on the default Next.js port, usually `http://localhost:3000`. If the port is occupied, Next.js prints the alternate local URL.

- [ ] **Step 3: Check the birthday route on mobile width**

Open:

```text
http://localhost:3000/mon50ome
```

Use a viewport around 390px wide.

Expected:

- No blog header.
- No blog footer.
- No theme toggle.
- No music player.
- Hero fills the first viewport.
- `虞小琴女士` and `五十岁生日快乐` are readable.
- The `50` mark fits without clipping.
- Fireworks render behind the card and do not cover text.
- `收下这份祝福` scrolls to the blessing section.
- `再看一遍` scrolls back to the hero.

- [ ] **Step 4: Check the birthday route on desktop width**

Use a viewport around 1440px wide.

Expected:

- Page remains centered.
- Content width is not stretched edge-to-edge.
- Fireworks and background fill the viewport.
- Text and buttons do not overlap.

- [ ] **Step 5: Check existing blog routes**

Open:

```text
http://localhost:3000/
http://localhost:3000/about
http://localhost:3000/archive
http://localhost:3000/gallery
```

Expected:

- Existing blog pages still render.
- Blog Header and Footer are visible.
- Theme toggle and music player are still visible where they were before.

- [ ] **Step 6: Check a blog dynamic route shell**

Open a deterministic missing post route:

```text
http://localhost:3000/posts/mon50ome-route-shell-check
```

Expected:

- The blog not-found UI renders under the blog shell.
- Blog Header and Footer are visible.
- The route does not render the birthday layout.
- If the home page shows real posts, click the first visible post link and confirm it also renders under the blog shell.

- [ ] **Step 7: Stop the dev server**

Stop the running dev server with `Ctrl+C`.

Expected: no long-running dev session remains active.

---

### Task 8: Final Verification and Handoff

**Files:**
- No source file changes expected.

- [ ] **Step 1: Re-run all automated checks**

Run:

```powershell
node scripts/verify-mon50ome-migration.js
npm run lint
npm run build
```

Expected:

- Verification script passes.
- Lint passes.
- Build passes.

- [ ] **Step 2: Inspect git status**

Run:

```powershell
git status --short
```

Expected: only intentional files from this migration are changed. Pre-existing unrelated user changes may still be present and must not be reverted.

- [ ] **Step 3: Commit remaining migration files**

If any intended migration files are uncommitted, run:

```powershell
git add scripts/verify-mon50ome-migration.js app docs/superpowers/specs/2026-07-01-mon50ome-birthday-site-migration-design.md docs/superpowers/plans/2026-07-01-mon50ome-birthday-site-migration.md
git commit -m "feat: add mon50ome birthday page"
```

Expected: commit succeeds. If `.git` writes are blocked, leave the working tree intact and report exactly which files changed.

- [ ] **Step 4: Report final URL and QR target**

Report:

```text
https://shawn.cc.cd/mon50ome
```

Also report whether `/mon50ome` is intentionally excluded from `app/sitemap.ts` and marked `noindex, nofollow`.
