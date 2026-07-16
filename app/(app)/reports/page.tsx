import Link from "next/link";
import { TriangleAlert, Users } from "lucide-react";
import { SHIPMENT_REPORTS } from "@/lib/report-catalog";

export default function ReportsIndexPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Reports</h1>
        <p className="text-sm text-ink-muted">
          Every report below reflects live data and respects your normal branch/permission access — there&apos;s
          nothing here you couldn&apos;t already see elsewhere, just organized as a specific business question.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/exceptions"
          className="rounded-lg border border-border bg-surface p-4 transition hover:border-primary/40 hover:shadow-sm"
        >
          <div className="flex items-center gap-2">
            <TriangleAlert className="h-4 w-4 text-ink-muted" strokeWidth={2} />
            <p className="font-medium text-ink">Exception Report</p>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            Every open exception across your branch&apos;s shipments. Opens the full Exceptions workspace,
            which already is this report.
          </p>
        </Link>

        <Link
          href="/reports/supplier-performance"
          className="rounded-lg border border-border bg-surface p-4 transition hover:border-primary/40 hover:shadow-sm"
        >
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-ink-muted" strokeWidth={2} />
            <p className="font-medium text-ink">Supplier Performance Report</p>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            Shipment volume, completion rate, and open exceptions, grouped by supplier.
          </p>
        </Link>

        {SHIPMENT_REPORTS.map((r) => (
          <Link
            key={r.key}
            href={`/reports/${r.key}`}
            className="rounded-lg border border-border bg-surface p-4 transition hover:border-primary/40 hover:shadow-sm"
          >
            <p className="font-medium text-ink">{r.title}</p>
            <p className="mt-1 text-xs text-ink-muted">{r.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
