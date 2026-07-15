"use client";

import { useActionState } from "react";
import { updatePhysicalDocumentsAction } from "@/lib/actions/portal-updates";
import { Field, FormCard, FormError, FormSuccess, inputClass, selectClass } from "@/components/ui/form";
import type { ActionState } from "@/lib/actions/shipment-detail";

const STATUSES = ["Not Required", "Originals Pending", "Ready for Dispatch", "Dispatched", "In Transit", "Delivered", "Proof of Delivery Received", "Closed"];
const initialState: ActionState = {};

type Option = { id: string; name: string };

export function PhysicalDocumentsForm({
  shipmentId,
  shipment,
  couriers,
  readOnly,
}: {
  shipmentId: string;
  shipment: {
    physical_doc_status: string; originals_required: boolean; originals_received: boolean; ready_for_dispatch: boolean;
    courier_company_id: string | null; tracking_number: string | null; dispatch_date: string | null;
    delivered_date: string | null; pod_received: boolean; physical_docs_remarks: string | null;
  };
  couriers: Option[];
  readOnly: boolean;
}) {
  const [state, formAction, pending] = useActionState(updatePhysicalDocumentsAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="shipment_id" value={shipmentId} />
      <FormCard>
        <FormError message={state.error} />
        {state.success && <FormSuccess message="Physical document details saved." />}

        <Field label="Physical document status">
          <select name="physical_doc_status" defaultValue={shipment.physical_doc_status} disabled={readOnly} className={selectClass}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" name="originals_required" value="true" defaultChecked={shipment.originals_required} disabled={readOnly} className="h-4 w-4 rounded border-border" />
            Originals required
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" name="originals_received" value="true" defaultChecked={shipment.originals_received} disabled={readOnly} className="h-4 w-4 rounded border-border" />
            Originals received
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" name="ready_for_dispatch" value="true" defaultChecked={shipment.ready_for_dispatch} disabled={readOnly} className="h-4 w-4 rounded border-border" />
            Ready for dispatch
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" name="pod_received" value="true" defaultChecked={shipment.pod_received} disabled={readOnly} className="h-4 w-4 rounded border-border" />
            Proof of delivery received
          </label>
        </div>
        <p className="-mt-2 text-xs text-ink-muted">
          Proof of delivery requires a delivered date to be set — enforced by the database.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Courier company">
            <select name="courier_company_id" defaultValue={shipment.courier_company_id ?? ""} disabled={readOnly} className={selectClass}>
              <option value="">Select courier…</option>
              {couriers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Tracking number">
            <input name="tracking_number" defaultValue={shipment.tracking_number ?? ""} disabled={readOnly} className={inputClass} />
          </Field>
          <Field label="Dispatch date">
            <input type="date" name="dispatch_date" defaultValue={shipment.dispatch_date ?? ""} disabled={readOnly} className={inputClass} />
          </Field>
          <Field label="Delivered date" error={state.fieldErrors?.delivered_date}>
            <input type="date" name="delivered_date" defaultValue={shipment.delivered_date ?? ""} disabled={readOnly} className={inputClass} />
          </Field>
        </div>

        <Field label="Remarks">
          <textarea name="physical_docs_remarks" rows={3} defaultValue={shipment.physical_docs_remarks ?? ""} disabled={readOnly} className={inputClass} />
        </Field>

        {!readOnly && (
          <div className="flex justify-end border-t border-border pt-4">
            <button type="submit" disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-dark disabled:opacity-60">
              {pending ? "Saving…" : "Save physical document details"}
            </button>
          </div>
        )}
        {readOnly && (
          <p className="border-t border-border pt-4 text-xs text-ink-muted">
            You don&apos;t have permission to edit physical document details, or this shipment is Completed.
          </p>
        )}
      </FormCard>
    </form>
  );
}
