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
 * Two things worth knowing about this file:
 *
 * 1. It uses createPublicClient(), NOT the cookie-aware server client.
 *    unstable_cache cannot safely wrap a function that reads cookies
 *    (Next.js explicitly disallows this) — an earlier draft of this file
 *    called the regular createClient() here, which reads the user's
 *    session cookie internally, and would have been exactly that
 *    unsupported pattern. These specific tables were relaxed to
 *    anon-readable (migration 20260101000004) precisely so this
 *    cache-safe client can be used for them.
 *
 * 2. Each fetcher is written out explicitly rather than generated from a
 *    generic helper parameterized by table name — Supabase's typed client
 *    needs a literal table-name string to resolve which table's Row type
 *    applies; a generic `table: string` parameter can't do that, and
 *    produces real type errors (caught while building this).
 */

export const getAirlines = unstable_cache(
  async () => {
    const { data } = await createPublicClient().from("airlines").select("id, name").eq("is_active", true).order("name");
    return data ?? [];
  },
  ["master-airlines"],
  { revalidate: 300, tags: ["master-airlines"] }
);

export const getFreightAgents = unstable_cache(
  async () => {
    const { data } = await createPublicClient().from("freight_agents").select("id, name").eq("is_active", true).order("name");
    return data ?? [];
  },
  ["master-freight-agents"],
  { revalidate: 300, tags: ["master-freight-agents"] }
);

export const getClearingAgents = unstable_cache(
  async () => {
    const { data } = await createPublicClient().from("clearing_agents").select("id, name").eq("is_active", true).order("name");
    return data ?? [];
  },
  ["master-clearing-agents"],
  { revalidate: 300, tags: ["master-clearing-agents"] }
);

export const getCarriers = unstable_cache(
  async () => {
    const { data } = await createPublicClient().from("carriers").select("id, name").eq("is_active", true).order("name");
    return data ?? [];
  },
  ["master-carriers"],
  { revalidate: 300, tags: ["master-carriers"] }
);

export const getCourierCompanies = unstable_cache(
  async () => {
    const { data } = await createPublicClient().from("courier_companies").select("id, name").eq("is_active", true).order("name");
    return data ?? [];
  },
  ["master-courier-companies"],
  { revalidate: 300, tags: ["master-courier-companies"] }
);

export const getDocumentTypes = unstable_cache(
  async () => {
    const { data } = await createPublicClient().from("document_types").select("id, name").eq("is_active", true).order("display_order");
    return data ?? [];
  },
  ["master-document-types"],
  { revalidate: 300, tags: ["master-document-types"] }
);

export const getShipmentCategories = unstable_cache(
  async () => {
    const { data } = await createPublicClient().from("shipment_categories").select("id, name").eq("is_active", true).order("display_order");
    return data ?? [];
  },
  ["master-shipment-categories"],
  { revalidate: 300, tags: ["master-shipment-categories"] }
);

export const getPorts = unstable_cache(
  async () => {
    const { data } = await createPublicClient().from("ports").select("id, name").eq("is_active", true).order("display_order");
    return data ?? [];
  },
  ["master-ports"],
  { revalidate: 300, tags: ["master-ports"] }
);

export const getCountries = unstable_cache(
  async () => {
    const { data } = await createPublicClient().from("countries").select("id, name").eq("is_active", true).order("name");
    return data ?? [];
  },
  ["master-countries"],
  { revalidate: 300, tags: ["master-countries"] }
);

export const getCurrencies = unstable_cache(
  async () => {
    const { data } = await createPublicClient().from("currencies").select("code").eq("is_active", true).order("code");
    return (data ?? []).map((c) => c.code);
  },
  ["master-currencies"],
  { revalidate: 300, tags: ["master-currencies"] }
);

export const getActiveBranches = unstable_cache(
  async () => {
    const { data } = await createPublicClient().from("branches").select("id, name").eq("is_active", true).order("display_order");
    return data ?? [];
  },
  ["master-branches"],
  { revalidate: 300, tags: ["master-branches"] }
);
