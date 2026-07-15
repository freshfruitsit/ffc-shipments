"use client";

import { useState, useRef, useEffect, useActionState } from "react";
import Link from "next/link";
import { assignShipmentAction, changeShipmentStatusAction, type ActionState } from "@/lib/actions/shipment-detail";

type Profile = { id: string; full_name: string };
type Transition = { to_status: string; requires_reason: boolean };

const initialState: ActionState = {};

export function ShipmentActionBar({
  shipmentId,
  assignableProfiles,
  validTransitions,
  permissions,
}: {
  shipmentId: string;
  assignableProfiles: Profile[];
  validTransitions: Transition[];
  permissions: { assign: boolean; changeStatus: boolean; raiseException: boolean; edit: boolean };
}) {
  const [openPanel, setOpenPanel] = useState<"assign" | "status" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenPanel(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={containerRef} className="flex flex-wrap items-center gap-2">
      {permissions.assign && (
        <div className="relative">
          <ActionButton label="Assign" onClick={() => setOpenPanel(openPanel === "assign" ? null : "assign")} />
          {openPanel === "assign" && (
            <AssignPanel shipmentId={shipmentId} profiles={assignableProfiles} onDone={() => setOpenPanel(null)} />
          )}
        </div>
      )}
      {permissions.changeStatus && (
        <div className="relative">
          <ActionButton label="Change Status" onClick={() => setOpenPanel(openPanel === "status" ? null : "status")} />
          {openPanel === "status" && (
            <ChangeStatusPanel shipmentId={shipmentId} transitions={validTransitions} onDone={() => setOpenPanel(null)} />
          )}
        </div>
      )}
      <Link href={`/shipments/${shipmentId}/comments`}>
        <ActionButtonLink label="Add Comment" />
      </Link>
      <Link href={`/shipments/${shipmentId}/documents`}>
        <ActionButtonLink label="Upload Document" />
      </Link>
      {permissions.raiseException && (
        <Link href={`/shipments/${shipmentId}/exceptions`}>
          <ActionButtonLink label="Raise Exception" />
        </Link>
      )}
      {permissions.edit && (
        <Link href={`/shipments/${shipmentId}/overview`}>
          <ActionButtonLink label="Edit" />
        </Link>
      )}
    </div>
  );
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-ink transition hover:bg-surface-muted"
    >
      {label}
    </button>
  );
}

function ActionButtonLink({ label }: { label: string }) {
  return (
    <span className="inline-block rounded-md border border-border bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-ink transition hover:bg-surface-muted">
      {label}
    </span>
  );
}

function AssignPanel({
  shipmentId,
  profiles,
  onDone,
}: {
  shipmentId: string;
  profiles: Profile[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(assignShipmentAction, initialState);

  useEffect(() => {
    if (state.success) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-border bg-surface p-4 shadow-lg">
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="shipment_id" value={shipmentId} />
        {state.error && <p className="text-xs text-danger">{state.error}</p>}
        <div>
          <label className="text-xs font-medium text-ink-muted">Responsible</label>
          <select name="responsible" className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm">
            <option value="">No change</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-ink-muted">Coordinator</label>
          <select name="coordinator" className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm">
            <option value="">No change</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save assignment"}
        </button>
      </form>
    </div>
  );
}

function ChangeStatusPanel({
  shipmentId,
  transitions,
  onDone,
}: {
  shipmentId: string;
  transitions: Transition[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(changeShipmentStatusAction, initialState);
  const [selected, setSelected] = useState(transitions[0]?.to_status ?? "");
  const needsReason = transitions.find((t) => t.to_status === selected)?.requires_reason ?? false;

  useEffect(() => {
    if (state.success) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  if (transitions.length === 0) {
    return (
      <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-border bg-surface p-4 text-xs text-ink-muted shadow-lg">
        No status transitions are available from the current status.
      </div>
    );
  }

  return (
    <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-border bg-surface p-4 shadow-lg">
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="shipment_id" value={shipmentId} />
        {state.error && <p className="text-xs text-danger">{state.error}</p>}
        <div>
          <label className="text-xs font-medium text-ink-muted">New status</label>
          <select
            name="new_status"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm"
          >
            {transitions.map((t) => (
              <option key={t.to_status} value={t.to_status}>{t.to_status}</option>
            ))}
          </select>
        </div>
        {needsReason && (
          <div>
            <label className="text-xs font-medium text-ink-muted">Reason (required)</label>
            <textarea name="reason" required rows={2} className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm" />
          </div>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : "Change status"}
        </button>
      </form>
    </div>
  );
}
