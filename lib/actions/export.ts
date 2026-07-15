"use server";

import { createClient } from "@/lib/supabase/server";
import { formatDubaiDate } from "@/lib/dates";
import type { OverallStatus } from "@/lib/types/database";

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function exportShipmentsCsvAction(params: {
  q?: string;
  status?: OverallStatus;
  view?: string;
}): Promise<{ csv?: string; error?: string }> {
  const supabase = await createClient();

  // Cap at 5,000 rows for a single export — generous for any realistic
  // branch-scoped register, and keeps this from becoming an unbounded
  // resource pull if it's ever called against a much larger dataset later.
  const { data, error } = await supabase.rpc("search_shipments", {
    p_query: params.q || null,
    p_status: params.status || null,
    p_view: params.view || null,
    p_page: 1,
    p_page_size: 5000,
  });

  if (error) {
    return { error: "Couldn't export the register right now." };
  }

  const headers = [
    "Shipment ID", "Shipment Date", "Overall Status", "Supplier", "Origin Country", "AWB", "ETA",
    "Arrival Port", "Document Status", "Customs Status", "Municipality Status", "Delivery Order Status",
    "MOFAIC Status", "Physical Document Status",
  ];
  const rows = (data ?? []).map((s) => [
    s.ref, formatDubaiDate(s.shipment_date), s.overall_status, s.supplier_name_snapshot, s.origin_country ?? "",
    s.awb ?? "", s.eta ? formatDubaiDate(s.eta) : "", s.port ?? "", s.document_status, s.customs_status,
    s.municipality_status, s.delivery_order_status, s.mofaic_status, s.physical_doc_status,
  ]);

  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  return { csv };
}
