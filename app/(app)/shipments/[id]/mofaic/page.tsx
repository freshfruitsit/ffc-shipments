import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { InfoGrid, InfoItem, TabCard } from "@/components/ui/form";
import { MofaicUpdateModal } from "@/components/shipments/tabs/mofaic-update-modal";
import { STATUS_SEVERITY } from "@/lib/prototype-constants";
import { getCurrencies } from "@/lib/data/master-data";
import { getProfilesForPermission } from "@/lib/data/profiles-by-permission";
import { formatDubaiDate, formatMoney } from "@/lib/dates";

type MofaicData = {
  ref: string; applicable: boolean; mofaic_status: string; mofaic_ref: string | null;
  due_date: string | null; days_left: number | null; payment_amount: number | null;
  mofaic_currency: string | null; payment_date: string | null; mofaic_responsible: string | null;
  responsible_name: string | null; mofaic_remarks: string | null; can_edit: boolean;
};

export default async function MofaicTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data, error }, currencies, eligibleProfiles] = await Promise.all([
    supabase.rpc("get_shipment_mofaic_tab", { p_shipment_id: id }),
    getCurrencies(),
    getProfilesForPermission(supabase, "edit_mofaic"),
  ]);
  if (error) {
    console.error("[mofaic-tab] get_shipment_mofaic_tab failed:", error.message);
    throw new Error("Couldn't load the MOFAIC tab.");
  }
  if (!data) notFound();
  const shipment = data as unknown as MofaicData;

  const dueDateDisplay = shipment.due_date
    ? formatDubaiDate(shipment.due_date) +
      (shipment.days_left != null ? (shipment.days_left < 0 ? ` (${Math.abs(shipment.days_left)}d overdue)` : ` (${shipment.days_left}d left)`) : "")
    : "—";

  return (
    <TabCard>
      <InfoGrid>
        <InfoItem label="Applicable">{shipment.applicable ? "Yes" : "No"}</InfoItem>
        <InfoItem label="MOFAIC Status">
          <StatusBadge status={shipment.mofaic_status} criticalList={[...STATUS_SEVERITY.mofaic.critical]} warnList={[...STATUS_SEVERITY.mofaic.warn]} />
        </InfoItem>
        <InfoItem label="Reference">{shipment.mofaic_ref ?? "—"}</InfoItem>
        <InfoItem label="Due Date">{dueDateDisplay}</InfoItem>
        <InfoItem label="Payment Amount">{formatMoney(shipment.payment_amount, shipment.mofaic_currency)}</InfoItem>
        <InfoItem label="Payment Date">{shipment.payment_date ? formatDubaiDate(shipment.payment_date) : "—"}</InfoItem>
        <InfoItem label="Responsible">{shipment.responsible_name ?? "—"}</InfoItem>
      </InfoGrid>

      <h4 className="mt-3.5 text-[12.5px] text-ink-muted">Remarks</h4>
      <p className="text-[12.5px] text-ink">{shipment.mofaic_remarks || "—"}</p>

      <div className="mt-4">
        {shipment.can_edit ? (
          <MofaicUpdateModal
            shipmentId={id}
            shipmentRef={shipment.ref}
            shipment={{
              mofaic_status: shipment.mofaic_status, mofaic_ref: shipment.mofaic_ref,
              mofaic_payment_amount: shipment.payment_amount, mofaic_currency: shipment.mofaic_currency,
              mofaic_payment_date: shipment.payment_date, mofaic_responsible: shipment.mofaic_responsible, mofaic_remarks: shipment.mofaic_remarks,
            }}
            currencies={currencies}
            profiles={eligibleProfiles.map((p) => ({ id: p.id, name: p.full_name }))}
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
