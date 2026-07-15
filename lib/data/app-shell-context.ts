import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { withPerformanceLogging } from "@/lib/performance-logging";

export type AppShellContext =
  | {
      ok: true;
      user_id: string;
      full_name: string;
      role: string;
      branch_id: string | null;
      branch_name: string | null;
      permissions: Record<string, boolean>;
      unread_notification_count: number;
      can_view_all_branches: boolean;
    }
  | { ok: false; reason: "no-profile" | "inactive" }
  | { ok: false; reason: "db-error" };

/**
 * Wrapped in React's cache() for request-level de-duplication only — this
 * is NOT a cross-request/cross-user cache (that would leak one user's
 * profile data to another). Within a single request, the root layout and
 * any page that also needs this data get it from one actual network
 * round trip instead of one each.
 *
 * Deliberately does NOT call supabase.auth.getUser() (or getClaims())
 * here — proxy.ts already verified the session via getClaims() before
 * this route was ever reached, and calling another auth-verification
 * method here would reintroduce exactly the duplicate-auth-round-trip
 * problem this RPC exists to remove. get_app_shell_context() does its own
 * auth.uid()-based lookup; if that resolves to no matching active
 * profile (which, given the proxy's own protection, should only happen
 * in a genuinely unusual edge case — not the normal "signed out" path),
 * this surfaces as {ok:false, reason:'no-profile'} rather than a
 * different failure mode, so the layout still has a safe, non-looping
 * redirect rather than needing a third verification path.
 */
export const getAppShellContext = cache(async (): Promise<AppShellContext> => {
  const supabase = await createClient();

  const { data, error } = await withPerformanceLogging("get_app_shell_context", () =>
    supabase.rpc("get_app_shell_context")
  );

  if (error || !data) {
    console.error("[app-shell-context] get_app_shell_context failed:", error?.message);
    return { ok: false, reason: "db-error" };
  }

  return data as unknown as AppShellContext;
});
