"use client";

import { useActionState, useRef, useEffect } from "react";
import { addCommentAction, type ActionState } from "@/lib/actions/shipment-detail";
import { FormError } from "@/components/ui/form";

const initialState: ActionState = {};

export function CommentForm({ shipmentId }: { shipmentId: string }) {
  const [state, formAction, pending] = useActionState(addCommentAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2 rounded-xl border border-border bg-surface p-4">
      <input type="hidden" name="shipment_id" value={shipmentId} />
      <FormError message={state.error} />
      <textarea
        name="body"
        rows={2}
        required
        placeholder="Add a comment…"
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-dark disabled:opacity-60"
        >
          {pending ? "Posting…" : "Post comment"}
        </button>
      </div>
    </form>
  );
}
