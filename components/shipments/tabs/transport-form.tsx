"use client";

import { useActionState } from "react";
import { updateTransportAction, type ActionState } from "@/lib/actions/shipment-detail";
import { Field, FormCard, FormError, FormSuccess, inputClass, selectClass } from "@/components/ui/form";

type Option = { id: string; name: string };
type Shipment = {
  awb: string | null; airline_id: string | null; flight: string | null; eta: string | null;
  port_id: string | null; freight_agent_id: string | null; clearing_agent_id: string | null;
  packages: number | null; net_weight: number | null; gross_weight: number | null; transport_remarks: string | null;
};

const initialState: ActionState = {};

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 16);
}

export function TransportForm({
  shipmentId,
  shipment,
  airlines,
  ports,
  freightAgents,
  clearingAgents,
  readOnly,
}: {
  shipmentId: string;
  shipment: Shipment;
  airlines: Option[];
  ports: Option[];
  freightAgents: Option[];
  clearingAgents: Option[];
  readOnly: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateTransportAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="shipment_id" value={shipmentId} />
      <FormCard>
        <FormError message={state.error} />
        {state.success && <FormSuccess message="Transport details saved." />}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="AWB" error={state.fieldErrors?.awb}>
            <input name="awb" defaultValue={shipment.awb ?? ""} disabled={readOnly} className={inputClass} />
          </Field>
          <Field label="Airline">
            <select name="airline_id" defaultValue={shipment.airline_id ?? ""} disabled={readOnly} className={selectClass}>
              <option value="">Select airline…</option>
              {airlines.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Flight">
            <input name="flight" defaultValue={shipment.flight ?? ""} disabled={readOnly} className={inputClass} />
          </Field>
          <Field label="ETA">
            <input
              type="datetime-local"
              name="eta"
              defaultValue={toDatetimeLocal(shipment.eta)}
              disabled={readOnly}
              className={inputClass}
            />
          </Field>
          <Field label="Arrival port">
            <select name="port_id" defaultValue={shipment.port_id ?? ""} disabled={readOnly} className={selectClass}>
              <option value="">Select port…</option>
              {ports.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Freight agent">
            <select name="freight_agent_id" defaultValue={shipment.freight_agent_id ?? ""} disabled={readOnly} className={selectClass}>
              <option value="">Select agent…</option>
              {freightAgents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Clearing agent">
            <select name="clearing_agent_id" defaultValue={shipment.clearing_agent_id ?? ""} disabled={readOnly} className={selectClass}>
              <option value="">Select agent…</option>
              {clearingAgents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Packages" error={state.fieldErrors?.packages}>
            <input type="number" min={0} name="packages" defaultValue={shipment.packages ?? ""} disabled={readOnly} className={inputClass} />
          </Field>
          <Field label="Net weight (kg)" error={state.fieldErrors?.net_weight}>
            <input type="number" min={0} step="0.01" name="net_weight" defaultValue={shipment.net_weight ?? ""} disabled={readOnly} className={inputClass} />
          </Field>
          <Field label="Gross weight (kg)" error={state.fieldErrors?.gross_weight}>
            <input type="number" min={0} step="0.01" name="gross_weight" defaultValue={shipment.gross_weight ?? ""} disabled={readOnly} className={inputClass} />
          </Field>
        </div>

        <Field label="Remarks">
          <textarea name="transport_remarks" rows={3} defaultValue={shipment.transport_remarks ?? ""} disabled={readOnly} className={inputClass} />
        </Field>

        {!readOnly && (
          <div className="flex justify-end border-t border-border pt-4">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-dark disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save transport details"}
            </button>
          </div>
        )}
        {readOnly && (
          <p className="border-t border-border pt-4 text-xs text-ink-muted">
            You don&apos;t have permission to edit transport details, or this shipment is Completed.
          </p>
        )}
      </FormCard>
    </form>
  );
}
