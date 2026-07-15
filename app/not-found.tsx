import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-ink-muted">
        <FileQuestion className="h-6 w-6" strokeWidth={2} />
      </span>
      <div>
        <h2 className="text-lg font-semibold text-ink">Page not found</h2>
        <p className="mt-1 max-w-sm text-sm text-ink-muted">
          Either this shipment doesn&apos;t exist, or it&apos;s outside your branch and you don&apos;t
          have visibility across branches.
        </p>
      </div>
      <Link
        href="/shipments"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-dark"
      >
        Back to Shipment Register
      </Link>
    </div>
  );
}
