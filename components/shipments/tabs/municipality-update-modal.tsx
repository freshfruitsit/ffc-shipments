"use client";

import { useState, useActionState } from "react";
import { useCloseModalOnSuccess } from "@/lib/hooks/use-close-modal-on-success";
import { updateMunicipalityAction } from "@/lib/actions/portal-updates";
import { Modal } from "@/components/ui/modal";
import { Field, FormError, inputClass, selectClass } from "@/components/ui/form";
import type { ActionState } from "@/lib/actions/shipment-detail";

const STATUSES = ["Not Required", "Not Started", "Draft", "Submitted", "Under Review", "Finished", "Rejected", "Resubmission Required"];
const initialState: ActionState = {};

export function MunicipalityUpdateModal({
  shipmentId,
  shipmentRef,
  shipment,
}: {
  shipmentId: string;
  shipmentRef: string;
  shipment: {
    municipality_draft_ref: string | null; municipality_submitted_ref: string | null; municipality_status: string;
    municipality_submission_date: string | null; municipality_completion_date: string | null; municipality_remarks: string | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(updateMunicipalityAction, initialState);

  useCloseModalOnSuccess(state.success, setOpen);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-[11.5px] font-semibold text-ink transition hover:bg-surface-muted"
      >
        Update Dubai Municipality
      </button>

      {open && (
        <Modal
          title={`Update Dubai Municipality — ${shipmentRef}`}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button onClick={() => setOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted">
                Cancel
              </button>
              <button type="submit" form="municipality-update-form" disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60">
                {pending ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          <form id="municipality-update-form" action={formAction} className="space-y-4">
            <input type="hidden" name="shipment_id" value={shipmentId} />
            <FormError message={state.error} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Municipality Draft Reference">
                <input name="municipality_draft_ref" defaultValue={shipment.municipality_draft_ref ?? ""} className={inputClass} />
              </Field>
              <Field label="Municipality Submitted Reference">
                <input name="municipality_submitted_ref" defaultValue={shipment.municipality_submitted_ref ?? ""} className={inputClass} />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Municipality Status">
                <select name="municipality_status" defaultValue={shipment.municipality_status} className={selectClass}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="Submission Date">
                <input type="date" name="municipality_submission_date" defaultValue={shipment.municipality_submission_date ?? ""} className={inputClass} />
              </Field>
            </div>
            <Field label="Completion Date">
              <input type="date" name="municipality_completion_date" defaultValue={shipment.municipality_completion_date ?? ""} className={inputClass} />
            </Field>
            <Field label="Authority Remarks">
              <textarea name="municipality_remarks" rows={2} defaultValue={shipment.municipality_remarks ?? ""} className={inputClass} />
            </Field>
          </form>
        </Modal>
      )}
    </>
  );
}
