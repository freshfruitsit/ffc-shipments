"use server";

import { createClient } from "@/lib/supabase/server";

export async function searchSuppliersAction(query: string): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_active_suppliers", {
    p_query: query || null,
    p_limit: 20,
    p_offset: 0,
  });
  if (error) {
    console.error("[search-suppliers] search_active_suppliers failed:", error.message);
    return [];
  }
  return (data ?? []).map((s) => ({ id: s.id, name: s.name }));
}
