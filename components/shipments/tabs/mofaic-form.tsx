"use client";

import { useActionState } from "react";
import { updateMofaicAction } from "@/lib/actions/portal-updates";
import { Field, FormCard, FormError, FormSuccess, inputClass, selectClass } from "@/components/ui/form";
import type { ActionState } from "@/lib/actions/shipment-detail";

const STATUSES = ["Not Applicable", "Applicability Review", "Pending", "Payment Due", "Paid", "Overdue", "Completed", "Exception"];
const initialState: ActionState = {};

export function MofaicForm({
  shipmentId,
  shipment,
  currencies,
  readOnly,
}: {
  shipmentId: string;
  shipment: {
    mofaic_status: string; mofaic_ref: string | null; mofaic_payment_amount: number | null;
    mofaic_currency: string | null; mofaic_payment_date: string | null; mofaic_remarks: string | null;
  };
  currencies: string[];
  readOnly: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateMofaicAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="shipment_id" value={shipmentId} />
      <FormCard>
        <FormError message={state.error} />
        {state.success && <FormSuccess message="MOFAIC details saved." />}

        <Field label="MOFAIC status">
          <select name="mofaic_status" defaultValue={shipment.mofaic_status} disabled={readOnly} className={selectClass}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>

        <Field label="MOFAIC reference" error={state.fieldErrors?.mofaic_ref}>
          <input name="mofaic_ref" defaultValue={shipment.mofaic_ref ?? ""} disabled={readOnly} className={inputClass} />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Payment amount" error={state.fieldErrors?.mofaic_payment_amount}>
            <input type="number" min={0} step="0.01" name="mofaic_payment_amount" defaultValue={shipment.mofaic_payment_amount ?? ""} disabled={readOnly} className={inputClass} />
          </Field>
          <Field label="Currency">
            <select name="mofaic_currency" defaultValue={shipment.mofaic_currency ?? "AED"} disabled={readOnly} className={selectClass}>
              {currencies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Payment date" error={state.fieldErrors?.mofaic_payment_date}>
          <input type="date" name="mofaic_payment_date" defaultValue={shipment.mofaic_payment_date ?? ""} disabled={readOnly} className={inputClass} />
        </Field>
        <p className="-mt-3 text-xs text-ink-muted">
          Setting status to Paid requires both a payment date and a payment amount — enforced by the database.
        </p>

        <Field label="Remarks">
          <textarea name="mofaic_remarks" rows={3} defaultValue={shipment.mofaic_remarks ?? ""} disabled={readOnly} className={inputClass} />
        </Field>

        {!readOnly && (
          <div className="flex justify-end border-t border-border pt-4">
            <button type="submit" disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-dark disabled:opacity-60">
              {pending ? "Saving…" : "Save MOFAIC details"}
            </button>
          </div>
        )}
        {readOnly && (
          <p className="border-t border-border pt-4 text-xs text-ink-muted">
            You don&apos;t have permission to edit MOFAIC details, or this shipment is Completed.
          </p>
        )}
      </FormCard>
    </form>
  );
}
