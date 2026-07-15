"use client";

import { useState, useActionState } from "react";
import { useCloseModalOnSuccess } from "@/lib/hooks/use-close-modal-on-success";
import { updateCustomsAction } from "@/lib/actions/portal-updates";
import { Modal } from "@/components/ui/modal";
import { Field, FormError, inputClass, selectClass } from "@/components/ui/form";
import type { ActionState } from "@/lib/actions/shipment-detail";

const STATUSES = [
  "Not Started", "Draft", "Request Created", "Submitted", "Declaration Created",
  "Under Review", "Approved", "Rejected", "Resubmission Required", "Closed",
];

const initialState: ActionState = {};

export function CustomsUpdateModal({
  shipmentId,
  shipmentRef,
  shipment,
}: {
  shipmentId: string;
  shipmentRef: string;
  shipment: {
    declaration_no: string | null; customs_status: string; customs_submission_date: string | null; customs_remarks: string | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(updateCustomsAction, initialState);

  useCloseModalOnSuccess(state.success, setOpen);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-[11.5px] font-semibold text-ink transition hover:bg-surface-muted"
      >
        Update Dubai Customs
      </button>

      {open && (
        <Modal
          title={`Update Dubai Customs — ${shipmentRef}`}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button onClick={() => setOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted">
                Cancel
              </button>
              <button type="submit" form="customs-update-form" disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60">
                {pending ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          <form id="customs-update-form" action={formAction} className="space-y-4">
            <input type="hidden" name="shipment_id" value={shipmentId} />
            <FormError message={state.error} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Dubai Customs Declaration Number" error={state.fieldErrors?.declaration_no}>
                <input name="declaration_no" required defaultValue={shipment.declaration_no ?? ""} className={inputClass} />
              </Field>
              <Field label="Submission Date">
                <input type="date" name="customs_submission_date" defaultValue={shipment.customs_submission_date ?? ""} className={inputClass} />
              </Field>
            </div>
            <Field label="Dubai Customs Status">
              <select name="customs_status" defaultValue={shipment.customs_status} className={selectClass}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Remarks">
              <textarea name="customs_remarks" rows={2} defaultValue={shipment.customs_remarks ?? ""} className={inputClass} />
            </Field>
          </form>
        </Modal>
      )}
    </>
  );
}
