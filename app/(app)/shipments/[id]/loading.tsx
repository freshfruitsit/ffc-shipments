export default function ShipmentTabLoading() {
  return (
    <div className="animate-pulse rounded-xl border border-border bg-surface p-5">
      <div className="grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i}>
            <div className="h-2.5 w-20 rounded bg-surface-muted" />
            <div className="mt-2 h-3.5 w-28 rounded bg-surface-muted" />
          </div>
        ))}
      </div>
      <div className="mt-5 h-2.5 w-16 rounded bg-surface-muted" />
      <div className="mt-2 h-3.5 w-full max-w-md rounded bg-surface-muted" />
    </div>
  );
}
