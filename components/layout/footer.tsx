export function Footer() {
  return (
    <footer className="border-t border-border/40">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <p className="text-[11px] sm:text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Shawn.
        </p>
        <p className="text-[11px] sm:text-xs text-muted-foreground italic tracking-wide">
          もう、何も怖くない！
        </p>
        <div className="flex items-center gap-3">
          <a
            href="https://space.bilibili.com/4790056"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Bilibili"
          >
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-4 w-4"
            >
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <rect x="7" y="2" width="2" height="3" rx="0.5" />
              <rect x="15" y="2" width="2" height="3" rx="0.5" />
              <rect x="8" y="19" width="8" height="1.5" rx="0.5" />
            </svg>
          </a>
          <a
            href="https://github.com/shawn1300"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="GitHub"
          >
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z" />
            </svg>
          </a>
        </div>
      </div>
    </footer>
  );
}
