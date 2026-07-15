"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyRpcError } from "@/lib/actions/errors";
import type { ActionState } from "@/lib/actions/shipment-detail";

const RaiseSchema = z.object({
  shipment_id: z.string().uuid(),
  exception_type_id: z.string().uuid(),
  severity: z.enum(["Critical", "High", "Medium", "Low"]),
  description: z.string().trim().min(1, "Description is required"),
  due_date: z.string().optional(),
});

export async function raiseExceptionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = RaiseSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    const fieldErrors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) fieldErrors[k] = v[0];
    return { fieldErrors };
  }
  const supabase = await createClient();
  const d = parsed.data;
  const { error } = await supabase.rpc("raise_exception", {
    p_shipment_id: d.shipment_id,
    p_exception_type_id: d.exception_type_id,
    p_severity: d.severity,
    p_description: d.description,
    p_assigned_to: null,
    p_due_date: d.due_date || null,
  });
  if (error) return { error: friendlyRpcError(error.message) };
  revalidatePath(`/shipments/${d.shipment_id}/exceptions`);
  return { success: true };
}

const ResolveSchema = z.object({
  exception_id: z.string().uuid(),
  shipment_id: z.string().uuid(),
  root_cause: z.string().trim().min(1, "Root cause is required"),
  resolution: z.string().trim().min(1, "Resolution is required"),
});

export async function resolveExceptionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = ResolveSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: "Root cause and resolution are both required." };
  }
  const supabase = await createClient();
  const d = parsed.data;
  const { error } = await supabase.rpc("resolve_exception", {
    p_exception_id: d.exception_id,
    p_root_cause: d.root_cause,
    p_resolution: d.resolution,
  });
  if (error) return { error: friendlyRpcError(error.message) };
  revalidatePath(`/shipments/${d.shipment_id}/exceptions`);
  return { success: true };
}

export async function closeExceptionAction(exceptionId: string, shipmentId: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_exception", { p_exception_id: exceptionId });
  if (error) return { error: friendlyRpcError(error.message) };
  revalidatePath(`/shipments/${shipmentId}/exceptions`);
  return { success: true };
}
