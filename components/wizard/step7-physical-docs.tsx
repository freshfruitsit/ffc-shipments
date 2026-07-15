"use client";

import { useState, useTransition } from "react";
import { updatePhysicalDocumentsAction } from "@/lib/actions/portal-updates";

type Option = { id: string; name: string };
const STATUSES = ["Not Required", "Originals Pending", "Ready for Dispatch", "Dispatched", "In Transit", "Delivered", "Proof of Delivery Received", "Closed"];

export function Step7PhysicalDocs({
  shipmentId,
  couriers,
  profiles,
  onNext,
  onBack,
  onSaveAsDraft,
}: {
  shipmentId: string;
  couriers: Option[];
  profiles: Option[];
  onNext: () => void;
  onBack: () => void;
  onSaveAsDraft: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [status, setStatus] = useState("Originals Pending");
  const [courierCompanyId, setCourierCompanyId] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [dispatchDate, setDispatchDate] = useState("");
  const [deliveredDate, setDeliveredDate] = useState("");
  const [responsible, setResponsible] = useState("");
  const [remarks, setRemarks] = useState("");

  function handleNext() {
    setError(null);
    startTransition(async () => {
      const form = new FormData();
      form.set("shipment_id", shipmentId);
      form.set("physical_doc_status", status);
      form.set("courier_company_id", courierCompanyId);
      form.set("tracking_number", trackingNumber);
      form.set("dispatch_date", dispatchDate);
      form.set("delivered_date", deliveredDate);
      form.set("physical_docs_responsible", responsible);
      form.set("physical_docs_remarks", remarks);
      const result = await updatePhysicalDocumentsAction({}, form);
      if (result.error) {
        setError(result.error);
        return;
      }
      onNext();
    });
  }

  return (
    <div>
      {error && <div className="mb-4 rounded-md bg-danger-light px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Physical Document Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Courier Company">
          <select value={courierCompanyId} onChange={(e) => setCourierCompanyId(e.target.value)} className={inputClass}>
            <option value="">Select courier…</option>
            {couriers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Tracking Number">
          <input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Dispatch Date">
          <input type="date" value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Delivered Date">
          <input type="date" value={deliveredDate} onChange={(e) => setDeliveredDate(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Responsible User">
          <select value={responsible} onChange={(e) => setResponsible(e.target.value)} className={inputClass}>
            <option value="">Select user…</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-3">
          <Field label="Physical Documents Remarks">
            <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} className={inputClass} />
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
