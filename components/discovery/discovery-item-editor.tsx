"use client";

import { useActionState } from "react";
import { updateDiscoveryItemAction } from "@/lib/actions/discovery";
import type { ActionState } from "@/lib/actions/shipment-detail";
import type { DiscoveryStatus } from "@/lib/types/database";

const STATUS_OPTIONS: DiscoveryStatus[] = [
  "Not Discussed", "Under Review", "Pending Confirmation", "Approved", "Rejected", "Deferred",
];

const initialState: ActionState = {};

export function DiscoveryItemEditor({
  discoveryId,
  currentStatus,
  currentNotes,
  canEdit,
}: {
  discoveryId: string;
  currentStatus: DiscoveryStatus;
  currentNotes: string | null;
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateDiscoveryItemAction, initialState);

  if (!canEdit) {
    return (
      <div className="text-xs text-ink-muted">
        {currentNotes ? <p className="italic">{currentNotes}</p> : "Read-only — you don't have the administer permission."}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="discovery_id" value={discoveryId} />
      <div className="flex items-center gap-2">
        <select
          name="status"
          defaultValue={currentStatus}
          className="rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-muted disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      <textarea
        name="notes"
        defaultValue={currentNotes ?? ""}
        placeholder="Notes…"
        rows={2}
        className="w-full rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      {state.error && <p className="text-xs text-danger">{state.error}</p>}
      {state.success && <p className="text-xs text-primary-dark">Saved.</p>}
    </form>
  );
}
