import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { DiscoveryItemEditor } from "@/components/discovery/discovery-item-editor";

export default async function DiscoveryPage() {
  const supabase = await createClient();

  const [{ data: items, error }, { data: canEdit }] = await Promise.all([
    supabase.from("discovery_items").select("*").order("code"),
    supabase.rpc("has_permission", { p_permission: "administer" }),
  ]);

  const ownerIds = [...new Set((items ?? []).map((i) => i.owner).filter((o): o is string => !!o))];
  const ownerNames = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ownerIds);
    for (const p of profiles ?? []) ownerNames.set(p.id, p.full_name);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Discovery &amp; Sign-off</h1>
        <p className="text-sm text-ink-muted">
          The open business decisions from the architecture review, tracked through to resolution.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-light p-4 text-sm text-danger">
          Couldn&apos;t load discovery items right now.
        </div>
      )}

      {!error && items?.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-surface-muted/40 p-8 text-center text-sm text-ink-muted">
          No discovery items recorded yet.
        </div>
      )}

      <div className="space-y-3">
        {items?.map((item) => (
          <div key={item.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[11px] font-mono text-ink-muted">{item.code}</span>
                  <p className="font-medium text-ink">{item.topic}</p>
                </div>
                <p className="mt-1 text-sm text-ink-muted">{item.description}</p>
                <p className="mt-1 text-xs italic text-ink-muted">Proposed: {item.proposed_rule}</p>
              </div>
              <StatusBadge
                status={item.status}
                criticalList={["Rejected"]}
                warnList={["Not Discussed", "Under Review", "Pending Confirmation", "Deferred"]}
              />
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs text-ink-muted">
              {item.owner && <span>Owner: {ownerNames.get(item.owner) ?? "Unknown"}</span>}
              {item.due_date && <span>Due: {item.due_date}</span>}
            </div>
            <div className="mt-3 border-t border-border pt-3">
              <DiscoveryItemEditor
                discoveryId={item.id}
                currentStatus={item.status}
                currentNotes={item.notes}
                canEdit={!!canEdit}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
