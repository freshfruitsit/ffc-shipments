import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InvoiceForm } from "@/components/shipments/tabs/invoice-form";
import { formatDubaiDate, formatMoney } from "@/lib/dates";
import { getCurrencies } from "@/lib/data/master-data";

type InvoicesData = {
  invoices: {
    id: string; invoice_no: string; invoice_date: string; supplier_name_snapshot: string;
    invoice_value: number; currency_code: string; payment_terms: string | null; remarks: string | null;
  }[];
  totals_by_currency: Record<string, number>;
  illustrative_aed_total: number;
  can_edit: boolean;
};

export default async function InvoicesTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data, error }, currencies] = await Promise.all([
    supabase.rpc("get_shipment_invoices_tab", { p_shipment_id: id }),
    getCurrencies(),
  ]);
  if (error) {
    console.error("[invoices-tab] get_shipment_invoices_tab failed:", error.message);
    throw new Error("Couldn't load the invoices tab.");
  }
  if (!data) notFound();
  const tab = data as unknown as InvoicesData;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatBox value={tab.invoices.length.toString()} label="Invoices" />
        <StatBox
          value={Object.entries(tab.totals_by_currency).map(([c, v]) => formatMoney(v, c)).join(" + ") || "—"}
          label="Total by Currency"
        />
        <StatBox value={`AED ${Math.round(tab.illustrative_aed_total).toLocaleString()}`} label="Illustrative AED Total" />
      </div>

      <div className="space-y-3">
        {tab.invoices.length === 0 && (
          <p className="rounded-lg border border-dashed border-border bg-surface-muted/40 p-6 text-center text-sm text-ink-muted">
            No invoices added yet.
          </p>
        )}
        {tab.invoices.map((inv) => (
          <div key={inv.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-ink">{inv.invoice_no}</span>
              <span className="font-semibold text-ink">{formatMoney(inv.invoice_value, inv.currency_code)}</span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <InfoItem label="Invoice Date">{formatDubaiDate(inv.invoice_date)}</InfoItem>
              <InfoItem label="Supplier">{inv.supplier_name_snapshot}</InfoItem>
              <InfoItem label="Payment Terms">{inv.payment_terms ?? "—"}</InfoItem>
            </div>
            {inv.remarks && (
              <>
                <h4 className="mt-2 text-[12.5px] text-ink-muted">Remarks</h4>
                <p className="text-[12.5px] text-ink">{inv.remarks}</p>
              </>
            )}
          </div>
        ))}
      </div>

      {tab.can_edit && <InvoiceForm shipmentId={id} currencies={currencies} />}
      {!tab.can_edit && (
        <p className="text-xs text-ink-muted">
          You don&apos;t have permission to add invoices, or this shipment is Completed.
        </p>
      )}
    </div>
  );
}

function StatBox({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 text-center">
      <div className="text-[15px] font-bold text-ink">{value}</div>
      <div className="mt-0.5 text-[11px] text-ink-muted">{label}</div>
    </div>
  );
}

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10.5px] text-ink-muted">{label}</div>
      <div className="mt-0.5 text-[12.5px] font-semibold text-ink">{children}</div>
    </div>
  );
}
