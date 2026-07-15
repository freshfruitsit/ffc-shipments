import { Construction } from "lucide-react";

export function ComingSoon({ section, module }: { section: string; module: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-ink-muted">
        <Construction className="h-6 w-6" strokeWidth={2} />
      </span>
      <div>
        <h1 className="text-lg font-semibold text-ink">{section}</h1>
        <p className="mt-1 max-w-md text-sm text-ink-muted">
          This cross-shipment view is part of {module}, not yet built. The per-shipment version already
          works from inside each shipment&apos;s detail page.
        </p>
      </div>
    </div>
  );
}
