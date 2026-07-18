"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { ChangeStatusSheet } from "@/components/pwa/change-status-sheet";

export function StatusDetailClient({
  shipmentId,
  canChangeStatus,
  transitions,
}: {
  shipmentId: string;
  canChangeStatus: boolean;
  transitions: { to_status: string; requires_reason: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function handleClose() {
    setOpen(false);
    // The desktop change_shipment_status action revalidates /shipments/*,
    // not this /m/* route — router.refresh() re-fetches this exact page's
    // server data directly, independent of that revalidation, so status
    // and the flight-path visual are correct immediately. Refreshing on
    // a plain cancel too is harmless (same data comes back) and keeps
    // this simple rather than threading a changed/cancelled distinction
    // through the sheet for no real benefit.
    router.refresh();
  }

  return (
    <>
      <div className="h-24" />
      <div
        className="fixed inset-x-0 bottom-[64px] z-20 mx-auto max-w-md border-t border-border bg-surface p-3"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
      >
        {canChangeStatus ? (
          <button
            onClick={() => setOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-[15px] font-semibold text-white active:bg-primary-dark"
          >
            <RefreshCw className="h-4 w-4" />
            Change Status
          </button>
        ) : (
          <p className="py-2 text-center text-[12.5px] text-ink-muted">
            No status changes available from here right now.
          </p>
        )}
      </div>

      {open && <ChangeStatusSheet shipmentId={shipmentId} transitions={transitions} onClose={handleClose} />}
    </>
  );
}
