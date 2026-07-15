import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { withPerformanceLogging } from "@/lib/performance-logging";

type Metrics = {
  total_active: number;
  in_progress: number;
  completed: number;
  needs_attention: number;
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data, error } = await withPerformanceLogging("get_dashboard_metrics", () =>
    supabase.rpc("get_dashboard_metrics", { p_branch_id: null })
  );

  if (error) {
    console.error("[dashboard] get_dashboard_metrics failed:", error.message);
  }
  const metrics = !error ? (data as unknown as Metrics | null) : null;

  // Item 7 (preserved): a failed metrics call must not silently render as
  // "0" — that's indistinguishable from a genuinely empty, healthy
  // register. One RPC call now backs all four cards, so there's one
  // failure mode to handle instead of four independent ones — but the
  // "never show a fake zero" guarantee is unchanged.
  const kpis: { label: string; value: number | undefined; href: string; accent?: boolean }[] = [
    { label: "Total shipments", value: metrics?.total_active, href: "/shipments" },
    { label: "In progress", value: metrics?.in_progress, href: "/shipments" },
    { label: "Completed", value: metrics?.completed, href: "/shipments?status=Completed" },
    { label: "Needs attention", value: metrics?.needs_attention, href: "/shipments?status=On+Hold", accent: true },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Dashboard</h1>
        <p className="text-sm text-ink-muted">An overview of shipment activity across your branch.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <Link
            key={k.label}
            href={k.href}
            className="rounded-xl border border-border bg-surface p-5 transition hover:border-primary/40 hover:shadow-sm"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{k.label}</p>
            {!metrics ? (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-danger">
                <AlertCircle className="h-4 w-4" strokeWidth={2} />
                Couldn&apos;t load
              </p>
            ) : (
              <p className={`mt-2 text-3xl font-semibold tabular-nums ${k.accent ? "text-warning" : "text-ink"}`}>
                {k.value ?? 0}
              </p>
            )}
          </Link>
        ))}
      </div>

      <div className="rounded-lg border border-dashed border-border bg-surface-muted/50 p-4 text-center text-sm text-ink-muted">
        Charts, saved views, and the full KPI set from the prototype arrive alongside Module 3
        (Exceptions, Notifications, Reports &amp; Audit).
      </div>
    </div>
  );
}
