"use client";

import { useActionState, useEffect, useState, useRef } from "react";
import { updateTransportAction, type ActionState } from "@/lib/actions/shipment-detail";
import { WizardNav } from "@/components/wizard/wizard-nav";

type Option = { id: string; name: string };
const initialState: ActionState = {};

export function Step2Transport({
  shipmentId,
  airlines,
  ports,
  freightAgents,
  clearingAgents,
  onNext,
  onBack,
  onSaveAsDraft,
}: {
  shipmentId: string;
  airlines: Option[];
  ports: Option[];
  freightAgents: Option[];
  clearingAgents: Option[];
  onNext: () => void;
  onBack: () => void;
  onSaveAsDraft: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateTransportAction, initialState);
  const [etaDate, setEtaDate] = useState("");
  const [etaTime, setEtaTime] = useState("");
  // Save as Draft now submits this exact form too (see wizard-nav.tsx) —
  // this tracks which button was clicked so the effect below can save
  // AND still navigate to the shipment's overview once it completes,
  // instead of the old behavior where "Save as Draft" skipped the save
  // entirely and just discarded whatever was on this page.
  const intentRef = useRef<"next" | "draft">("next");

  useEffect(() => {
    if (state.success) {
      if (intentRef.current === "draft") onSaveAsDraft();
      else onNext();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <form action={formAction}>
      <input type="hidden" name="shipment_id" value={shipmentId} />
      <input type="hidden" name="eta" value={etaDate ? `${etaDate}T${etaTime || "00:00"}` : ""} />
      {state.error && <div className="mb-4 rounded-md bg-danger-light px-3 py-2 text-sm text-danger">{state.error}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="AWB Number" required error={state.fieldErrors?.awb}>
          <input name="awb" required className={inputClass} />
        </Field>
        <Field label="Airline" required>
          <select name="airline_id" required className={inputClass}>
            <option value="">Select airline…</option>
            {airlines.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Flight Number" required>
          <input name="flight" required className={inputClass} />
        </Field>
        <Field label="ETA Date" required>
          <input type="date" required value={etaDate} onChange={(e) => setEtaDate(e.target.value)} className={inputClass} />
        </Field>
        <Field label="ETA Time" required>
          <input type="time" required value={etaTime} onChange={(e) => setEtaTime(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Arrival Port" required>
          <select name="port_id" required className={inputClass}>
            <option value="">Select port…</option>
            {ports.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Clearing Agent">
          <select name="clearing_agent_id" className={inputClass}>
            <option value="">Select agent…</option>
            {clearingAgents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Number of Packages">
          <input type="number" min={0} name="packages" className={inputClass} />
        </Field>
        <Field label="Net Weight (kg)" required error={state.fieldErrors?.net_weight}>
          <input type="number" min={0} step="0.01" name="net_weight" required className={inputClass} />
        </Field>
        <Field label="Gross Weight (kg)" required error={state.fieldErrors?.gross_weight}>
          <input type="number" min={0} step="0.01" name="gross_weight" required className={inputClass} />
        </Field>
        <Field label="Freight Agent">
          <select name="freight_agent_id" className={inputClass}>
            <option value="">Select agent…</option>
            {freightAgents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-4">
        <Field label="Transport Remarks">
          <textarea name="transport_remarks" rows={2} className={inputClass} />
        </Field>
      </div>

      <WizardNav onBack={onBack} onIntentClick={(intent) => (intentRef.current = intent)} nextDisabled={pending} nextLabel={pending ? "Saving…" : "Next"} />
    </form>
  );
}

const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-ink">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
