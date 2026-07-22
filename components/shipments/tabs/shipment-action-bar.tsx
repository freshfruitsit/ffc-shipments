"use client";

import { useState, useRef, useEffect, useActionState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { assignShipmentAction, type ActionState } from "@/lib/actions/shipment-detail";

type Profile = { id: string; full_name: string };

const initialState: ActionState = {};

/**
 * Change Status and Complete Shipment are gone entirely — overall_status
 * is now fully automatic, derived from the 6 module statuses by
 * fn_recalculate_shipment_progress (see
 * 20260101000025_auto_status_progression.sql). There's nothing left for
 * a person to manually trigger here; the stepper just reflects reality.
 */
export function ShipmentActionBar({
  shipmentId,
  permissions,
}: {
  shipmentId: string;
  permissions: { assign: boolean; raiseException: boolean; edit: boolean };
}) {
  const [openPanel, setOpenPanel] = useState<"assign" | null>(null);
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
          {openPanel === "assign" && <AssignPanel shipmentId={shipmentId} onDone={() => setOpenPanel(null)} />}
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
  onDone,
}: {
  shipmentId: string;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(assignShipmentAction, initialState);
  const [profiles, setProfiles] = useState<Profile[] | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .rpc("get_assignable_profiles", { p_branch_id: null, p_required_permission: null })
      .then(({ data }) => setProfiles((data ?? []).map((p) => ({ id: p.id, full_name: p.full_name }))));
  }, []);

  const pathname = usePathname();

  useEffect(() => {
    if (state.success) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-border bg-surface p-4 shadow-lg">
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="shipment_id" value={shipmentId} />
        <input type="hidden" name="current_path" value={pathname} />
        {state.error && <p className="text-xs text-danger">{state.error}</p>}
        {profiles === null ? (
          <p className="text-xs text-ink-muted">Loading…</p>
        ) : (
          <>
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
          </>
        )}
        <button
          type="submit"
          disabled={pending || profiles === null}
          className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save assignment"}
        </button>
      </form>
    </div>
  );
}
