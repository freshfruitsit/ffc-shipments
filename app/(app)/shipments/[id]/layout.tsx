import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { ShipmentTabs } from "@/components/shipments/tabs/shipment-tabs";
import { ShipmentStepper } from "@/components/shipments/tabs/shipment-stepper";
import { ShipmentActionBar } from "@/components/shipments/tabs/shipment-action-bar";
import { formatDubaiDateTime, formatMoney } from "@/lib/dates";

export default async function ShipmentDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: shipment, error } = await supabase
    .from("shipments")
    .select(
      "ref, mode, shipment_date, supplier_name_snapshot, overall_status, priority, responsible, eta, awb, flight, port_id, physical_doc_status, updated_at, document_status"
    )
    .eq("id", id)
    .single();

  if (error || !shipment) {
    notFound();
  }

  const [
    { data: port },
    { data: responsibleProfile },
    { data: invoiceTotals },
    { data: assignableProfiles },
    { data: transitions },
    { data: canAssign },
    { data: canChangeStatus },
    { data: canRaiseException },
    { data: canEdit },
  ] = await Promise.all([
    shipment.port_id ? supabase.from("ports").select("name").eq("id", shipment.port_id).single() : Promise.resolve({ data: null }),
    shipment.responsible
      ? supabase.from("v_assignable_profiles").select("full_name").eq("id", shipment.responsible).single()
      : Promise.resolve({ data: null }),
    supabase.from("invoices").select("invoice_value, currency_code").eq("shipment_id", id),
    supabase.from("v_assignable_profiles").select("id, full_name").order("full_name"),
    supabase.from("status_transitions").select("to_status, requires_reason").eq("from_status", shipment.overall_status),
    supabase.rpc("has_permission", { p_permission: "assign" }),
    supabase.rpc("has_permission", { p_permission: "approve_status_change" }),
    supabase.rpc("has_permission", { p_permission: "manage_exceptions" }),
    supabase.rpc("has_permission", { p_permission: "edit_basic" }),
  ]);

  const totalsByCurrency = new Map<string, number>();
  for (const inv of invoiceTotals ?? []) {
    totalsByCurrency.set(inv.currency_code, (totalsByCurrency.get(inv.currency_code) ?? 0) + inv.invoice_value);
  }
  const invoiceTotalDisplay =
    totalsByCurrency.size > 0
      ? [...totalsByCurrency.entries()].map(([cur, val]) => formatMoney(val, cur)).join(", ")
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
            assignableProfiles={assignableProfiles ?? []}
            validTransitions={transitions ?? []}
            permissions={{
              assign: !!canAssign,
              changeStatus: !!canChangeStatus,
              raiseException: !!canRaiseException,
              edit: !!canEdit,
            }}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-4 text-sm sm:grid-cols-3 lg:grid-cols-5">
          <MetaItem label="Overall Status"><StatusBadge status={shipment.overall_status} /></MetaItem>
          <MetaItem label="Priority"><StatusBadge status={shipment.priority} priority /></MetaItem>
          <MetaItem label="Responsible User">{responsibleProfile?.full_name ?? "—"}</MetaItem>
          <MetaItem label="ETA">{formatDubaiDateTime(shipment.eta)}</MetaItem>
          <MetaItem label="Total Invoice Value">{invoiceTotalDisplay}</MetaItem>
          <MetaItem label="AWB / Flight">{`${shipment.awb ?? "—"} / ${shipment.flight ?? "—"}`}</MetaItem>
          <MetaItem label="Port">{port?.name ?? "—"}</MetaItem>
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
