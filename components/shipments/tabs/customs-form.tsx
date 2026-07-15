"use client";

import { useActionState } from "react";
import { updateCustomsAction } from "@/lib/actions/portal-updates";
import { Field, FormCard, FormError, FormSuccess, inputClass, selectClass } from "@/components/ui/form";
import type { ActionState } from "@/lib/actions/shipment-detail";

const STATUSES = [
  "Not Started", "Draft", "Request Created", "Submitted", "Declaration Created",
  "Under Review", "Approved", "Rejected", "Resubmission Required", "Closed",
];

const initialState: ActionState = {};

export function CustomsForm({
  shipmentId,
  shipment,
  readOnly,
}: {
  shipmentId: string;
  shipment: {
    declaration_no: string | null; customs_status: string; customs_submission_date: string | null;
    customs_result: string | null; customs_remarks: string | null;
  };
  readOnly: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateCustomsAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="shipment_id" value={shipmentId} />
      <FormCard>
        <FormError message={state.error} />
        {state.success && <FormSuccess message="Customs details saved." />}

        <Field label="Declaration number" error={state.fieldErrors?.declaration_no}>
          <input name="declaration_no" defaultValue={shipment.declaration_no ?? ""} disabled={readOnly} className={inputClass} />
        </Field>
        <p className="-mt-3 text-xs text-ink-muted">
          Required once status reaches Declaration Created or later — enforced by the database, not just this form.
        </p>

        <Field label="Customs status" error={state.fieldErrors?.customs_status}>
          <select name="customs_status" defaultValue={shipment.customs_status} disabled={readOnly} className={selectClass}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Submission date">
            <input type="date" name="customs_submission_date" defaultValue={shipment.customs_submission_date ?? ""} disabled={readOnly} className={inputClass} />
          </Field>
          <Field label="Result">
            <input name="customs_result" defaultValue={shipment.customs_result ?? ""} disabled={readOnly} className={inputClass} />
          </Field>
        </div>

        <Field label="Remarks">
          <textarea name="customs_remarks" rows={3} defaultValue={shipment.customs_remarks ?? ""} disabled={readOnly} className={inputClass} />
        </Field>

        {!readOnly && (
          <div className="flex justify-end border-t border-border pt-4">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-dark disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save customs details"}
            </button>
          </div>
        )}
        {readOnly && (
          <p className="border-t border-border pt-4 text-xs text-ink-muted">
            You don&apos;t have permission to edit customs details, or this shipment is Completed.
          </p>
        )}
      </FormCard>
    </form>
  );
}
