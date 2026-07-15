import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database";

/**
 * Supabase client for use inside Client Components. Reads the public
 * URL/publishable key from env vars — never the secret key, which must
 * never reach the browser bundle.
 *
 * Explicit module-level singleton: many components (NotificationBell,
 * AssignPanel, DocumentCard, etc.) each call createClient() independently
 * on mount/interaction. Without this, that's a new GoTrueClient/auth
 * listener per call, which both wastes a bit of setup work per instance
 * and risks the "multiple GoTrueClient instances" warning from
 * overlapping auth state listeners. One instance, reused everywhere.
 */
let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    );
  }
  return browserClient;
}
