"use client";

import { useActionState } from "react";
import { raiseExceptionAction } from "@/lib/actions/exceptions";
import { Field, FormCard, FormError, FormSuccess, inputClass, selectClass } from "@/components/ui/form";
import type { ActionState } from "@/lib/actions/shipment-detail";

const initialState: ActionState = {};

export function RaiseExceptionForm({
  shipmentId,
  exceptionTypes,
}: {
  shipmentId: string;
  exceptionTypes: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(raiseExceptionAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="shipment_id" value={shipmentId} />
      <FormCard>
        <h3 className="text-sm font-semibold text-ink">Raise exception</h3>
        <FormError message={state.error} />
        {state.success && <FormSuccess message="Exception raised." />}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Exception type" error={state.fieldErrors?.exception_type_id}>
            <select name="exception_type_id" required className={selectClass}>
              <option value="">Select type…</option>
              {exceptionTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Severity" error={state.fieldErrors?.severity}>
            <select name="severity" defaultValue="Medium" className={selectClass}>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </Field>
        </div>
        <Field label="Description" error={state.fieldErrors?.description}>
          <textarea name="description" required rows={3} className={inputClass} />
        </Field>
        <Field label="Due date (optional)">
          <input type="date" name="due_date" className={inputClass} />
        </Field>

        <div className="flex justify-end border-t border-border pt-4">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-dark disabled:opacity-60"
          >
            {pending ? "Raising…" : "Raise exception"}
          </button>
        </div>
      </FormCard>
    </form>
  );
}
