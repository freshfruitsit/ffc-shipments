"use client";

import { useActionState } from "react";
import { addInvoiceAction, type ActionState } from "@/lib/actions/shipment-detail";
import { Field, FormCard, FormError, FormSuccess, inputClass, selectClass } from "@/components/ui/form";
import { dubaiTodayISODate } from "@/lib/dates";

const initialState: ActionState = {};

export function InvoiceForm({ shipmentId, currencies }: { shipmentId: string; currencies: string[] }) {
  const [state, formAction, pending] = useActionState(addInvoiceAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="shipment_id" value={shipmentId} />
      <FormCard>
        <h3 className="text-sm font-semibold text-ink">Add invoice</h3>
        <FormError message={state.error} />
        {state.success && <FormSuccess message="Invoice added." />}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Invoice number" error={state.fieldErrors?.invoice_no}>
            <input name="invoice_no" required className={inputClass} />
          </Field>
          <Field label="Invoice date" error={state.fieldErrors?.invoice_date}>
            <input type="date" name="invoice_date" required defaultValue={dubaiTodayISODate()} className={inputClass} />
          </Field>
          <Field label="Invoice value" error={state.fieldErrors?.invoice_value}>
            <input type="number" min={0} step="0.01" name="invoice_value" required className={inputClass} />
          </Field>
          <Field label="Currency" error={state.fieldErrors?.currency_code}>
            <select name="currency_code" required defaultValue="AED" className={selectClass}>
              {currencies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Purchase order no. (optional)">
            <input name="purchase_order_no" className={inputClass} />
          </Field>
          <Field label="Supplier reference (optional)">
            <input name="supplier_reference" className={inputClass} />
          </Field>
        </div>
        <Field label="Remarks (optional)">
          <textarea name="remarks" rows={2} className={inputClass} />
        </Field>

        <div className="flex justify-end border-t border-border pt-4">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-dark disabled:opacity-60"
          >
            {pending ? "Adding…" : "Add invoice"}
          </button>
        </div>
      </FormCard>
    </form>
  );
}
