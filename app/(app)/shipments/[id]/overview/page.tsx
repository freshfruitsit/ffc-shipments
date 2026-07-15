import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/status-badge";
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

      <div className="rounded-xl border border-border bg-surface p-6">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
          <Field label="Internal Reference" value={shipment.internal_ref ?? "—"} />
          <Field label="Shipment Mode" value={shipment.mode} />
          <Field label="Category" value={category?.name ?? "—"} />
          <Field label="Branch" value={branch?.name ?? "—"} />
          <Field label="Priority" value={shipment.priority} />
          <Field label="Coordinator" value={coordinatorProfile?.full_name ?? "—"} />
          <Field label="Created Date" value={formatDubaiDateTime(shipment.created_at)} />
          <Field label="Packages" value={shipment.packages?.toString() ?? "—"} />
          <Field label="Net / Gross Weight" value={`${shipment.net_weight ?? "—"} / ${shipment.gross_weight ?? "—"} kg`} />
        </dl>

        <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Notes</h4>
        <p className="mt-1 text-sm text-ink">{shipment.notes || "—"}</p>

        <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Related Shipments (same supplier)
        </h4>
        {!related || related.length === 0 ? (
          <p className="mt-1 text-sm text-ink-muted">No other shipments from this supplier.</p>
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
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  );
}
