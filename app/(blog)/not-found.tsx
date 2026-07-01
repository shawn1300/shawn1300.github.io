import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
      <p className="text-6xl font-light text-muted-foreground/30 select-none">404</p>
      <p className="mt-4 text-sm text-muted-foreground">
        这个页面不存在，或者已经被移除。
      </p>
      <Link
        href="/"
        className="mt-8 text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
      >
        ← 返回首页
      </Link>
    </div>
  );
}
