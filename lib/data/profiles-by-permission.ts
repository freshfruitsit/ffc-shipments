import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

/**
 * Returns only the profiles whose role actually holds `permission` —
 * for populating a "Responsible User" dropdown where the target RPC
 * (update_delivery_order / update_mofaic / update_physical_documents,
 * via fn_require_assignable_profile) will reject an assignee whose role
 * doesn't hold the matching permission. Filtering up front means that
 * rejection can't happen instead of surfacing as a confusing error only
 * at submit time.
 *
 * Backed by the get_assignable_profiles() RPC, not the old
 * v_assignable_profiles view — that view ran with its owner's privileges
 * and leaked every branch's profiles to every authenticated user; the
 * RPC enforces the same branch/permission rules the caller is actually
 * subject to.
 */
export async function getProfilesForPermission(
  supabase: SupabaseClient<Database>,
  permission: string
): Promise<{ id: string; full_name: string }[]> {
  const { data } = await supabase.rpc("get_assignable_profiles", {
    p_branch_id: null,
    p_required_permission: permission,
  });
  return (data ?? []).map((p) => ({ id: p.id, full_name: p.full_name }));
}
