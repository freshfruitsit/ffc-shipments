import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InvoiceForm } from "@/components/shipments/tabs/invoice-form";
import { formatDubaiDate, formatMoney } from "@/lib/dates";
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

  // Stat strip: invoice count, total grouped by currency, and an
  // illustrative AED-equivalent total using the latest available fx_rates
  // row per currency — "illustrative" because fx_rates is manually entered
  // reference data, not a live feed (matching the prototype's own framing).
  const totalsByCurrency = new Map<string, number>();
  for (const inv of invoices ?? []) {
    totalsByCurrency.set(inv.currency_code, (totalsByCurrency.get(inv.currency_code) ?? 0) + inv.invoice_value);
  }
  const currencyCodes = [...totalsByCurrency.keys()];
  let aedTotal: number | null = null;
  if (currencyCodes.length > 0) {
    const { data: rates } = await supabase
      .from("fx_rates")
      .select("currency_code, rate_to_aed, effective_date")
      .in("currency_code", currencyCodes)
      .order("effective_date", { ascending: false });
    const latestRateByCurrency = new Map<string, number>();
    for (const r of rates ?? []) {
      if (!latestRateByCurrency.has(r.currency_code)) latestRateByCurrency.set(r.currency_code, r.rate_to_aed);
    }
    if ([...totalsByCurrency.keys()].every((c) => c === "AED" || latestRateByCurrency.has(c))) {
      aedTotal = [...totalsByCurrency.entries()].reduce(
        (sum, [cur, val]) => sum + val * (cur === "AED" ? 1 : latestRateByCurrency.get(cur)!),
        0
      );
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatBox value={(invoices?.length ?? 0).toString()} label="Invoices" />
        <StatBox
          value={[...totalsByCurrency.entries()].map(([cur, val]) => formatMoney(val, cur)).join(" + ") || "—"}
          label="Total by Currency"
        />
        <StatBox
          value={aedTotal != null ? `AED ${Math.round(aedTotal).toLocaleString()}` : "—"}
          label="Illustrative AED Total"
        />
      </div>

      <div className="space-y-3">
        {(!invoices || invoices.length === 0) && (
          <p className="rounded-lg border border-dashed border-border bg-surface-muted/40 p-6 text-center text-sm text-ink-muted">
            No invoices added yet.
          </p>
        )}
        {invoices?.map((inv) => (
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

      {canAdd && <InvoiceForm shipmentId={id} currencies={currencies} />}
      {!canAdd && (
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
