"use client";

import { useState, useTransition } from "react";
import { updateDeliveryOrderAction, updateMofaicAction } from "@/lib/actions/portal-updates";

type Option = { id: string; name: string };

const DO_STATUSES = ["Not Required", "Pending", "Requested", "Received", "Uploaded", "Verified"];
const MOFAIC_STATUSES = ["Not Applicable", "Applicability Review", "Pending", "Payment Due", "Paid", "Overdue", "Completed", "Exception"];

export function Step6DeliveryMofaic({
  shipmentId,
  carriers,
  currencies,
  profiles,
  onNext,
  onBack,
  onSaveAsDraft,
}: {
  shipmentId: string;
  carriers: Option[];
  currencies: string[];
  profiles: Option[];
  onNext: () => void;
  onBack: () => void;
  onSaveAsDraft: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [carrierId, setCarrierId] = useState("");
  const [doStatus, setDoStatus] = useState("Pending");
  const [doReceivedDate, setDoReceivedDate] = useState("");
  const [doResponsible, setDoResponsible] = useState("");
  const [doRemarks, setDoRemarks] = useState("");

  const [mofaicStatus, setMofaicStatus] = useState("Applicability Review");
  const [mofaicRef, setMofaicRef] = useState("");
  const [mofaicPaymentAmount, setMofaicPaymentAmount] = useState("");
  const [mofaicCurrency, setMofaicCurrency] = useState("AED");
  const [mofaicPaymentDate, setMofaicPaymentDate] = useState("");
  const [mofaicResponsible, setMofaicResponsible] = useState("");
  const [mofaicRemarks, setMofaicRemarks] = useState("");

  function handleDoStatusChange(value: string) {
    setDoStatus(value);
    if (value === "Received" && !doReceivedDate) {
      setDoReceivedDate(new Date().toISOString().slice(0, 10));
    }
  }

  function handleNext() {
    setError(null);
    startTransition(async () => {
      const doForm = new FormData();
      doForm.set("shipment_id", shipmentId);
      doForm.set("carrier_id", carrierId);
      doForm.set("delivery_order_status", doStatus);
      doForm.set("delivery_order_received_date", doReceivedDate);
      doForm.set("delivery_order_responsible", doResponsible);
      doForm.set("delivery_order_remarks", doRemarks);
      const doResult = await updateDeliveryOrderAction({}, doForm);
      if (doResult.error) {
        setError(doResult.error);
        return;
      }

      const mofaicForm = new FormData();
      mofaicForm.set("shipment_id", shipmentId);
      mofaicForm.set("mofaic_status", mofaicStatus);
      mofaicForm.set("mofaic_ref", mofaicRef);
      mofaicForm.set("mofaic_payment_amount", mofaicPaymentAmount);
      mofaicForm.set("mofaic_currency", mofaicCurrency);
      mofaicForm.set("mofaic_payment_date", mofaicPaymentDate);
      mofaicForm.set("mofaic_responsible", mofaicResponsible);
      mofaicForm.set("mofaic_remarks", mofaicRemarks);
      const mofaicResult = await updateMofaicAction({}, mofaicForm);
      if (mofaicResult.error) {
        setError(mofaicResult.error);
        return;
      }

      onNext();
    });
  }

  return (
    <div>
      {error && <div className="mb-4 rounded-md bg-danger-light px-3 py-2 text-sm text-danger">{error}</div>}

      <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Delivery Order</h4>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Carrier / Handling Agent">
          <select value={carrierId} onChange={(e) => setCarrierId(e.target.value)} className={inputClass}>
            <option value="">Select carrier…</option>
            {carriers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Delivery Order Status">
          <select value={doStatus} onChange={(e) => handleDoStatusChange(e.target.value)} className={inputClass}>
            {DO_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Received Date">
          <input type="date" value={doReceivedDate} onChange={(e) => setDoReceivedDate(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Responsible User">
          <select value={doResponsible} onChange={(e) => setDoResponsible(e.target.value)} className={inputClass}>
            <option value="">Select user…</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-3">
          <Field label="Delivery Order Remarks">
            <textarea rows={2} value={doRemarks} onChange={(e) => setDoRemarks(e.target.value)} className={inputClass} />
          </Field>
        </div>
      </div>
      <p className="mt-2 text-[11.5px] text-ink-muted">
        Received Date fills in automatically once Delivery Order Status is set to &quot;Received&quot;, if left blank.
      </p>

      <h4 className="mb-2.5 mt-5 text-xs font-semibold uppercase tracking-wide text-ink-muted">MOFAIC Follow-up</h4>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="MOFAIC Status">
          <select value={mofaicStatus} onChange={(e) => setMofaicStatus(e.target.value)} className={inputClass}>
            {MOFAIC_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="MOFAIC Reference Number">
          <input value={mofaicRef} onChange={(e) => setMofaicRef(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Payment Amount">
          <input type="number" min={0} step="0.01" value={mofaicPaymentAmount} onChange={(e) => setMofaicPaymentAmount(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Currency">
          <select value={mofaicCurrency} onChange={(e) => setMofaicCurrency(e.target.value)} className={inputClass}>
            {currencies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Payment Date">
          <input type="date" value={mofaicPaymentDate} onChange={(e) => setMofaicPaymentDate(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Responsible User">
          <select value={mofaicResponsible} onChange={(e) => setMofaicResponsible(e.target.value)} className={inputClass}>
            <option value="">Select user…</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-3">
          <Field label="MOFAIC Remarks">
            <textarea rows={2} value={mofaicRemarks} onChange={(e) => setMofaicRemarks(e.target.value)} className={inputClass} />
          </Field>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
        <button type="button" onClick={onSaveAsDraft} className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted">
          Save as Draft
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={onBack} className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted">
            Back
          </button>
          <button type="button" onClick={handleNext} disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60">
            {pending ? "Saving…" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-ink">{label}</label>
      {children}
    </div>
  );
}
