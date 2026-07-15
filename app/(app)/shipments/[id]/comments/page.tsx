import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CommentForm } from "@/components/shipments/tabs/comment-form";
import { formatDubaiDateTime } from "@/lib/dates";

type CommentsData = {
  comments: { id: string; body: string; created_at: string; author_name: string | null; author_role: string | null }[];
  can_comment: boolean;
};

export default async function CommentsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_shipment_comments_tab", { p_shipment_id: id });
  if (error) {
    console.error("[comments-tab] get_shipment_comments_tab failed:", error.message);
    throw new Error("Couldn't load the comments tab.");
  }
  if (!data) notFound();
  const tab = data as unknown as CommentsData;

  return (
    <div className="space-y-4">
      {tab.can_comment && <CommentForm shipmentId={id} />}

      <div className="space-y-3">
        {tab.comments.length === 0 && (
          <p className="rounded-lg border border-dashed border-border bg-surface-muted/40 p-6 text-center text-sm text-ink-muted">
            No comments yet.
          </p>
        )}
        {tab.comments.map((c) => (
          <div key={c.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between text-xs text-ink-muted">
              <span className="font-medium text-ink">{c.author_name ?? "Unknown user"}</span>
              <span>{formatDubaiDateTime(c.created_at)}</span>
            </div>
            <p className="mt-2 text-sm text-ink">{c.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
