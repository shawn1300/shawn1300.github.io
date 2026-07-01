export default function PostLoading() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 sm:py-24 space-y-6 animate-pulse">
      <div className="h-3 w-24 bg-muted rounded" />
      <div className="h-7 w-3/4 bg-muted rounded" />
      <div className="space-y-3 mt-10">
        <div className="h-4 w-full bg-muted/60 rounded" />
        <div className="h-4 w-5/6 bg-muted/60 rounded" />
        <div className="h-4 w-4/6 bg-muted/60 rounded" />
      </div>
    </div>
  );
}
