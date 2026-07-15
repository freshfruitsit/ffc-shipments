import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/types/database";

/**
 * Supabase client for use inside Server Components, Server Actions, and
 * Route Handlers. Every RLS policy and RPC permission check in the schema
 * relies on this being called with the SIGNED-IN USER's own session — this
 * is never the service_role key, so every read/write here goes through
 * RLS and the RPC-only write path exactly as the schema requires.
 *
 * Server Components can't always write cookies (e.g. during static
 * rendering), so writes are wrapped in a try/catch — proxy.ts is the
 * fallback that keeps the session refreshed in that case.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component that can't set cookies —
            // proxy.ts refreshing the session covers this case.
          }
        },
      },
    }
  );
}
