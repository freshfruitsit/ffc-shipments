export function WizardStepSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i}>
            <div className="h-3 w-20 rounded bg-surface-muted" />
            <div className="mt-2 h-9 w-full rounded-md bg-surface-muted" />
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
        <div className="h-9 w-28 rounded-md bg-surface-muted" />
        <div className="flex gap-2">
          <div className="h-9 w-20 rounded-md bg-surface-muted" />
          <div className="h-9 w-20 rounded-md bg-surface-muted" />
        </div>
      </div>
    </div>
  );
}
