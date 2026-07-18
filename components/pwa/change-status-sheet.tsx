"use client";

import { useState, useEffect, useActionState } from "react";
import { X } from "lucide-react";
import { changeShipmentStatusAction, type ActionState } from "@/lib/actions/shipment-detail";

const initialState: ActionState = {};

export function ChangeStatusSheet({
  shipmentId,
  transitions,
  onClose,
}: {
  shipmentId: string;
  transitions: { to_status: string; requires_reason: boolean }[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<{ to_status: string; requires_reason: boolean } | null>(null);
  const [state, formAction, pending] = useActionState(changeShipmentStatusAction, initialState);

  useEffect(() => {
    if (state.success) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl bg-surface p-4 pb-8"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-ink">
            {selected ? "Confirm change" : "Change status"}
          </h2>
          <button onClick={onClose} className="rounded-full p-1 text-ink-muted active:bg-surface-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        {state.error && <p className="mb-3 text-sm text-danger">{state.error}</p>}

        {!selected ? (
          transitions.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-muted">No status changes are available right now.</p>
          ) : (
            <div className="space-y-1.5">
              {transitions.map((t) => (
                <button
                  key={t.to_status}
                  onClick={() => setSelected(t)}
                  className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-left text-[15px] font-medium text-ink active:bg-surface-muted"
                >
                  {t.to_status}
                </button>
              ))}
            </div>
          )
        ) : (
          <form action={formAction} className="space-y-3">
            <input type="hidden" name="shipment_id" value={shipmentId} />
            <input type="hidden" name="new_status" value={selected.to_status} />
            <p className="text-sm text-ink-muted">
              Moving to <span className="font-medium text-ink">{selected.to_status}</span>
              {selected.requires_reason ? " — a reason is required for this change." : "."}
            </p>
            {selected.requires_reason && (
              <textarea
                name="reason"
                required
                rows={3}
                placeholder="Reason for this change…"
                className="w-full rounded-lg border border-border px-3 py-2.5 text-[15px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="flex-1 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium text-ink active:bg-surface-muted"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={pending}
                className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-white active:bg-primary-dark disabled:opacity-60"
              >
                {pending ? "Saving…" : "Confirm"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
