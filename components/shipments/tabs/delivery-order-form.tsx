"use client";

import { useActionState } from "react";
import { updateDeliveryOrderAction } from "@/lib/actions/portal-updates";
import { Field, FormCard, FormError, FormSuccess, inputClass, selectClass } from "@/components/ui/form";
import type { ActionState } from "@/lib/actions/shipment-detail";

const STATUSES = ["Not Required", "Pending", "Requested", "Received", "Uploaded", "Verified"];
const initialState: ActionState = {};

type Option = { id: string; name: string };

export function DeliveryOrderForm({
  shipmentId,
  shipment,
  carriers,
  readOnly,
}: {
  shipmentId: string;
  shipment: {
    carrier_id: string | null; delivery_order_status: string; delivery_order_requested_date: string | null;
    delivery_order_received_date: string | null; delivery_order_doc_uploaded: boolean; delivery_order_remarks: string | null;
  };
  carriers: Option[];
  readOnly: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateDeliveryOrderAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="shipment_id" value={shipmentId} />
      <FormCard>
        <FormError message={state.error} />
        {state.success && <FormSuccess message="Delivery order details saved." />}

        <Field label="Carrier">
          <select name="carrier_id" defaultValue={shipment.carrier_id ?? ""} disabled={readOnly} className={selectClass}>
            <option value="">Select carrier…</option>
            {carriers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Delivery order status">
          <select name="delivery_order_status" defaultValue={shipment.delivery_order_status} disabled={readOnly} className={selectClass}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <p className="-mt-3 text-xs text-ink-muted">
          Setting status to Received auto-fills today&apos;s date below if left blank — enforced by the database.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Requested date">
            <input type="date" name="delivery_order_requested_date" defaultValue={shipment.delivery_order_requested_date ?? ""} disabled={readOnly} className={inputClass} />
          </Field>
          <Field label="Received date">
            <input type="date" name="delivery_order_received_date" defaultValue={shipment.delivery_order_received_date ?? ""} disabled={readOnly} className={inputClass} />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="delivery_order_doc_uploaded" value="true" defaultChecked={shipment.delivery_order_doc_uploaded} disabled={readOnly} className="h-4 w-4 rounded border-border" />
          Delivery order document uploaded
        </label>

        <Field label="Remarks">
          <textarea name="delivery_order_remarks" rows={3} defaultValue={shipment.delivery_order_remarks ?? ""} disabled={readOnly} className={inputClass} />
        </Field>

        {!readOnly && (
          <div className="flex justify-end border-t border-border pt-4">
            <button type="submit" disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-dark disabled:opacity-60">
              {pending ? "Saving…" : "Save delivery order details"}
            </button>
          </div>
        )}
        {readOnly && (
          <p className="border-t border-border pt-4 text-xs text-ink-muted">
            You don&apos;t have permission to edit delivery order details, or this shipment is Completed.
          </p>
        )}
      </FormCard>
    </form>
  );
}
