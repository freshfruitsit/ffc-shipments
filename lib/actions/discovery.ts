"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyRpcError } from "@/lib/actions/errors";
import type { ActionState } from "@/lib/actions/shipment-detail";

const UpdateSchema = z.object({
  discovery_id: z.string().uuid(),
  status: z.enum(["Not Discussed", "Under Review", "Pending Confirmation", "Approved", "Rejected", "Deferred"]),
  notes: z.string().optional(),
});

export async function updateDiscoveryItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = UpdateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Invalid status value." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_discovery_item", {
    p_discovery_id: parsed.data.discovery_id,
    p_status: parsed.data.status,
    p_notes: parsed.data.notes || null,
  });
  if (error) return { error: friendlyRpcError(error.message) };
  revalidatePath("/discovery");
  return { success: true };
}
