import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { InfoGrid, InfoItem, TabCard } from "@/components/ui/form";
import { formatDubaiDate, formatDubaiDateTime } from "@/lib/dates";

type OverviewData = {
  internal_ref: string | null; mode: string; category_name: string | null; branch_name: string | null;
  priority: string; coordinator_name: string | null; created_at: string; packages: number | null;
  net_weight: number | null; gross_weight: number | null; notes: string | null; completion_eligible: boolean;
  related_shipments: { id: string; ref: string; shipment_date: string; overall_status: string }[];
};

export default async function OverviewTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // One RPC replaces what used to be a shipment fetch plus three separate
  // name lookups (category, branch, coordinator) plus a related-shipments
  // query — all joined server-side now.
  const { data, error } = await supabase.rpc("get_shipment_overview_tab", { p_shipment_id: id });
  if (error) {
    console.error("[overview-tab] get_shipment_overview_tab failed:", error.message);
    throw new Error("Couldn't load the overview tab.");
  }
  if (!data) notFound();
  const shipment = data as unknown as OverviewData;

  return (
    <div className="space-y-4">
      {shipment.completion_eligible && (
        <div className="rounded-lg border border-success/30 bg-success-light px-4 py-3 text-sm text-success">
          <strong className="font-semibold">Ready to complete.</strong> Every tracked sub-process has
          reached a terminal state. A Shipment Supervisor or Administrator can confirm completion.
        </div>
      )}

      <TabCard>
        <InfoGrid>
          <InfoItem label="Internal Reference">{shipment.internal_ref ?? "—"}</InfoItem>
          <InfoItem label="Shipment Mode">{shipment.mode}</InfoItem>
          <InfoItem label="Category">{shipment.category_name ?? "—"}</InfoItem>
          <InfoItem label="Branch">{shipment.branch_name ?? "—"}</InfoItem>
          <InfoItem label="Priority">{shipment.priority}</InfoItem>
          <InfoItem label="Coordinator">{shipment.coordinator_name ?? "—"}</InfoItem>
          <InfoItem label="Created Date">{formatDubaiDateTime(shipment.created_at)}</InfoItem>
          <InfoItem label="Packages">{shipment.packages ?? "—"}</InfoItem>
          <InfoItem label="Net / Gross Weight">{`${shipment.net_weight ?? "—"} / ${shipment.gross_weight ?? "—"} kg`}</InfoItem>
        </InfoGrid>

        <h4 className="mt-3.5 text-[12.5px] text-ink-muted">Notes</h4>
        <p className="text-[12.5px] text-ink">{shipment.notes || "—"}</p>

        <h4 className="mt-3.5 text-[12.5px] text-ink-muted">Related Shipments (same supplier)</h4>
        {shipment.related_shipments.length === 0 ? (
          <p className="text-[12.5px] text-ink-muted">No other shipments from this supplier.</p>
        ) : (
          <div className="mt-2 overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-muted text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  <th className="px-3 py-2">Ref</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {shipment.related_shipments.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-primary-light/40">
                    <td className="px-3 py-2">
                      <Link href={`/shipments/${r.id}/overview`} className="font-medium text-primary-dark hover:underline">
                        {r.ref}
                      </Link>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-ink-muted">{formatDubaiDate(r.shipment_date)}</td>
                    <td className="px-3 py-2"><StatusBadge status={r.overall_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TabCard>
    </div>
  );
}
