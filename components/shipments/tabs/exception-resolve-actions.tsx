"use client";

import { useState, useActionState } from "react";
import { useParams } from "next/navigation";
import { resolveExceptionAction, closeExceptionAction } from "@/lib/actions/exceptions";
import type { ActionState } from "@/lib/actions/shipment-detail";

const initialState: ActionState = {};

export function ExceptionResolveActions({ exceptionId, status }: { exceptionId: string; status: string }) {
  const params = useParams();
  const shipmentId = params.id as string;
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [closing, setClosing] = useState(false);
  const [state, formAction, pending] = useActionState(resolveExceptionAction, initialState);

  async function handleClose() {
    setClosing(true);
    await closeExceptionAction(exceptionId, shipmentId);
    setClosing(false);
  }

  if (status === "Resolved") {
    return (
      <div className="mt-3 border-t border-border pt-3">
        <button
          onClick={handleClose}
          disabled={closing}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-muted disabled:opacity-60"
        >
          {closing ? "Closing…" : "Close exception"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      {!showResolveForm ? (
        <button
          onClick={() => setShowResolveForm(true)}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-muted"
        >
          Resolve
        </button>
      ) : (
        <form action={formAction} className="space-y-2">
          <input type="hidden" name="exception_id" value={exceptionId} />
          <input type="hidden" name="shipment_id" value={shipmentId} />
          {state.error && <p className="text-xs text-danger">{state.error}</p>}
          <textarea
            name="root_cause"
            placeholder="Root cause"
            required
            rows={2}
            className="w-full rounded-md border border-border px-2 py-1.5 text-xs"
          />
          <textarea
            name="resolution"
            placeholder="Resolution"
            required
            rows={2}
            className="w-full rounded-md border border-border px-2 py-1.5 text-xs"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
          >
            {pending ? "Saving…" : "Mark resolved"}
          </button>
        </form>
      )}
    </div>
  );
}
