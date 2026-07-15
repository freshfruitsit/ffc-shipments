import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDubaiDateTime } from "@/lib/dates";

type ActivityData = {
  events: {
    id: number; occurred_at: string; action: string; module: string | null;
    actor_name: string | null; actor_role: string | null; comment: string | null;
  }[];
};

export default async function ActivityHistoryTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_shipment_activity_tab", { p_shipment_id: id });
  if (error) {
    console.error("[activity-tab] get_shipment_activity_tab failed:", error.message);
    throw new Error("Couldn't load the activity tab.");
  }
  if (!data) notFound();
  const tab = data as unknown as ActivityData;

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      {tab.events.length === 0 && (
        <p className="py-6 text-center text-sm text-ink-muted">No recorded activity for this shipment yet.</p>
      )}
      {tab.events.length > 0 && (
        <ul className="divide-y divide-dashed divide-border">
          {tab.events.map((e) => (
            <li key={e.id} className="flex items-start gap-2.5 py-2.5">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
              <div className="text-sm">
                <p className="text-ink">
                  <strong className="font-semibold">{e.actor_name ?? "System"}</strong>
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
