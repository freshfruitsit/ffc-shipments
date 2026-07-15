export default function NewShipmentLoading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse space-y-3">
      <div>
        <div className="h-5 w-40 rounded bg-surface-muted" />
        <div className="mt-2 h-3.5 w-56 rounded bg-surface-muted" />
      </div>
      <div className="rounded-xl border border-border bg-surface">
        <div className="flex border-b border-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex-1 px-2 py-3">
              <div className="mx-auto h-3 w-14 rounded bg-surface-muted" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i}>
              <div className="h-3 w-20 rounded bg-surface-muted" />
              <div className="mt-2 h-9 w-full rounded-md bg-surface-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
