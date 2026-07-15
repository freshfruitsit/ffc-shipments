export default function AppLoading() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="h-6 w-48 animate-pulse rounded bg-surface-muted" />
        <div className="h-4 w-64 animate-pulse rounded bg-surface-muted" />
      </div>
      <div className="h-10 w-full max-w-xl animate-pulse rounded-md bg-surface-muted" />
      <div className="overflow-hidden rounded-lg border border-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse border-b border-border bg-surface-muted/50 last:border-0" />
        ))}
      </div>
    </div>
  );
}
