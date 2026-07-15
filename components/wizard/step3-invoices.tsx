"use client";

import { useState, useTransition } from "react";
import { addInvoicesBatchAction } from "@/lib/actions/wizard";
import { dubaiTodayISODate } from "@/lib/dates";

type InvoiceRow = {
  invoiceNo: string;
  invoiceDate: string;
  supplier: string;
  invoiceValue: string;
  currency: string;
  paymentTerms: string;
  remarks: string;
};

const PAYMENT_TERMS = ["Net 30", "Net 45", "Advance Payment", "Letter of Credit"];

function emptyRow(): InvoiceRow {
  return { invoiceNo: "", invoiceDate: dubaiTodayISODate(), supplier: "", invoiceValue: "", currency: "AED", paymentTerms: "Net 30", remarks: "" };
}

export function Step3Invoices({
  shipmentId,
  currencies,
  onNext,
  onBack,
  onSaveAsDraft,
}: {
  shipmentId: string;
  currencies: string[];
  onNext: () => void;
  onBack: () => void;
  onSaveAsDraft: () => void;
}) {
  const [rows, setRows] = useState<InvoiceRow[]>([emptyRow()]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const totalsByCurrency = new Map<string, number>();
  for (const r of rows) {
    const v = parseFloat(r.invoiceValue);
    if (!isNaN(v)) totalsByCurrency.set(r.currency, (totalsByCurrency.get(r.currency) ?? 0) + v);
  }

  function updateRow(i: number, patch: Partial<InvoiceRow>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, emptyRow()]);
  }
  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
  }

  function handleSave(intent: "next" | "draft") {
    setError(null);
    const nonEmptyRows = rows.filter((r) => r.invoiceNo.trim() || r.invoiceValue.trim());
    startTransition(async () => {
      const result = await addInvoicesBatchAction(
        shipmentId,
        nonEmptyRows.map((r) => ({
          invoice_no: r.invoiceNo,
          invoice_date: r.invoiceDate,
          supplier: r.supplier,
          invoice_value: parseFloat(r.invoiceValue) || 0,
          currency_code: r.currency,
          payment_terms: r.paymentTerms,
          remarks: r.remarks,
        }))
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      if (intent === "draft") onSaveAsDraft();
      else onNext();
    });
  }

  return (
    <div>
      {error && <div className="mb-4 rounded-md bg-danger-light px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-surface-muted/40 p-3 sm:flex-row sm:divide-x sm:divide-border">
        <StatItem value={rows.filter((r) => r.invoiceNo.trim()).length.toString()} label="Number of Invoices" />
        <StatItem value={[...totalsByCurrency.entries()].map(([c, v]) => `${c} ${v.toLocaleString()}`).join(" + ") || "—"} label="Total by Currency" />
      </div>

      <div className="space-y-3">
        {rows.map((row, i) => (
          <div key={i} className="rounded-lg border border-border p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Invoice {i + 1}</span>
              {rows.length > 1 && (
                <button type="button" onClick={() => removeRow(i)} className="rounded-md border border-danger/40 px-2 py-1 text-xs font-medium text-danger hover:bg-danger-light">
                  Remove
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Invoice Number" required>
                <input value={row.invoiceNo} onChange={(e) => updateRow(i, { invoiceNo: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Invoice Date" required>
                <input type="date" value={row.invoiceDate} onChange={(e) => updateRow(i, { invoiceDate: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Supplier">
                <input value={row.supplier} onChange={(e) => updateRow(i, { supplier: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Invoice Value" required>
                <input type="number" min={0} step="0.01" value={row.invoiceValue} onChange={(e) => updateRow(i, { invoiceValue: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Currency" required>
                <select value={row.currency} onChange={(e) => updateRow(i, { currency: e.target.value })} className={inputClass}>
                  {currencies.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Payment Terms">
                <select value={row.paymentTerms} onChange={(e) => updateRow(i, { paymentTerms: e.target.value })} className={inputClass}>
                  {PAYMENT_TERMS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <div className="sm:col-span-3">
                <Field label="Invoice Remarks">
                  <input value={row.remarks} onChange={(e) => updateRow(i, { remarks: e.target.value })} className={inputClass} />
                </Field>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button type="button" onClick={addRow} className="mt-3 rounded-md bg-primary-light px-3 py-1.5 text-xs font-semibold text-primary-dark hover:bg-primary/20">
        + Add Invoice
      </button>

      <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
        <button type="button" onClick={() => handleSave("draft")} disabled={pending} className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted disabled:opacity-60">
          {pending ? "Saving…" : "Save as Draft"}
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={onBack} className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted">
            Back
          </button>
          <button type="button" onClick={() => handleSave("next")} disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60">
            {pending ? "Saving…" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-1 px-2 text-center">
      <div className="text-sm font-bold text-ink">{value}</div>
      <div className="text-[11px] text-ink-muted">{label}</div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-ink">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
    </div>
  );
}
