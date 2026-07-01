# mom50ome Birthday Site Migration Design

## 1. Goal

Migrate the existing WeChat mini program birthday card from `D:\AI\miniprogram\project_miniprogram\miniprogram_1` into this Next.js blog project as an independent web page at:

```text
https://shawn.cc.cd/mom50ome
```

The page is for celebrating the user's mother, Yu Xiaoqin, on her fiftieth birthday. The page must be mobile-first for QR-code access, while remaining polished and readable on desktop.

## 2. Current Source

The source mini program is a single-page front-end birthday card:

- Main page: `miniprogram/pages/index/index.wxml`
- Interaction and copy: `miniprogram/pages/index/index.ts`
- Visual style: `miniprogram/pages/index/index.scss`
- Design reference: `docs/superpowers/specs/2026-07-01-mother-birthday-mini-program-design.md`

Important existing features to preserve:

- Red-and-gold celebration atmosphere.
- Full-screen fireworks canvas behind the page.
- Hero title: `虞小琴女士 五十岁生日快乐`.
- Large `50` visual mark.
- Button that scrolls from the hero to the blessing section.
- Birthday blessing text.
- Four wish cards spelling `平 安 喜 乐`.
- Closing card with `爱您的儿子`.
- Replay button that scrolls back to the top.

The mini program does not depend on backend services, login, cloud APIs, photos, audio, or remote assets.

## 3. Target Experience

The web page should feel like a standalone digital birthday card, not a blog article.

User-visible requirements:

- Visiting `/mom50ome` opens directly into the birthday card.
- The page does not show the blog header, footer, theme toggle, navigation, or music player.
- The first viewport establishes the celebration immediately.
- The page works well on common phone widths from 360px to 430px.
- Desktop visitors see a centered, composed card-like experience instead of a stretched mobile page.
- All content remains readable without requiring zoom.
- The page can be shared through a QR code pointing to `https://shawn.cc.cd/mom50ome`.

Non-goals:

- No backend.
- No login.
- No comments, likes, analytics, or admin editing.
- No auto-playing music.
- No photo module in the first migration.
- No dependency downloads unless the implementation discovers an existing local package is insufficient.

## 4. Route and Layout Architecture

The project currently uses Next.js `16.2.7` with the App Router. The local Next.js docs confirm that route groups can isolate route sections without changing URL paths.

The birthday page should use route group isolation. Because the current `app/layout.tsx` contains the blog shell, the implementation must move that blog shell out of the top-level root layout.

Recommended file structure:

```text
app/
  layout.tsx
  globals.css
  sitemap.ts
  robots.ts
  icon.png
  (blog)/
    layout.tsx
    page.tsx
    about/page.tsx
    archive/page.tsx
    categories/page.tsx
    diaries/...
    gallery/page.tsx
    friends/page.tsx
    posts/...
    admin/...
    loading.tsx
    not-found.tsx
  (celebration)/
    mom50ome/
      page.tsx
      birthday-card.tsx
      fireworks-canvas.tsx
      content.ts
      page.module.css
      opengraph-image.tsx
```

`app/layout.tsx` becomes a thin shared root layout:

- Imports `app/globals.css`.
- Defines `<html>` and `<body>`.
- Defines global fonts.
- Keeps `metadataBase`.
- Does not render Header, Footer, ThemeProvider, MusicProvider, or ThemeToaster.

`app/(blog)/layout.tsx` becomes the blog shell:

- Renders `ThemeProvider`.
- Renders `MusicProvider`.
- Renders `Header`.
- Renders `<main>`.
- Renders `Footer`.
- Renders `ThemeToaster`.

`app/(celebration)/mom50ome/page.tsx` is the public route for `/mom50ome`.

This structure preserves existing blog URLs because route group folder names are omitted from the URL.

## 5. Page Components

### `page.tsx`

Server Component responsibilities:

- Export page metadata.
- Render the birthday card Client Component.
- Avoid browser-only APIs.

Metadata:

- `title.absolute`: `虞小琴女士五十岁生日快乐`
- `description`: `一份送给妈妈的五十岁生日祝福`
- `alternates.canonical`: `/mom50ome`
- `robots`: `noindex, nofollow`
- `openGraph`: title, description, url, type, and route-specific image

The page should default to `noindex` because this is intended for QR sharing with family and friends rather than search discovery.

### `content.ts`

Static content module responsibilities:

- Export `blessingLines`.
- Export `wishCards`.
- Export `closingWishes`.
- Keep text separate from rendering so later edits to names, sign-off, or blessing copy are simple.

The initial content should match the mini program unless the user supplies revised copy.

### `birthday-card.tsx`

Client Component responsibilities:

- Render the four-section card.
- Handle `scrollIntoView` for "收下这份祝福".
- Handle replay button scrolling back to the top.
- Render `FireworksCanvas`.

The component should avoid reading query params or using route state. It only needs local refs and click handlers.

### `fireworks-canvas.tsx`

Client Component responsibilities:

- Port the mini program canvas firework physics to browser canvas.
- Use `requestAnimationFrame`.
- Scale canvas dimensions by `window.devicePixelRatio`.
- Pause animation when the page is hidden.
- Respect `prefers-reduced-motion` by rendering a quieter static/low-motion background.
- Clean up animation frames and event listeners on unmount.

React 19 requires explicit initial values for refs, so DOM refs should be initialized with `null`.

### `page.module.css`

CSS module responsibilities:

- Hold all celebration-specific styling.
- Prevent red/gold page styles from leaking into the blog.
- Convert mini program `rpx` sizing to responsive web units.
- Use mobile-first rules.

Desktop behavior:

- Full-viewport red-gold background remains.
- Content max width should sit around `680px` to `760px`.
- The card should be centered without looking like a narrow phone screenshot pasted into a browser.

Mobile behavior:

- Use `min-height: 100svh` for hero-like sections.
- Keep title and `50` visible on short screens.
- Use `clamp()` for large headings and the age mark.
- Keep buttons and text inside their containers at 360px width.

## 6. Visual Design

The migrated web page should preserve the existing "classic red-gold celebration card" direction.

Visual decisions:

- Main background: deep red with warm gold highlights.
- Hero: centered ceremony layout with large `50`.
- Decorative elements: ribbons, star glints, subtle texture, and fireworks.
- Content cards: warm cream/gold cards for blessing text, translucent red/gold cards for wishes.
- Border radius: keep cards around 8px or slightly above only where the original design needs a softer ceremonial feel.
- Text: Chinese copy is primary; English subtitle `Fifty and Brilliant` may remain as a small detail.

Avoid:

- Blog typography scale that makes the page feel like an article.
- Decorative overload.
- Full-screen high-frequency fireworks.
- Beige-only or single-hue visual treatment.
- Visible instructional text explaining how to use the page.

## 7. Privacy and QR Code

QR code target:

```text
https://shawn.cc.cd/mom50ome
```

Default privacy posture:

- Do not add `/mom50ome` to `app/sitemap.ts` in the first implementation.
- Set page robots metadata to `noindex, nofollow`.
- Direct URL and QR-code access still work normally.

If the user later wants search engines to index the page, remove `noindex` and add the route to `sitemap.ts`.

## 8. Error and Loading Behavior

The birthday page should be static and local, so it should not need data loading or error states.

For the blog migration:

- Keep existing blog loading and not-found behavior under `(blog)` where relevant.
- Leave API route handlers outside layout concerns because route handlers are not rendered through the UI shell.
- Do not add experimental `global-not-found` unless implementation proves that unmatched routes fail after route grouping.

## 9. Verification

Implementation is complete only after these checks pass:

1. `npm run lint`
2. `npm run build`
3. Local manual check at `/mom50ome`
4. Local manual check at `/`, `/about`, `/posts/[slug]` or another existing blog page
5. Mobile viewport check around 390px wide
6. Desktop viewport check around 1440px wide

Expected results:

- `/mom50ome` has no blog header, footer, theme toggle, or music player.
- Blog routes still have the blog shell.
- The birthday hero fits the first mobile viewport.
- Buttons scroll correctly.
- Fireworks render without blocking reading.
- The build does not report route conflicts from route groups.

## 10. Implementation Order

Recommended order:

1. Split the current root layout into thin root layout plus `(blog)/layout.tsx`.
2. Move existing visual page routes into `(blog)` while preserving URLs.
3. Add the static content module for the birthday page.
4. Add the fireworks canvas component.
5. Add the birthday card component and CSS module.
6. Add route metadata and OG image.
7. Run lint and build.
8. Verify mobile and desktop layout locally.

This order keeps the highest-risk routing change separate from the birthday page implementation.
