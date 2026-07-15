import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { InfoGrid, InfoItem, TabCard } from "@/components/ui/form";
import { CustomsUpdateModal } from "@/components/shipments/tabs/customs-update-modal";
import { STATUS_SEVERITY } from "@/lib/prototype-constants";
import { formatDubaiDate } from "@/lib/dates";

export default async function CustomsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: shipment, error }, { data: canEdit }] = await Promise.all([
    supabase
      .from("shipments")
      .select("ref, declaration_no, customs_status, customs_submission_date, customs_remarks, overall_status")
      .eq("id", id)
      .single(),
    supabase.rpc("has_permission", { p_permission: "edit_customs" }),
  ]);
  if (error || !shipment) notFound();

  const canAct = !!canEdit && shipment.overall_status !== "Completed";

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
        {canAct ? (
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
