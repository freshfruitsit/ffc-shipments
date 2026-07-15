import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

/**
 * For the specific reference tables that are now readable by `anon`
 * (see migration 20260101000004) — a plain client with no cookie/session
 * dependency, safe to call from inside unstable_cache. Never use this for
 * anything that needs RLS scoped to the current user; it deliberately
 * carries no user identity at all.
 */
export function createPublicClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
