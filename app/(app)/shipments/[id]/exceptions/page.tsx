import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { RaiseExceptionForm } from "@/components/shipments/tabs/raise-exception-form";
import { ExceptionResolveActions } from "@/components/shipments/tabs/exception-resolve-actions";
import { formatDubaiDateTime } from "@/lib/dates";

export default async function ExceptionsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: shipment, error } = await supabase.from("shipments").select("overall_status").eq("id", id).single();
  if (error || !shipment) notFound();

  const [{ data: exceptions }, { data: exceptionTypes }, { data: canManage }] = await Promise.all([
    supabase
      .from("exceptions")
      .select("id, exception_type_id, severity, description, status, assigned_to, due_date, root_cause, resolution, created_at")
      .eq("shipment_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("exception_types").select("id, name").eq("is_active", true),
    supabase.rpc("has_permission", { p_permission: "manage_exceptions" }),
  ]);

  const typeNameById = new Map((exceptionTypes ?? []).map((t) => [t.id, t.name]));
  const canAct = !!canManage;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {(!exceptions || exceptions.length === 0) && (
          <p className="rounded-lg border border-dashed border-border bg-surface-muted/40 p-6 text-center text-sm text-ink-muted">
            No exceptions raised on this shipment.
          </p>
        )}
        {exceptions?.map((exc) => (
          <div key={exc.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <StatusBadge status={exc.severity} priority />
                <span className="text-sm font-medium text-ink">{typeNameById.get(exc.exception_type_id) ?? "Exception"}</span>
              </div>
              <StatusBadge status={exc.status} criticalList={[]} warnList={["Open", "Under Review", "Waiting for Supplier", "Waiting for Carrier", "Waiting for Authority", "Waiting for Finance"]} />
            </div>
            <p className="mt-2 text-sm text-ink">{exc.description}</p>
            <p className="mt-1 text-xs text-ink-muted">
              Raised {formatDubaiDateTime(exc.created_at)}
              {exc.due_date ? ` · Due ${exc.due_date}` : ""}
            </p>
            {exc.resolution && (
              <div className="mt-2 rounded-md bg-surface-muted px-3 py-2 text-xs text-ink-muted">
                <strong>Root cause:</strong> {exc.root_cause} <br />
                <strong>Resolution:</strong> {exc.resolution}
              </div>
            )}
            {canAct && !["Resolved", "Closed"].includes(exc.status) && (
              <ExceptionResolveActions exceptionId={exc.id} status={exc.status} />
            )}
          </div>
        ))}
      </div>

      {canAct && shipment.overall_status !== "Completed" && (
        <RaiseExceptionForm shipmentId={id} exceptionTypes={exceptionTypes ?? []} />
      )}
      {!canAct && (
        <p className="text-xs text-ink-muted">You don&apos;t have permission to manage exceptions on this shipment.</p>
      )}
    </div>
  );
}
