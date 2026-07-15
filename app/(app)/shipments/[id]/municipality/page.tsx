import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { InfoGrid, InfoItem, TabCard } from "@/components/ui/form";
import { MunicipalityUpdateModal } from "@/components/shipments/tabs/municipality-update-modal";
import { STATUS_SEVERITY } from "@/lib/prototype-constants";
import { formatDubaiDate } from "@/lib/dates";

type MunicipalityData = {
  ref: string; municipality_draft_ref: string | null; municipality_submitted_ref: string | null;
  municipality_status: string; municipality_submission_date: string | null;
  municipality_completion_date: string | null; municipality_remarks: string | null; can_edit: boolean;
};

export default async function MunicipalityTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_shipment_municipality_tab", { p_shipment_id: id });
  if (error) {
    console.error("[municipality-tab] get_shipment_municipality_tab failed:", error.message);
    throw new Error("Couldn't load the municipality tab.");
  }
  if (!data) notFound();
  const shipment = data as unknown as MunicipalityData;

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
        {shipment.can_edit ? (
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
