import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDubaiDateTime } from "@/lib/dates";

export default async function ActivityHistoryTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: shipment, error } = await supabase.from("shipments").select("ref").eq("id", id).single();
  if (error || !shipment) notFound();

  const { data: events } = await supabase
    .from("audit_log")
    .select("id, occurred_at, actor, actor_role, action, module, comment")
    .eq("shipment_ref", shipment.ref)
    .order("occurred_at", { ascending: false })
    .limit(100);

  const actorIds = [...new Set((events ?? []).map((e) => e.actor).filter((a): a is string => !!a))];
  const { data: actors } = actorIds.length
    ? await supabase.from("v_assignable_profiles").select("id, full_name").in("id", actorIds)
    : { data: [] };
  const nameById = new Map((actors ?? []).map((a) => [a.id, a.full_name]));

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      {(!events || events.length === 0) && (
        <p className="py-6 text-center text-sm text-ink-muted">No recorded activity for this shipment yet.</p>
      )}
      {events && events.length > 0 && (
        <ul className="divide-y divide-dashed divide-border">
          {events.map((e) => (
            <li key={e.id} className="flex items-start gap-2.5 py-2.5">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
              <div className="text-sm">
                <p className="text-ink">
                  <strong className="font-semibold">{e.actor ? nameById.get(e.actor) ?? "Unknown user" : "System"}</strong>
                  {" — "}
                  {e.action}
                  {e.module && <span className="text-ink-muted"> [{e.module}]</span>}
                  {e.comment && <span className="text-ink-muted"> — {e.comment}</span>}
                </p>
                <p className="text-[10.5px] text-ink-muted">{formatDubaiDateTime(e.occurred_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
