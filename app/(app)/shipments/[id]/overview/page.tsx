import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDubaiDateTime } from "@/lib/dates";

export default async function OverviewTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: shipment, error } = await supabase
    .from("shipments")
    .select(
      "internal_ref, priority, awb, eta, packages, net_weight, gross_weight, notes, document_status, customs_status, municipality_status, delivery_order_status, mofaic_status, physical_doc_status, completion_eligible"
    )
    .eq("id", id)
    .single();

  if (error || !shipment) notFound();

  return (
    <div className="space-y-4">
      {shipment.completion_eligible && (
        <div className="rounded-lg border border-success/30 bg-success-light px-4 py-3 text-sm text-success">
          <strong className="font-semibold">Ready to complete.</strong> Every tracked sub-process has
          reached a terminal state. A Shipment Supervisor or Administrator can confirm completion.
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">Overview</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <Field label="Internal reference" value={shipment.internal_ref ?? "—"} />
          <Field label="Priority" value={shipment.priority} />
          <Field label="AWB" value={shipment.awb ?? "—"} />
          <Field label="ETA" value={formatDubaiDateTime(shipment.eta)} />
          <Field label="Packages" value={shipment.packages?.toString() ?? "—"} />
          <Field
            label="Weight (net / gross)"
            value={`${shipment.net_weight ?? "—"} / ${shipment.gross_weight ?? "—"} kg`}
          />
        </dl>
        {shipment.notes && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Notes</p>
            <p className="mt-1 text-sm text-ink">{shipment.notes}</p>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Sub-process statuses
        </h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <StatusField label="Documents" status={shipment.document_status} />
          <StatusField label="Dubai Customs" status={shipment.customs_status} />
          <StatusField label="Dubai Municipality" status={shipment.municipality_status} />
          <StatusField label="Delivery Order" status={shipment.delivery_order_status} />
          <StatusField label="MOFAIC" status={shipment.mofaic_status} />
          <StatusField label="Physical Documents" status={shipment.physical_doc_status} />
        </dl>
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

function StatusField({ label, status }: { label: string; status: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-1">
        <StatusBadge status={status} />
      </dd>
    </div>
  );
}
