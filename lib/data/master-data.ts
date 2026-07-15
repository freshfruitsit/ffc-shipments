import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public-client";

/**
 * Master data (airlines, ports, agents, carriers, couriers, document types,
 * currencies, countries, categories, branches) changes maybe a few times a
 * year, if that — but Module 2's tab pages were re-fetching it from
 * Supabase on every single tab click, each one a fresh network round-trip.
 * Caching it for 5 minutes removes that latency entirely for the vast
 * majority of navigations.
 *
 * Three things worth knowing about this file:
 *
 * 1. It uses createPublicClient(), NOT the cookie-aware server client.
 *    unstable_cache cannot safely wrap a function that reads cookies
 *    (Next.js explicitly disallows this). These specific tables are
 *    anon-readable — see 20260101000002_security_and_rls.sql's grants/
 *    policies section — precisely so this cache-safe client can read them.
 *
 * 2. Each fetcher is written out explicitly rather than generated from a
 *    generic helper parameterized by table name — Supabase's typed client
 *    needs a literal table-name string to resolve which table's Row type
 *    applies; a generic `table: string` parameter can't do that.
 *
 * 3. Every fetcher THROWS on a query error rather than silently returning
 *    an empty array. An earlier version swallowed errors here (`data ?? []`
 *    with the error discarded), which meant a real access-control bug
 *    (anon's grant on these tables got stripped by a later migration
 *    re-run) rendered as a quietly-empty dropdown instead of a visible
 *    error — exactly the kind of bug that's expensive to track down.
 *    Throwing surfaces it immediately via the nearest error.tsx boundary,
 *    and logs it server-side for Vercel's function logs.
 */

function orThrow<T>(label: string, result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) {
    console.error(`[master-data] ${label} failed:`, result.error.message);
    throw new Error(`Couldn't load ${label}: ${result.error.message}`);
  }
  return result.data ?? ([] as unknown as T);
}

export const getAirlines = unstable_cache(
  async () => orThrow("airlines", await createPublicClient().from("airlines").select("id, name").eq("is_active", true).order("name")),
  ["master-airlines"],
  { revalidate: 300, tags: ["master-airlines"] }
);

export const getFreightAgents = unstable_cache(
  async () => orThrow("freight agents", await createPublicClient().from("freight_agents").select("id, name").eq("is_active", true).order("name")),
  ["master-freight-agents"],
  { revalidate: 300, tags: ["master-freight-agents"] }
);

export const getClearingAgents = unstable_cache(
  async () => orThrow("clearing agents", await createPublicClient().from("clearing_agents").select("id, name").eq("is_active", true).order("name")),
  ["master-clearing-agents"],
  { revalidate: 300, tags: ["master-clearing-agents"] }
);

export const getCarriers = unstable_cache(
  async () => orThrow("carriers", await createPublicClient().from("carriers").select("id, name").eq("is_active", true).order("name")),
  ["master-carriers"],
  { revalidate: 300, tags: ["master-carriers"] }
);

export const getCourierCompanies = unstable_cache(
  async () => orThrow("courier companies", await createPublicClient().from("courier_companies").select("id, name").eq("is_active", true).order("name")),
  ["master-courier-companies"],
  { revalidate: 300, tags: ["master-courier-companies"] }
);

export const getDocumentTypes = unstable_cache(
  async () => orThrow("document types", await createPublicClient().from("document_types").select("id, name").eq("is_active", true).order("display_order")),
  ["master-document-types"],
  { revalidate: 300, tags: ["master-document-types"] }
);

export const getShipmentCategories = unstable_cache(
  async () => orThrow("shipment categories", await createPublicClient().from("shipment_categories").select("id, name").eq("is_active", true).order("display_order")),
  ["master-shipment-categories"],
  { revalidate: 300, tags: ["master-shipment-categories"] }
);

export const getPorts = unstable_cache(
  async () => orThrow("ports", await createPublicClient().from("ports").select("id, name").eq("is_active", true).order("display_order")),
  ["master-ports"],
  { revalidate: 300, tags: ["master-ports"] }
);

export const getCountries = unstable_cache(
  async () => orThrow("countries", await createPublicClient().from("countries").select("id, name").eq("is_active", true).order("name")),
  ["master-countries"],
  { revalidate: 300, tags: ["master-countries"] }
);

export const getCurrencies = unstable_cache(
  async () => {
    const result = await createPublicClient().from("currencies").select("code").eq("is_active", true).order("code");
    return orThrow("currencies", result).map((c) => c.code);
  },
  ["master-currencies"],
  { revalidate: 300, tags: ["master-currencies"] }
);

export const getActiveBranches = unstable_cache(
  async () => orThrow("branches", await createPublicClient().from("branches").select("id, name").eq("is_active", true).order("display_order")),
  ["master-branches"],
  { revalidate: 300, tags: ["master-branches"] }
);
