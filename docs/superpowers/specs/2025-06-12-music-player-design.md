# Music Player — Design Spec

**Date**: 2025-06-12
**Status**: Approved

---

## 1. Overview

Add a minimal music player to the blog. No auto-play. The player lives as a music note icon in the header navigation bar, next to the ThemeToggle. Clicking the note opens a popover panel with playback controls and a playlist.

---

## 2. Placement

**Header navigation bar, rightmost position, to the left of ThemeToggle.**

```
[Logo] [首页] [分类] ... [关于]        [♪] [☀/🌙]
```

The music note icon is the only visible element when the player is idle/collapsed.

---

## 3. Visual Design

### 3.1 Collapsed State (Default)

- A **♪ music note icon** rendered as an inline SVG or Unicode character
- Size: ~28×28px touch target, icon ~16px
- Color: `text-muted-foreground` in both themes
- Hover: transitions to `text-foreground`
- No background, no border — clean and minimal
- If no music is loaded or an error occurs, the icon is still visible but dimmed further (opacity-40)

### 3.2 Playing State

- When audio is playing, the note icon gains a **CSS spinning animation**:
  ```css
  @keyframes spin-note {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  .playing { animation: spin-note 3s linear infinite; }
  ```
- Icon color transitions to `text-primary` (blue-purple tone) while playing
- The spin is smooth and continuous — like a vinyl record
- When paused, the animation pauses (via `animation-play-state: paused`) so it doesn't snap back — rotation resumes from the paused position

### 3.3 Expanded Panel

Opens as a popover below the header, right-aligned, triggered by clicking the note icon.

**Layout (top to bottom):**

```
┌──────────────────────────┐
│  [🪩 disc]  夢と葉桜       │  ← now-playing: rotating disc + track info
│            初音ミク·青木月光 │
│                          │
│  ═══════════░░░░░░░░░░░  │  ← slim progress bar (2px)
│                          │
│    ⏮     ⏸     ⏭        │  ← prev / play-pause (circle, primary) / next
│                          │
│  ──────────────────────  │  ← divider
│  ▶ 夢と葉桜         3:42 │  ← playlist item (current, highlighted)
│  ♫ Where Wind...    4:12 │  ← playlist item (inactive)
└──────────────────────────┘
```

**Dimensions:**
- Width: 260px (desktop), ~240px (mobile < 400px)
- Border radius: `rounded-xl` (12px)
- Padding: 16px internal
- Shadow: subtle (`0 4px 24px rgba(0,0,0,0.08)` light / `0 4px 24px rgba(0,0,0,0.3)` dark)

**Disc visual:**
- A 48px circle using a `conic-gradient` in the primary blue-purple tones
- A smaller 14px center circle matching the card background (simulates the vinyl hole)
- When playing, the disc spins via the same `spin-note` keyframes
- When paused, disc animation pauses at current position

**Progress bar:**
- 2px height, full width
- Track: `bg-muted` (light grey / dark grey)
- Fill: `bg-primary` (blue-purple)
- No thumb/drag handle (read-only, no seeking)

**Controls:**
- Previous (⏮): text-muted-foreground, hover → foreground
- Play/Pause (▶/⏸): 36px circle, `bg-primary`, `text-primary-foreground`
- Next (⏭): text-muted-foreground, hover → foreground
- All have `transition-colors duration-150`

**Playlist:**
- Divider line above
- Each track: icon + title (truncated) + duration right-aligned
- Current track: highlighted with `bg-muted` background, primary-colored play icon
- Other tracks: default background, muted icon
- Click on a track to play it

### 3.4 Dual-Theme Support

All colors use CSS variables (`--background`, `--foreground`, `--muted`, `--primary`, etc.) — no hardcoded hex values. The component inherits theme automatically.

### 3.5 Responsive

- Desktop: panel right-aligned to header, 260px width
- Mobile (< 640px): panel right-aligned, width adjusted to ~240px, positioned below the hamburger menu area
- Panel uses `absolute` positioning with `right-0` alignment
- Z-index: `z-50` (same as header)

---

## 4. Interaction Behavior

### 4.1 Open/Close Panel

- **Open**: Click the music note icon → panel appears with a subtle fade-in + slide-down animation (150ms)
- **Close**: Click the note icon again, OR click outside the panel → panel fades out
- **Close on navigation**: Panel auto-closes on route change (optional — can stay open, but closing is cleaner)

### 4.2 Playback

- **No auto-play**: On page load, audio is NOT started. User must explicitly click play.
- **Play/Pause**: Click the play/pause button in the panel, OR click the rotating disc area
- **Next/Previous**: Skip to next or previous track in the playlist
- **Track end**: Auto-advance to next track when current track finishes
- **Last track end**: Stop playback (do NOT loop the playlist)

### 4.3 Cross-Page Persistence

- The audio element and its playback state live in a React Context (`MusicProvider`) mounted in the root `layout.tsx`
- This means the `<audio>` element persists across page navigations (Next.js App Router client-side navigation does not unmount the layout)
- Music continues uninterrupted when the user clicks between pages
- The expanded panel state (open/closed) resets on navigation (closes)

### 4.4 Panel Dismissal

- Click outside → close
- Press Escape → close
- Click the note icon again → close
- Navigate to a different page → close

---

## 5. Technical Architecture

### 5.1 File Structure

```
components/
  music/
    music-provider.tsx    # React Context provider + audio element
    music-note.tsx        # Header icon with spin animation
    music-panel.tsx       # Popover panel with controls + playlist
    music-player.tsx      # Composed: MusicNote + MusicPanel wired together
```

### 5.2 Component Tree

```
RootLayout (layout.tsx)
├── ThemeProvider
│   └── MusicProvider          ← wraps entire app, provides audio context
│       ├── Header
│       │   └── MusicPlayer    ← MusicNote + MusicPanel
│       ├── <main>{children}</main>
│       └── Footer
```

### 5.3 MusicProvider Context

```typescript
interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  src: string;        // path relative to /public, e.g. "/music/song.mp3"
}

interface MusicContextValue {
  // State
  tracks: MusicTrack[];
  currentIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  panelOpen: boolean;

  // Actions
  play: (index?: number) => void;
  pause: () => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  setPanelOpen: (open: boolean) => void;
}
```

**Track list** (hardcoded in the provider):

```typescript
const TRACKS: MusicTrack[] = [
  {
    id: "where-wind-whispers",
    title: "Where Wind Whispers",
    artist: "Wuthering Waves · jkinss",
    src: "/music/Wuthering Waves & jkinss - Where Wind Whispers.mp3",
  },
  {
    id: "yume-to-hazakura",
    title: "夢と葉桜",
    artist: "初音ミク · 青木月光",
    src: "/music/初音ミク,青木月光 - 夢と葉桜.mp3",
  },
];
```

### 5.4 Audio Element

- A single `<audio>` element rendered inside `MusicProvider`
- Hidden from DOM (not displayed)
- Events listened: `onTimeUpdate`, `onLoadedMetadata`, `onEnded`, `onError`
- No `autoPlay` attribute
- `preload="metadata"` to fetch duration without full download

---

## 6. Edge Cases & Error Handling

| Scenario | Behavior |
|----------|----------|
| Audio file fails to load | Show muted note icon, panel opens but shows error state ("无法加载") |
| User has no music files | Note icon hidden entirely (graceful degradation) |
| Rapid play/pause clicks | Debounce not needed — native audio element handles this |
| Mobile browser restrictions | Many mobile browsers block autoplay → already non-autoplay, no issue |
| User switches theme while panel open | Panel recalculates via CSS vars, no visual glitch |
| Very long track title | `text-overflow: ellipsis` + `white-space: nowrap` on track name |
| `preload="metadata"` not supported | Fallback to `preload="auto"` — handled by browser |

---

## 7. Dependencies

- No new npm packages required
- Uses existing: React Context, Tailwind CSS, CSS animations
- Audio files served statically from `/public/music/`

---

## 8. Acceptance Criteria

1. Music note icon appears in header on all pages
2. Clicking the note opens the player panel; clicking again or outside closes it
3. Clicking play starts audio (no auto-play)
4. Note icon spins while playing, pauses rotation while paused, static when stopped
5. Play/Pause, Previous, Next controls work correctly
6. Track auto-advances when current track ends; stops after last track
7. Music continues across page navigations without interruption
8. Player panel renders correctly in both light and dark themes
9. Player panel is usable on mobile viewport widths
10. Zero browser console errors during normal operation
