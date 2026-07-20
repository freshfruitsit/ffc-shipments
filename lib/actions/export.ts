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

// search_shipments hard-caps page_size at 100 internally (see
// 20260101000015_workspace_filter_consistency.sql) — that's correct for
// its actual purpose, normal UI pagination, but it means a single call
// requesting a bigger page size was silently truncated to 100 rows no
// matter what was asked for. This was a real bug: exports over 100 rows
// were quietly incomplete with no error and no indication anything was
// cut short.
//
// Fixed by paginating through search_shipments in its own 100-row pages
// until every row matching total_count has actually been collected,
// rather than fetching a full new export-specific dataset. A true
// background-job export pipeline is real infrastructure this business's
// actual scale doesn't currently need — a hard ceiling with an honest,
// visible message if it's ever hit is the right trade-off here, not
// silent truncation.
const MAX_EXPORT_ROWS = 5000;
const PAGE_SIZE = 100;

export async function exportShipmentsCsvAction(params: {
  q?: string;
  status?: OverallStatus;
  view?: string;
}): Promise<{ csv?: string; error?: string; truncated?: boolean; exportedCount?: number; totalCount?: number }> {
  const supabase = await createClient();

  type ShipmentRow = {
    ref: string; shipment_date: string; overall_status: string; supplier_name_snapshot: string;
    origin_country: string | null; awb: string | null; eta: string | null; port: string | null;
    document_status: string; customs_status: string; municipality_status: string;
    delivery_order_status: string; mofaic_status: string; physical_doc_status: string;
    total_count: number;
  };

  const allRows: ShipmentRow[] = [];
  let page = 1;
  let totalCount: number | null = null;

  while (true) {
    const { data, error } = await supabase.rpc("search_shipments", {
      p_query: params.q || null,
      p_status: params.status || null,
      p_view: params.view || null,
      p_page: page,
      p_page_size: PAGE_SIZE,
    });

    if (error) {
      return { error: "Couldn't export the register right now." };
    }

    const rows = (data ?? []) as ShipmentRow[];
    if (rows.length === 0) break;

    totalCount = rows[0].total_count;
    allRows.push(...rows);

    if (allRows.length >= totalCount || allRows.length >= MAX_EXPORT_ROWS) break;
    page += 1;
  }

  const truncated = totalCount !== null && allRows.length < totalCount;

  const headers = [
    "Shipment ID", "Shipment Date", "Overall Status", "Supplier", "Origin Country", "AWB", "ETA",
    "Arrival Port", "Document Status", "Customs Status", "Municipality Status", "Delivery Order Status",
    "MOFAIC Status", "Physical Document Status",
  ];
  const csvRows = allRows.map((s) => [
    s.ref, formatDubaiDate(s.shipment_date), s.overall_status, s.supplier_name_snapshot, s.origin_country ?? "",
    s.awb ?? "", s.eta ? formatDubaiDate(s.eta) : "", s.port ?? "", s.document_status, s.customs_status,
    s.municipality_status, s.delivery_order_status, s.mofaic_status, s.physical_doc_status,
  ]);

  const csv = [headers, ...csvRows].map((row) => row.map(csvEscape).join(",")).join("\n");
  return { csv, truncated, exportedCount: allRows.length, totalCount: totalCount ?? allRows.length };
}
