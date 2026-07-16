"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { friendlyRpcError } from "@/lib/actions/errors";
import type { AppRole } from "@/lib/types/database";

export type AdminActionState = { error?: string; success?: boolean };

export async function deactivateProfileAction(profileId: string): Promise<AdminActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("deactivate_profile", { p_profile_id: profileId });
  if (error) return { error: friendlyRpcError(error.message) };
  revalidatePath("/admin");
  return { success: true };
}

export async function reactivateProfileAction(profileId: string): Promise<AdminActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reactivate_profile", { p_profile_id: profileId });
  if (error) return { error: friendlyRpcError(error.message) };
  revalidatePath("/admin");
  return { success: true };
}

export async function changeUserRoleAction(
  profileId: string,
  newRole: AppRole,
  newBranchId: string | null
): Promise<AdminActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("change_user_role", {
    p_profile_id: profileId, p_new_role: newRole, p_new_branch_id: newBranchId,
  });
  if (error) return { error: friendlyRpcError(error.message) };
  revalidatePath("/admin");
  return { success: true };
}
