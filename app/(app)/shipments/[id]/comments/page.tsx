import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CommentForm } from "@/components/shipments/tabs/comment-form";
import { formatDubaiDateTime } from "@/lib/dates";

export default async function CommentsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: shipment, error } = await supabase.from("shipments").select("id").eq("id", id).single();
  if (error || !shipment) notFound();

  const [{ data: comments }, { data: canComment }] = await Promise.all([
    supabase.from("shipment_comments").select("*").eq("shipment_id", id).order("created_at", { ascending: false }),
    supabase.rpc("has_permission", { p_permission: "add_comment" }),
  ]);

  // Author names: fetch via the safe assignable-profiles view rather than
  // the full profiles table (item 2's RLS restriction from the last
  // review — this screen only ever needs a name to display, never email/
  // deactivation metadata).
  const authorIds = [...new Set((comments ?? []).map((c) => c.author).filter((a): a is string => !!a))];
  const { data: authors } = authorIds.length
    ? await supabase.from("v_assignable_profiles").select("id, full_name").in("id", authorIds)
    : { data: [] };
  const nameById = new Map((authors ?? []).map((a) => [a.id, a.full_name]));

  return (
    <div className="space-y-4">
      {canComment && <CommentForm shipmentId={id} />}

      <div className="space-y-3">
        {(!comments || comments.length === 0) && (
          <p className="rounded-lg border border-dashed border-border bg-surface-muted/40 p-6 text-center text-sm text-ink-muted">
            No comments yet.
          </p>
        )}
        {comments?.map((c) => (
          <div key={c.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between text-xs text-ink-muted">
              <span className="font-medium text-ink">{nameById.get(c.author ?? "") ?? "Unknown user"}</span>
              <span>{formatDubaiDateTime(c.created_at)}</span>
            </div>
            <p className="mt-2 text-sm text-ink">{c.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
