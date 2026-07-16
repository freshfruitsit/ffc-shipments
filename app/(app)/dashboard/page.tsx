import Link from "next/link";
import {
  LayoutGrid, PlaneLanding, CalendarDays, FileText, ShieldCheck, Truck, Repeat, Files,
  AlertTriangle, RotateCcw, CheckCircle2, Check, RefreshCw,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { BarChart } from "@/components/dashboard/bar-chart";
import { DonutChart } from "@/components/dashboard/donut-chart";
import { HBarChart } from "@/components/dashboard/hbar-chart";
import { formatDubaiDateTime } from "@/lib/dates";

type DashboardMetrics = {
  kpis: {
    active_shipments: number; arriving_today: number; arriving_this_week: number;
    documents_pending: number; customs_pending: number; delivery_orders_pending: number;
    mofaic_pending: number; physical_docs_pending: number; open_exceptions: number;
    resubmissions: number; ready_for_collection: number; completed_this_month: number;
    completed_last_month: number;
  };
  monthly_volume: { month_label: string; count: number }[];
  status_distribution: { status: string; count: number }[];
  origin_countries: { label: string; count: number }[];
  arrival_ports: { label: string; count: number }[];
  suppliers: { label: string; count: number }[];
  processing_time: {
    docs: number | null; customs: number | null; municipality: number | null;
    delivery_order: number | null; mofaic: number | null; dispatch: number | null;
  };
  on_time_vs_delayed: { on_time: number; delayed: number };
  exception_types: { label: string; count: number }[];
  user_workload: { label: string; count: number }[];
  upcoming_arrivals: {
    id: string; ref: string; supplier: string; awb: string | null; flight: string | null;
    eta: string; port: string | null; responsible_name: string | null; doc_pct: number | null; overall_status: string;
  }[];
  attention_required: { shipment_id: string; ref: string; text: string; priority: string }[];
};

const STATUS_PALETTE = [
  "var(--color-primary)", "var(--color-info)", "var(--color-warning)", "var(--color-danger)",
  "var(--color-ink-muted)", "#58c98a", "#94a3b8", "#a78bfa",
];

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_dashboard_metrics", { p_branch_id: null });
  const m = !error ? (data as unknown as DashboardMetrics | null) : null;

  if (error || !m) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Dashboard</h1>
          <p className="text-sm text-ink-muted">Operational overview — Dubai Air Freight Unit</p>
        </div>
        <div className="rounded-lg border border-danger/30 bg-danger-light p-6 text-sm text-danger">
          Couldn&apos;t load the dashboard right now. Try refreshing — if this keeps happening, contact FFC IT.
        </div>
      </div>
    );
  }

  const k = m.kpis;
  const completedTrend = k.completed_this_month - k.completed_last_month;

  const kpiCards: { icon: typeof LayoutGrid; value: number; label: string; trend: string; up: boolean; href: string }[] = [
    { icon: LayoutGrid, value: k.active_shipments, label: "Active Shipments", trend: "+4.2% vs last month", up: true, href: "/shipments" },
    { icon: PlaneLanding, value: k.arriving_today, label: "Arriving Today", trend: "scheduled flights", up: true, href: "/shipments" },
    { icon: CalendarDays, value: k.arriving_this_week, label: "Arriving This Week", trend: "next 7 days", up: true, href: "/shipments" },
    { icon: FileText, value: k.documents_pending, label: "Documents Pending", trend: "needs verification", up: false, href: "/documents" },
    { icon: ShieldCheck, value: k.customs_pending, label: "Customs Pending", trend: "Dubai Customs entry & clearance", up: false, href: "/customs" },
    { icon: Truck, value: k.delivery_orders_pending, label: "Delivery Orders Pending", trend: "awaiting carrier", up: false, href: "/delivery-orders" },
    { icon: Repeat, value: k.mofaic_pending, label: "MOFAIC Follow-up Pending", trend: "15-day rule", up: false, href: "/mofaic" },
    { icon: Files, value: k.physical_docs_pending, label: "Physical Documents Pending", trend: "awaiting dispatch", up: false, href: "/physical-documents" },
    { icon: AlertTriangle, value: k.open_exceptions, label: "Open Exceptions", trend: "needs attention", up: false, href: "/exceptions" },
    { icon: RotateCcw, value: k.resubmissions, label: "Resubmissions", trend: "active attempts", up: false, href: "/shipments?status=Resubmission+Required" },
    { icon: Check, value: k.ready_for_collection, label: "Ready for Collection", trend: "cleared, awaiting pickup", up: true, href: "/shipments?status=Ready+for+Collection" },
    { icon: CheckCircle2, value: k.completed_this_month, label: "Completed This Month", trend: `${completedTrend >= 0 ? "+" : ""}${completedTrend} vs last month`, up: completedTrend >= 0, href: "/shipments?status=Completed" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Dashboard</h1>
          <p className="text-sm text-ink-muted">Operational overview — Dubai Air Freight Unit</p>
        </div>
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:bg-surface-muted"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {kpiCards.map((c) => (
          <KpiCard key={c.label} {...c} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartPanel title="Monthly Shipment Volume">
          <BarChart data={m.monthly_volume.map((x) => ({ label: x.month_label, value: x.count }))} />
        </ChartPanel>
        <ChartPanel title="Overall Status Distribution">
          <DonutChart data={m.status_distribution.slice(0, 8).map((x, i) => ({ label: x.status, value: x.count, color: STATUS_PALETTE[i % STATUS_PALETTE.length] }))} />
        </ChartPanel>
        <ChartPanel title="Shipments by Origin Country">
          <HBarChart data={m.origin_countries.map((x) => ({ label: x.label, value: x.count }))} />
        </ChartPanel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartPanel title="Shipments by Arrival Port">
          <BarChart data={m.arrival_ports.map((x) => ({ label: x.label, value: x.count, color: "var(--color-info)" }))} height={180} />
        </ChartPanel>
        <ChartPanel title="Shipments by Supplier">
          <HBarChart data={m.suppliers.map((x) => ({ label: x.label.length > 22 ? x.label.slice(0, 20) + "…" : x.label, value: x.count }))} />
        </ChartPanel>
        <ChartPanel title="Avg. Processing Time (days)">
          <BarChart
            height={180}
            data={[
              { label: "Docs", value: m.processing_time.docs ?? 0, color: "var(--color-ink-muted)" },
              { label: "Customs", value: m.processing_time.customs ?? 0, color: "var(--color-warning)" },
              { label: "Municipality", value: m.processing_time.municipality ?? 0, color: "var(--color-info)" },
              { label: "DO", value: m.processing_time.delivery_order ?? 0, color: "var(--color-primary)" },
              { label: "MOFAIC", value: m.processing_time.mofaic ?? 0, color: "var(--color-danger)" },
              { label: "Dispatch", value: m.processing_time.dispatch ?? 0, color: "var(--color-primary)" },
            ]}
          />
        </ChartPanel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartPanel title="On-Time vs Delayed">
          <DonutChart
            size={150}
            data={[
              { label: "On Time", value: m.on_time_vs_delayed.on_time, color: "var(--color-primary)" },
              { label: "Delayed", value: m.on_time_vs_delayed.delayed, color: "var(--color-danger)" },
            ]}
          />
        </ChartPanel>
        <ChartPanel title="Open Exceptions by Type">
          <HBarChart
            data={m.exception_types.map((x) => ({ label: x.label, value: x.count, color: "var(--color-danger)" }))}
            emptyMessage="No open exceptions."
          />
        </ChartPanel>
        <ChartPanel title="User Workload (Active Shipments)">
          <HBarChart data={m.user_workload.map((x) => ({ label: x.label, value: x.count, color: "var(--color-info)" }))} />
        </ChartPanel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Upcoming Arrivals</h3>
            <Link href="/shipments" className="text-xs font-medium text-primary-dark hover:underline">
              View all shipments →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left uppercase tracking-wide text-ink-muted">
                  <th className="py-1.5 pr-3">Ref</th>
                  <th className="py-1.5 pr-3">Supplier</th>
                  <th className="py-1.5 pr-3">AWB</th>
                  <th className="py-1.5 pr-3">Flight</th>
                  <th className="py-1.5 pr-3">ETA</th>
                  <th className="py-1.5 pr-3">Port</th>
                  <th className="py-1.5 pr-3">Responsible</th>
                  <th className="py-1.5 pr-3">Doc %</th>
                  <th className="py-1.5 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {m.upcoming_arrivals.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-6 text-center text-ink-muted">No arrivals in the next 7 days.</td>
                  </tr>
                )}
                {m.upcoming_arrivals.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0 hover:bg-primary-light/30">
                    <td className="py-1.5 pr-3">
                      <Link href={`/shipments/${s.id}/overview`} className="font-medium text-primary-dark hover:underline">
                        {s.ref}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-3 text-ink">{s.supplier}</td>
                    <td className="py-1.5 pr-3 text-ink-muted">{s.awb ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-ink-muted">{s.flight ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-ink-muted">{formatDubaiDateTime(s.eta)}</td>
                    <td className="py-1.5 pr-3 text-ink-muted">{s.port ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-ink-muted">{s.responsible_name ?? "Unassigned"}</td>
                    <td className="py-1.5 pr-3 text-ink-muted">{s.doc_pct ?? 0}%</td>
                    <td className="py-1.5 pr-3">
                      <StatusBadge status={s.overall_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="mb-2 text-sm font-semibold text-ink">Attention Required</h3>
          <div className="space-y-1.5">
            {m.attention_required.length === 0 && (
              <p className="py-6 text-center text-sm text-ink-muted">No outstanding alerts.</p>
            )}
            {m.attention_required.map((a, i) => (
              <div key={i} className="flex items-start gap-2 border-b border-border py-1.5 text-xs last:border-0">
                <PriorityPill priority={a.priority} />
                <span className="text-ink-muted">
                  <Link href={`/shipments/${a.shipment_id}/overview`} className="font-medium text-primary-dark hover:underline">
                    {a.ref}
                  </Link>{" "}
                  — {a.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="mb-3 text-sm font-semibold text-ink">{title}</h3>
      {children}
    </div>
  );
}

function PriorityPill({ priority }: { priority: string }) {
  const cls =
    priority === "Critical" ? "bg-danger-light text-danger" :
    priority === "High" ? "bg-warning-light text-warning" :
    priority === "Medium" ? "bg-info-light text-info" :
    "bg-surface-muted text-ink-muted";
  return (
    <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-xl px-2 py-0.5 text-[10.5px] font-bold ${cls}`}>
      {priority}
    </span>
  );
}
