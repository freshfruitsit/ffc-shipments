"use client";

import { useState, useActionState } from "react";
import { useCloseModalOnSuccess } from "@/lib/hooks/use-close-modal-on-success";
import { updateDeliveryOrderAction } from "@/lib/actions/portal-updates";
import { Modal } from "@/components/ui/modal";
import { Field, FormError, inputClass, selectClass } from "@/components/ui/form";
import type { ActionState } from "@/lib/actions/shipment-detail";

const STATUSES = ["Not Required", "Pending", "Requested", "Received from Carrier", "Uploaded", "Verified"];
const initialState: ActionState = {};

type Option = { id: string; name: string };

export function DeliveryOrderUpdateModal({
  shipmentId,
  shipmentRef,
  shipment,
  carriers,
  profiles,
}: {
  shipmentId: string;
  shipmentRef: string;
  shipment: {
    carrier_id: string | null; delivery_order_status: string; delivery_order_requested_date: string | null;
    delivery_order_received_date: string | null; delivery_order_doc_uploaded: boolean;
    delivery_order_responsible: string | null; delivery_order_remarks: string | null;
  };
  carriers: Option[];
  profiles: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(updateDeliveryOrderAction, initialState);

  useCloseModalOnSuccess(state.success, setOpen);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-[11.5px] font-semibold text-ink transition hover:bg-surface-muted"
      >
        Update Delivery Order
      </button>

      {open && (
        <Modal
          title={`Update Delivery Order — ${shipmentRef}`}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button onClick={() => setOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted">
                Cancel
              </button>
              <button type="submit" form="do-update-form" disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60">
                {pending ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          <form id="do-update-form" action={formAction} className="space-y-4">
            <input type="hidden" name="shipment_id" value={shipmentId} />
            {/* Not shown in this modal (matching the prototype's field set),
                but the RPC would otherwise clear it since it isn't a
                coalesce-style update — round-tripped unchanged instead of
                silently losing data. */}
            <input type="hidden" name="delivery_order_requested_date" value={shipment.delivery_order_requested_date ?? ""} />
            <FormError message={state.error} />

            <Field label="Carrier / Handling Agent">
              <select name="carrier_id" defaultValue={shipment.carrier_id ?? ""} className={selectClass}>
                <option value="">Select carrier…</option>
                {carriers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Delivery Order Status">
                <select name="delivery_order_status" defaultValue={shipment.delivery_order_status} className={selectClass}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="Received Date">
                <input type="date" name="delivery_order_received_date" defaultValue={shipment.delivery_order_received_date ?? ""} className={inputClass} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="delivery_order_doc_uploaded" value="true" defaultChecked={shipment.delivery_order_doc_uploaded} className="h-4 w-4 rounded border-border" />
              Delivery order document uploaded
            </label>
            <Field label="Responsible User">
              <select name="delivery_order_responsible" defaultValue={shipment.delivery_order_responsible ?? ""} className={selectClass}>
                <option value="">Select user…</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Remarks">
              <textarea name="delivery_order_remarks" rows={2} defaultValue={shipment.delivery_order_remarks ?? ""} className={inputClass} />
            </Field>
          </form>
        </Modal>
      )}
    </>
  );
}
