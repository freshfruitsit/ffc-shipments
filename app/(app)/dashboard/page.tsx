import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [totalRes, inProgressRes, completedRes, attentionRes] = await Promise.all([
    supabase.from("shipments").select("*", { count: "exact", head: true }),
    supabase
      .from("shipments")
      .select("*", { count: "exact", head: true })
      .not("overall_status", "in", "(Completed,Cancelled)"),
    supabase
      .from("shipments")
      .select("*", { count: "exact", head: true })
      .eq("overall_status", "Completed"),
    supabase
      .from("shipments")
      .select("*", { count: "exact", head: true })
      .in("overall_status", ["On Hold", "Rejected", "Resubmission Required"]),
  ]);

  // Item 7 fix: a failed KPI query must not silently render as "0" — that's
  // indistinguishable from a genuinely empty, healthy register. Each card
  // tracks its own error independently so one bad query doesn't hide the
  // other three that succeeded.
  const kpis = [
    { label: "Total shipments", res: totalRes, href: "/shipments" },
    { label: "In progress", res: inProgressRes, href: "/shipments" },
    { label: "Completed", res: completedRes, href: "/shipments?status=Completed" },
    { label: "Needs attention", res: attentionRes, href: "/shipments?status=On+Hold", accent: true },
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
            {k.res.error ? (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-danger">
                <AlertCircle className="h-4 w-4" strokeWidth={2} />
                Couldn&apos;t load
              </p>
            ) : (
              <p className={`mt-2 text-3xl font-semibold tabular-nums ${k.accent ? "text-warning" : "text-ink"}`}>
                {k.res.count ?? 0}
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
