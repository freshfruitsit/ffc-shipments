import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { InfoGrid, InfoItem, TabCard } from "@/components/ui/form";
import { CustomsUpdateModal } from "@/components/shipments/tabs/customs-update-modal";
import { STATUS_SEVERITY } from "@/lib/prototype-constants";
import { formatDubaiDate } from "@/lib/dates";

type CustomsData = {
  ref: string; declaration_no: string | null; customs_status: string;
  customs_submission_date: string | null; customs_remarks: string | null; can_edit: boolean;
};

export default async function CustomsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_shipment_customs_tab", { p_shipment_id: id });
  if (error) {
    console.error("[customs-tab] get_shipment_customs_tab failed:", error.message);
    throw new Error("Couldn't load the customs tab.");
  }
  if (!data) notFound();
  const shipment = data as unknown as CustomsData;

  return (
    <TabCard>
      <InfoGrid>
        <InfoItem label="Declaration #">{shipment.declaration_no ?? "—"}</InfoItem>
        <InfoItem label="Customs Status">
          <StatusBadge status={shipment.customs_status} criticalList={[...STATUS_SEVERITY.customs.critical]} warnList={[...STATUS_SEVERITY.customs.warn]} />
        </InfoItem>
        <InfoItem label="Submission Date">{shipment.customs_submission_date ? formatDubaiDate(shipment.customs_submission_date) : "—"}</InfoItem>
      </InfoGrid>

      <h4 className="mt-3.5 text-[12.5px] text-ink-muted">Remarks</h4>
      <p className="text-[12.5px] text-ink">{shipment.customs_remarks || "—"}</p>

      <div className="mt-4">
        {shipment.can_edit ? (
          <CustomsUpdateModal shipmentId={id} shipmentRef={shipment.ref} shipment={shipment} />
        ) : (
          <p className="text-xs text-ink-muted">
            You don&apos;t have permission to edit customs details, or this shipment is Completed.
          </p>
        )}
      </div>
    </TabCard>
  );
}
