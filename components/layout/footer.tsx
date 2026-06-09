export function Footer() {
  return (
    <footer className="border-t border-border/40">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Shawn. Built with curiosity.
        </p>
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/shawn1300"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            GitHub
          </a>
          <a
            href="https://x.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            X / Twitter
          </a>
        </div>
      </div>
    </footer>
  );
}
