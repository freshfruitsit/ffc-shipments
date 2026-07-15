import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { InfoGrid, InfoItem, TabCard } from "@/components/ui/form";
import { formatDubaiDate, formatDubaiDateTime } from "@/lib/dates";

export default async function OverviewTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: shipment, error } = await supabase
    .from("shipments")
    .select(
      "internal_ref, mode, category_id, branch_id, priority, coordinator, created_at, packages, net_weight, gross_weight, notes, supplier_name_snapshot, completion_eligible"
    )
    .eq("id", id)
    .single();
  if (error || !shipment) notFound();

  const [{ data: category }, { data: branch }, { data: coordinatorProfile }, { data: related }] = await Promise.all([
    shipment.category_id ? supabase.from("shipment_categories").select("name").eq("id", shipment.category_id).single() : Promise.resolve({ data: null }),
    supabase.from("branches").select("name").eq("id", shipment.branch_id).single(),
    shipment.coordinator
      ? supabase.from("v_assignable_profiles").select("full_name").eq("id", shipment.coordinator).single()
      : Promise.resolve({ data: null }),
    supabase
      .from("shipments")
      .select("id, ref, shipment_date, overall_status")
      .eq("supplier_name_snapshot", shipment.supplier_name_snapshot)
      .neq("id", id)
      .order("shipment_date", { ascending: false })
      .limit(10),
  ]);

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
          <InfoItem label="Category">{category?.name ?? "—"}</InfoItem>
          <InfoItem label="Branch">{branch?.name ?? "—"}</InfoItem>
          <InfoItem label="Priority">{shipment.priority}</InfoItem>
          <InfoItem label="Coordinator">{coordinatorProfile?.full_name ?? "—"}</InfoItem>
          <InfoItem label="Created Date">{formatDubaiDateTime(shipment.created_at)}</InfoItem>
          <InfoItem label="Packages">{shipment.packages ?? "—"}</InfoItem>
          <InfoItem label="Net / Gross Weight">{`${shipment.net_weight ?? "—"} / ${shipment.gross_weight ?? "—"} kg`}</InfoItem>
        </InfoGrid>

        <h4 className="mt-3.5 text-[12.5px] text-ink-muted">Notes</h4>
        <p className="text-[12.5px] text-ink">{shipment.notes || "—"}</p>

        <h4 className="mt-3.5 text-[12.5px] text-ink-muted">Related Shipments (same supplier)</h4>
        {!related || related.length === 0 ? (
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
                {related.map((r) => (
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
