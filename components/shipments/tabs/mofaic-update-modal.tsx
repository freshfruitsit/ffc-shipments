"use client";

import { useState, useActionState } from "react";
import { useCloseModalOnSuccess } from "@/lib/hooks/use-close-modal-on-success";
import { updateMofaicAction } from "@/lib/actions/portal-updates";
import { Modal } from "@/components/ui/modal";
import { Field, FormError, inputClass, selectClass } from "@/components/ui/form";
import type { ActionState } from "@/lib/actions/shipment-detail";

const STATUSES = ["Not Applicable", "Applicability Review", "Pending", "Payment Due", "Paid", "Overdue", "Completed", "Exception"];
const initialState: ActionState = {};

type Option = { id: string; name: string };

export function MofaicUpdateModal({
  shipmentId,
  shipmentRef,
  shipment,
  currencies,
  profiles,
}: {
  shipmentId: string;
  shipmentRef: string;
  shipment: {
    mofaic_status: string; mofaic_ref: string | null; mofaic_payment_amount: number | null;
    mofaic_currency: string | null; mofaic_payment_date: string | null;
    mofaic_responsible: string | null; mofaic_remarks: string | null;
  };
  currencies: string[];
  profiles: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(updateMofaicAction, initialState);

  useCloseModalOnSuccess(state.success, setOpen);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-[11.5px] font-semibold text-ink transition hover:bg-surface-muted"
      >
        Update MOFAIC Follow-up
      </button>

      {open && (
        <Modal
          title={`Update MOFAIC Follow-up — ${shipmentRef}`}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button onClick={() => setOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted">
                Cancel
              </button>
              <button type="submit" form="mofaic-update-form" disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60">
                {pending ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          <form id="mofaic-update-form" action={formAction} className="space-y-4">
            <input type="hidden" name="shipment_id" value={shipmentId} />
            <FormError message={state.error} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="MOFAIC Status">
                <select name="mofaic_status" defaultValue={shipment.mofaic_status} className={selectClass}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="MOFAIC Reference Number">
                <input name="mofaic_ref" defaultValue={shipment.mofaic_ref ?? ""} className={inputClass} />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Payment Amount" error={state.fieldErrors?.mofaic_payment_amount}>
                <input type="number" min={0} step="0.01" name="mofaic_payment_amount" defaultValue={shipment.mofaic_payment_amount ?? ""} className={inputClass} />
              </Field>
              <Field label="Currency">
                <select name="mofaic_currency" defaultValue={shipment.mofaic_currency ?? "AED"} className={selectClass}>
                  {currencies.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Payment Date">
              <input type="date" name="mofaic_payment_date" defaultValue={shipment.mofaic_payment_date ?? ""} className={inputClass} />
            </Field>
            <Field label="Responsible User">
              <select name="mofaic_responsible" defaultValue={shipment.mofaic_responsible ?? ""} className={selectClass}>
                <option value="">Select user…</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Remarks">
              <textarea name="mofaic_remarks" rows={2} defaultValue={shipment.mofaic_remarks ?? ""} className={inputClass} />
            </Field>
          </form>
        </Modal>
      )}
    </>
  );
}
