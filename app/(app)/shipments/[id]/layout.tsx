import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { withPerformanceLogging } from "@/lib/performance-logging";
import { StatusBadge } from "@/components/ui/status-badge";
import { ShipmentTabs } from "@/components/shipments/tabs/shipment-tabs";
import { ShipmentStepper } from "@/components/shipments/tabs/shipment-stepper";
import { ShipmentActionBar } from "@/components/shipments/tabs/shipment-action-bar";
import { formatDubaiDateTime, formatMoney } from "@/lib/dates";

type HeaderContext = {
  id: string; ref: string; mode: string; overall_status: string; priority: string;
  supplier_name_snapshot: string; eta: string | null; awb: string | null; flight: string | null;
  physical_doc_status: string; document_status: string; updated_at: string; completion_eligible: boolean;
  port_name: string | null; responsible_name: string | null;
  invoice_totals: Record<string, number>;
  valid_status_transitions: { to_status: string; requires_reason: boolean }[];
  open_exception_count: number;
  permissions: { assign: boolean; approve_status_change: boolean; manage_exceptions: boolean; edit_basic: boolean };
};

export default async function ShipmentDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Item 6 (performance): this used to be 1 shipment fetch + up to 9 more
  // parallel requests (port name, responsible-user name, invoice totals,
  // the FULL assignable-profiles list, status transitions, and 4 separate
  // has_permission calls) on every single shipment page view. One RPC now
  // covers all of it except the assignable-profiles list, which moved to
  // the Assign panel itself and only loads if that panel is opened.
  const { data, error } = await withPerformanceLogging(
    "get_shipment_header_context",
    () => supabase.rpc("get_shipment_header_context", { p_shipment_id: id }),
    { route: `/shipments/${id}` }
  );

  if (error) {
    console.error("[shipment-header] get_shipment_header_context failed:", error.message);
  }
  if (error || !data) {
    notFound();
  }
  const shipment = data as unknown as HeaderContext;

  const invoiceTotalDisplay =
    Object.keys(shipment.invoice_totals).length > 0
      ? Object.entries(shipment.invoice_totals).map(([cur, val]) => formatMoney(val, cur)).join(", ")
      : "—";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-ink">{shipment.ref}</div>
            <p className="mt-0.5 text-sm text-ink-muted">{shipment.supplier_name_snapshot}</p>
          </div>
          <ShipmentActionBar
            shipmentId={id}
            validTransitions={shipment.valid_status_transitions}
            permissions={{
              assign: shipment.permissions.assign,
              changeStatus: shipment.permissions.approve_status_change,
              raiseException: shipment.permissions.manage_exceptions,
              edit: shipment.permissions.edit_basic,
            }}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-4 text-sm sm:grid-cols-3 lg:grid-cols-5">
          <MetaItem label="Overall Status"><StatusBadge status={shipment.overall_status} /></MetaItem>
          <MetaItem label="Priority"><StatusBadge status={shipment.priority} priority /></MetaItem>
          <MetaItem label="Responsible User">{shipment.responsible_name ?? "—"}</MetaItem>
          <MetaItem label="ETA">{shipment.eta ? formatDubaiDateTime(shipment.eta) : "—"}</MetaItem>
          <MetaItem label="Total Invoice Value">{invoiceTotalDisplay}</MetaItem>
          <MetaItem label="AWB / Flight">{`${shipment.awb ?? "—"} / ${shipment.flight ?? "—"}`}</MetaItem>
          <MetaItem label="Port">{shipment.port_name ?? "—"}</MetaItem>
          <MetaItem label="Last Updated">{formatDubaiDateTime(shipment.updated_at)}</MetaItem>
        </div>

        <ShipmentStepper
          overallStatus={shipment.overall_status}
          physicalDocStatus={shipment.physical_doc_status}
          lastUpdated={shipment.updated_at}
        />
      </div>

      <ShipmentTabs shipmentId={id} />

      <div className="pt-2">{children}</div>
    </div>
  );
}

function MetaItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-0.5 text-ink">{children}</div>
    </div>
  );
}
