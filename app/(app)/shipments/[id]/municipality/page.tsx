import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { InfoGrid, InfoItem, TabCard } from "@/components/ui/form";
import { MunicipalityUpdateModal } from "@/components/shipments/tabs/municipality-update-modal";
import { STATUS_SEVERITY } from "@/lib/prototype-constants";
import { formatDubaiDate } from "@/lib/dates";

export default async function MunicipalityTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: shipment, error }, { data: canEdit }] = await Promise.all([
    supabase
      .from("shipments")
      .select("ref, municipality_draft_ref, municipality_submitted_ref, municipality_status, municipality_submission_date, municipality_completion_date, municipality_remarks, overall_status")
      .eq("id", id)
      .single(),
    supabase.rpc("has_permission", { p_permission: "edit_customs" }),
  ]);
  if (error || !shipment) notFound();

  const canAct = !!canEdit && shipment.overall_status !== "Completed";

  return (
    <TabCard>
      <InfoGrid>
        <InfoItem label="Municipality Draft Ref">{shipment.municipality_draft_ref ?? "—"}</InfoItem>
        <InfoItem label="Municipality Submitted Ref">{shipment.municipality_submitted_ref ?? "—"}</InfoItem>
        <InfoItem label="Municipality Status">
          <StatusBadge status={shipment.municipality_status} criticalList={[...STATUS_SEVERITY.municipality.critical]} warnList={[...STATUS_SEVERITY.municipality.warn]} />
        </InfoItem>
        <InfoItem label="Submission Date">{shipment.municipality_submission_date ? formatDubaiDate(shipment.municipality_submission_date) : "—"}</InfoItem>
        <InfoItem label="Completion Date">{shipment.municipality_completion_date ? formatDubaiDate(shipment.municipality_completion_date) : "—"}</InfoItem>
      </InfoGrid>

      <h4 className="mt-3.5 text-[12.5px] text-ink-muted">Authority Remarks</h4>
      <p className="text-[12.5px] text-ink">{shipment.municipality_remarks || "—"}</p>

      <div className="mt-4">
        {canAct ? (
          <MunicipalityUpdateModal shipmentId={id} shipmentRef={shipment.ref} shipment={shipment} />
        ) : (
          <p className="text-xs text-ink-muted">
            You don&apos;t have permission to edit municipality details, or this shipment is Completed.
          </p>
        )}
      </div>
    </TabCard>
  );
}
