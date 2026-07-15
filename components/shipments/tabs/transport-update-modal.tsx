"use client";

import { useState, useActionState } from "react";
import { useCloseModalOnSuccess } from "@/lib/hooks/use-close-modal-on-success";
import { updateTransportAction, type ActionState } from "@/lib/actions/shipment-detail";
import { Modal } from "@/components/ui/modal";
import { Field, FormError, inputClass, selectClass } from "@/components/ui/form";

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

export function TransportUpdateModal({
  shipmentId,
  shipmentRef,
  shipment,
  airlines,
  ports,
  freightAgents,
  clearingAgents,
}: {
  shipmentId: string;
  shipmentRef: string;
  shipment: Shipment;
  airlines: Option[];
  ports: Option[];
  freightAgents: Option[];
  clearingAgents: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(updateTransportAction, initialState);

  useCloseModalOnSuccess(state.success, setOpen);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-[11.5px] font-semibold text-ink transition hover:bg-surface-muted"
      >
        Update Transport
      </button>

      {open && (
        <Modal
          title={`Update Transport — ${shipmentRef}`}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button onClick={() => setOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted">
                Cancel
              </button>
              <button type="submit" form="transport-update-form" disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60">
                {pending ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          <form id="transport-update-form" action={formAction} className="space-y-4">
            <input type="hidden" name="shipment_id" value={shipmentId} />
            <FormError message={state.error} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="AWB Number" error={state.fieldErrors?.awb}>
                <input name="awb" defaultValue={shipment.awb ?? ""} className={inputClass} />
              </Field>
              <Field label="Airline">
                <select name="airline_id" defaultValue={shipment.airline_id ?? ""} className={selectClass}>
                  <option value="">Select airline…</option>
                  {airlines.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Flight Number">
                <input name="flight" defaultValue={shipment.flight ?? ""} className={inputClass} />
              </Field>
              <Field label="ETA">
                <input type="datetime-local" name="eta" defaultValue={toDatetimeLocal(shipment.eta)} className={inputClass} />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Arrival Port">
                <select name="port_id" defaultValue={shipment.port_id ?? ""} className={selectClass}>
                  <option value="">Select port…</option>
                  {ports.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Packages" error={state.fieldErrors?.packages}>
                <input type="number" min={0} name="packages" defaultValue={shipment.packages ?? ""} className={inputClass} />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Net Weight (kg)" error={state.fieldErrors?.net_weight}>
                <input type="number" min={0} step="0.01" name="net_weight" defaultValue={shipment.net_weight ?? ""} className={inputClass} />
              </Field>
              <Field label="Gross Weight (kg)" error={state.fieldErrors?.gross_weight}>
                <input type="number" min={0} step="0.01" name="gross_weight" defaultValue={shipment.gross_weight ?? ""} className={inputClass} />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Freight Agent">
                <select name="freight_agent_id" defaultValue={shipment.freight_agent_id ?? ""} className={selectClass}>
                  <option value="">Select agent…</option>
                  {freightAgents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Clearing Agent">
                <select name="clearing_agent_id" defaultValue={shipment.clearing_agent_id ?? ""} className={selectClass}>
                  <option value="">Select agent…</option>
                  {clearingAgents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Transport Remarks">
              <textarea name="transport_remarks" rows={2} defaultValue={shipment.transport_remarks ?? ""} className={inputClass} />
            </Field>
          </form>
        </Modal>
      )}
    </>
  );
}
