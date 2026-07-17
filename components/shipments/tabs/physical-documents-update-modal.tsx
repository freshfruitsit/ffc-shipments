"use client";

import { useState, useActionState } from "react";
import { useCloseModalOnSuccess } from "@/lib/hooks/use-close-modal-on-success";
import { updatePhysicalDocumentsAction } from "@/lib/actions/portal-updates";
import { Modal } from "@/components/ui/modal";
import { Field, FormError, inputClass, selectClass } from "@/components/ui/form";
import type { ActionState } from "@/lib/actions/shipment-detail";

const STATUSES = ["Not Required", "Pending", "Ready for Dispatch", "Dispatched", "In Transit", "Delivered", "Proof of Delivery Received", "Closed"];
const initialState: ActionState = {};

type Option = { id: string; name: string };

export function PhysicalDocumentsUpdateModal({
  shipmentId,
  shipmentRef,
  shipment,
  couriers,
  profiles,
}: {
  shipmentId: string;
  shipmentRef: string;
  shipment: {
    physical_doc_status: string; originals_required: boolean; originals_received: boolean; ready_for_dispatch: boolean;
    courier_company_id: string | null; tracking_number: string | null; dispatch_date: string | null;
    delivered_date: string | null; pod_received: boolean; physical_docs_responsible: string | null; physical_docs_remarks: string | null;
  };
  couriers: Option[];
  profiles: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(updatePhysicalDocumentsAction, initialState);

  useCloseModalOnSuccess(state.success, setOpen);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-[11.5px] font-semibold text-ink transition hover:bg-surface-muted"
      >
        Update Physical Documents
      </button>

      {open && (
        <Modal
          title={`Update Physical Documents — ${shipmentRef}`}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button onClick={() => setOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted">
                Cancel
              </button>
              <button type="submit" form="physdoc-update-form" disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60">
                {pending ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          <form id="physdoc-update-form" action={formAction} className="space-y-4">
            <input type="hidden" name="shipment_id" value={shipmentId} />
            <FormError message={state.error} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Physical Document Status">
                <select name="physical_doc_status" defaultValue={shipment.physical_doc_status} className={selectClass}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink">
                <input type="checkbox" name="originals_required" value="true" defaultChecked={shipment.originals_required} className="h-4 w-4 rounded border-border" />
                Original documents required
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="originals_received" value="true" defaultChecked={shipment.originals_received} className="h-4 w-4 rounded border-border" />
                Originals received from supplier
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="ready_for_dispatch" value="true" defaultChecked={shipment.ready_for_dispatch} className="h-4 w-4 rounded border-border" />
                Ready for dispatch
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Courier Company">
                <select name="courier_company_id" defaultValue={shipment.courier_company_id ?? ""} className={selectClass}>
                  <option value="">Select courier…</option>
                  {couriers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Tracking Number">
                <input name="tracking_number" defaultValue={shipment.tracking_number ?? ""} className={inputClass} />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Dispatch Date">
                <input type="date" name="dispatch_date" defaultValue={shipment.dispatch_date ?? ""} className={inputClass} />
              </Field>
              <Field label="Delivered Date" error={state.fieldErrors?.delivered_date}>
                <input type="date" name="delivered_date" defaultValue={shipment.delivered_date ?? ""} className={inputClass} />
              </Field>
            </div>

            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="pod_received" value="true" defaultChecked={shipment.pod_received} className="h-4 w-4 rounded border-border" />
              Proof of delivery received
            </label>

            <Field label="Responsible User">
              <select name="physical_docs_responsible" defaultValue={shipment.physical_docs_responsible ?? ""} className={selectClass}>
                <option value="">Select user…</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>

            <Field label="Remarks">
              <textarea name="physical_docs_remarks" rows={2} defaultValue={shipment.physical_docs_remarks ?? ""} className={inputClass} />
            </Field>
          </form>
        </Modal>
      )}
    </>
  );
}
