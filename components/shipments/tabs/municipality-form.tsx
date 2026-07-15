"use client";

import { useActionState } from "react";
import { updateMunicipalityAction } from "@/lib/actions/portal-updates";
import { Field, FormCard, FormError, FormSuccess, inputClass, selectClass } from "@/components/ui/form";
import type { ActionState } from "@/lib/actions/shipment-detail";

const STATUSES = ["Not Required", "Not Started", "Draft", "Submitted", "Under Review", "Finished", "Rejected", "Resubmission Required"];

const initialState: ActionState = {};

export function MunicipalityForm({
  shipmentId,
  shipment,
  readOnly,
}: {
  shipmentId: string;
  shipment: {
    municipality_draft_ref: string | null; municipality_submitted_ref: string | null; municipality_status: string;
    municipality_submission_date: string | null; municipality_completion_date: string | null; municipality_remarks: string | null;
  };
  readOnly: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateMunicipalityAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="shipment_id" value={shipmentId} />
      <FormCard>
        <FormError message={state.error} />
        {state.success && <FormSuccess message="Municipality details saved." />}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Draft reference" error={state.fieldErrors?.municipality_draft_ref}>
            <input name="municipality_draft_ref" defaultValue={shipment.municipality_draft_ref ?? ""} disabled={readOnly} className={inputClass} />
          </Field>
          <Field label="Submitted reference" error={state.fieldErrors?.municipality_submitted_ref}>
            <input name="municipality_submitted_ref" defaultValue={shipment.municipality_submitted_ref ?? ""} disabled={readOnly} className={inputClass} />
          </Field>
        </div>
        <p className="-mt-3 text-xs text-ink-muted">
          A submitted reference requires a draft reference first — draft is obtained before the delivery
          order arrives, submitted comes after.
        </p>

        <Field label="Municipality status">
          <select name="municipality_status" defaultValue={shipment.municipality_status} disabled={readOnly} className={selectClass}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Submission date">
            <input type="date" name="municipality_submission_date" defaultValue={shipment.municipality_submission_date ?? ""} disabled={readOnly} className={inputClass} />
          </Field>
          <Field label="Completion date">
            <input type="date" name="municipality_completion_date" defaultValue={shipment.municipality_completion_date ?? ""} disabled={readOnly} className={inputClass} />
          </Field>
        </div>

        <Field label="Remarks">
          <textarea name="municipality_remarks" rows={3} defaultValue={shipment.municipality_remarks ?? ""} disabled={readOnly} className={inputClass} />
        </Field>

        {!readOnly && (
          <div className="flex justify-end border-t border-border pt-4">
            <button type="submit" disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-dark disabled:opacity-60">
              {pending ? "Saving…" : "Save municipality details"}
            </button>
          </div>
        )}
        {readOnly && (
          <p className="border-t border-border pt-4 text-xs text-ink-muted">
            You don&apos;t have permission to edit municipality details, or this shipment is Completed.
          </p>
        )}
      </FormCard>
    </form>
  );
}
