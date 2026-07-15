import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { InfoGrid, InfoItem, TabCard } from "@/components/ui/form";
import { MofaicUpdateModal } from "@/components/shipments/tabs/mofaic-update-modal";
import { STATUS_SEVERITY } from "@/lib/prototype-constants";
import { getCurrencies } from "@/lib/data/master-data";
import { formatDubaiDate, formatMoney, daysFromDubaiNow } from "@/lib/dates";

export default async function MofaicTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: shipment, error }, currencies, { data: profiles }, { data: rules }, { data: canEdit }] = await Promise.all([
    supabase
      .from("shipments")
      .select("ref, mofaic_status, mofaic_ref, mofaic_payment_amount, mofaic_currency, mofaic_payment_date, mofaic_responsible, mofaic_remarks, delivery_order_received_date, overall_status")
      .eq("id", id)
      .single(),
    getCurrencies(),
    supabase.from("v_assignable_profiles").select("id, full_name").order("full_name"),
    supabase.from("mofaic_rules").select("payment_window_days").eq("id", 1).single(),
    supabase.rpc("has_permission", { p_permission: "edit_mofaic" }),
  ]);
  if (error || !shipment) notFound();

  const applicable = shipment.mofaic_status !== "Not Applicable";
  const responsibleName = profiles?.find((p) => p.id === shipment.mofaic_responsible)?.full_name ?? "—";

  let dueDateDisplay = "—";
  if (applicable && shipment.delivery_order_received_date && rules?.payment_window_days) {
    const due = new Date(shipment.delivery_order_received_date);
    due.setDate(due.getDate() + rules.payment_window_days);
    const daysLeft = daysFromDubaiNow(due.toISOString());
    dueDateDisplay =
      formatDubaiDate(due.toISOString()) + (daysLeft != null ? (daysLeft < 0 ? ` (${Math.abs(daysLeft)}d overdue)` : ` (${daysLeft}d left)`) : "");
  }

  const canAct = !!canEdit && shipment.overall_status !== "Completed";

  return (
    <TabCard>
      <InfoGrid>
        <InfoItem label="Applicable">{applicable ? "Yes" : "No"}</InfoItem>
        <InfoItem label="MOFAIC Status">
          <StatusBadge status={shipment.mofaic_status} criticalList={[...STATUS_SEVERITY.mofaic.critical]} warnList={[...STATUS_SEVERITY.mofaic.warn]} />
        </InfoItem>
        <InfoItem label="Reference">{shipment.mofaic_ref ?? "—"}</InfoItem>
        <InfoItem label="Due Date">{dueDateDisplay}</InfoItem>
        <InfoItem label="Payment Amount">{formatMoney(shipment.mofaic_payment_amount, shipment.mofaic_currency)}</InfoItem>
        <InfoItem label="Payment Date">{shipment.mofaic_payment_date ? formatDubaiDate(shipment.mofaic_payment_date) : "—"}</InfoItem>
        <InfoItem label="Responsible">{responsibleName}</InfoItem>
      </InfoGrid>

      <h4 className="mt-3.5 text-[12.5px] text-ink-muted">Remarks</h4>
      <p className="text-[12.5px] text-ink">{shipment.mofaic_remarks || "—"}</p>

      <div className="mt-4">
        {canAct ? (
          <MofaicUpdateModal
            shipmentId={id}
            shipmentRef={shipment.ref}
            shipment={shipment}
            currencies={currencies}
            profiles={(profiles ?? []).map((p) => ({ id: p.id, name: p.full_name }))}
          />
        ) : (
          <p className="text-xs text-ink-muted">
            You don&apos;t have permission to edit MOFAIC details, or this shipment is Completed.
          </p>
        )}
      </div>
    </TabCard>
  );
}
