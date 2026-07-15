import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InvoiceForm } from "@/components/shipments/tabs/invoice-form";
import { formatDubaiDate } from "@/lib/dates";
import { getCurrencies } from "@/lib/data/master-data";

export default async function InvoicesTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: shipment, error } = await supabase.from("shipments").select("overall_status").eq("id", id).single();
  if (error || !shipment) notFound();

  const [{ data: invoices }, currencies, { data: canEdit }] = await Promise.all([
    supabase.from("invoices").select("*").eq("shipment_id", id).order("created_at", { ascending: false }),
    getCurrencies(),
    supabase.rpc("has_permission", { p_permission: "edit_invoice" }),
  ]);

  const canAdd = !!canEdit && shipment.overall_status !== "Completed";

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-muted text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-3">Invoice No.</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Value</th>
              <th className="px-4 py-3">Currency</th>
            </tr>
          </thead>
          <tbody>
            {(!invoices || invoices.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-ink-muted">
                  No invoices added yet.
                </td>
              </tr>
            )}
            {invoices?.map((inv) => (
              <tr key={inv.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{inv.invoice_no}</td>
                <td className="px-4 py-3 tabular-nums text-ink-muted">{formatDubaiDate(inv.invoice_date)}</td>
                <td className="px-4 py-3 text-ink">{inv.supplier_name_snapshot}</td>
                <td className="px-4 py-3 tabular-nums text-ink">{inv.invoice_value.toLocaleString()}</td>
                <td className="px-4 py-3 text-ink-muted">{inv.currency_code}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canAdd && <InvoiceForm shipmentId={id} currencies={currencies} />}
      {!canAdd && (
        <p className="text-xs text-ink-muted">
          You don&apos;t have permission to add invoices, or this shipment is Completed.
        </p>
      )}
    </div>
  );
}
