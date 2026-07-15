export default function ShipmentsLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="h-5 w-40 rounded bg-surface-muted" />
          <div className="mt-2 h-3.5 w-64 rounded bg-surface-muted" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 rounded-md bg-surface-muted" />
          <div className="h-9 w-32 rounded-md bg-surface-muted" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-7 w-32 rounded-2xl bg-surface-muted" />
        ))}
      </div>
      <div className="h-14 w-full rounded-md bg-surface-muted" />
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="h-9 bg-surface-muted/70" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-11 border-t border-border bg-surface-muted/40" />
        ))}
      </div>
    </div>
  );
}
