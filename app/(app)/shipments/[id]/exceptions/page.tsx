import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { RaiseExceptionForm } from "@/components/shipments/tabs/raise-exception-form";
import { ExceptionResolveActions } from "@/components/shipments/tabs/exception-resolve-actions";
import { formatDubaiDateTime } from "@/lib/dates";

type ExceptionsData = {
  exceptions: {
    id: string; type_name: string; severity: string; description: string; status: string;
    assigned_to_name: string | null; due_date: string | null; root_cause: string | null;
    resolution: string | null; created_at: string; resubmission_count: number; latest_resubmission_result: string | null;
  }[];
  exception_types: { id: string; name: string }[];
  can_manage: boolean;
};

export default async function ExceptionsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_shipment_exceptions_tab", { p_shipment_id: id });
  if (error) {
    console.error("[exceptions-tab] get_shipment_exceptions_tab failed:", error.message);
    throw new Error("Couldn't load the exceptions tab.");
  }
  if (!data) notFound();
  const tab = data as unknown as ExceptionsData;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {tab.exceptions.length === 0 && (
          <p className="rounded-lg border border-dashed border-border bg-surface-muted/40 p-6 text-center text-sm text-ink-muted">
            No exceptions raised on this shipment.
          </p>
        )}
        {tab.exceptions.map((exc) => (
          <div key={exc.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <StatusBadge status={exc.severity} priority />
                <span className="text-sm font-medium text-ink">{exc.type_name}</span>
              </div>
              <StatusBadge status={exc.status} criticalList={[]} warnList={["Open", "Under Review", "Waiting for Supplier", "Waiting for Carrier", "Waiting for Authority", "Waiting for Finance"]} />
            </div>
            <p className="mt-2 text-sm text-ink">{exc.description}</p>
            <p className="mt-1 text-xs text-ink-muted">
              Raised {formatDubaiDateTime(exc.created_at)}
              {exc.due_date ? ` · Due ${exc.due_date}` : ""}
              {exc.resubmission_count > 0 ? ` · ${exc.resubmission_count} resubmission(s), latest: ${exc.latest_resubmission_result ?? "—"}` : ""}
            </p>
            {exc.resolution && (
              <div className="mt-2 rounded-md bg-surface-muted px-3 py-2 text-xs text-ink-muted">
                <strong>Root cause:</strong> {exc.root_cause} <br />
                <strong>Resolution:</strong> {exc.resolution}
              </div>
            )}
            {tab.can_manage && !["Resolved", "Closed"].includes(exc.status) && (
              <ExceptionResolveActions exceptionId={exc.id} status={exc.status} />
            )}
          </div>
        ))}
      </div>

      {tab.can_manage && <RaiseExceptionForm shipmentId={id} exceptionTypes={tab.exception_types} />}
      {!tab.can_manage && (
        <p className="text-xs text-ink-muted">You don&apos;t have permission to manage exceptions on this shipment.</p>
      )}
    </div>
  );
}
