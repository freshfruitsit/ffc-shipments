/**
 * Parses the Mirsal 2 workbook's raw sheet rows (as returned by
 * read-excel-file's readSheet(), i.e. an array of arrays) into the shape
 * stage_import_rows() expects.
 *
 * Real structure, confirmed against the actual uploaded file (not guessed):
 *   Row 1: a stray formula-error cell — skip.
 *   Row 2: a title row ("Air Shipments 2025 (Mirsal 2)") — skip.
 *   Row 3: headers (some blank/merged — SL #, Date, [Supplier], Origin,
 *     Invoice #, AWB #, [Flight], ETA, Port, Reference #, Declaration #,
 *     Request #, Status, Invoice Value, [Currency], Weights, [Gross],
 *     ZDLM, MOFAIC) — skip, columns are addressed by index below, not by
 *     header text, since several headers are blank/merged in the source.
 *   From row 4 on: a month-separator row (single value in column 0, e.g.
 *     "January 2025") alternates with data rows (SL # in column 0, a real
 *     supplier name in column 2).
 *
 * A currency NAME→CODE map is applied for the small set actually seen in
 * this workbook — 'AED' is used as a safe fallback for anything
 * unrecognized rather than leaving currency blank (invoices.currency_code
 * is NOT NULL with an FK to currencies, and defaulting silently to AED
 * would misstate the invoice's real currency) — instead, an unrecognized
 * name is passed through UPPERCASED as-is, which will correctly fail
 * fn_validate_import_batch's downstream FK check and surface as a visible
 * validation issue rather than a silent wrong-currency assumption.
 */

const CURRENCY_NAME_TO_CODE: Record<string, string> = {
  euro: "EUR", "us dollar": "USD", usd: "USD", dollar: "USD",
  "uae dirham": "AED", dirham: "AED", aed: "AED",
  "pound sterling": "GBP", "british pound": "GBP", gbp: "GBP",
  "australian dollar": "AUD", aud: "AUD",
  "argentine peso": "ARS", ars: "ARS",
};

function normalizeCurrency(raw: unknown): string {
  if (raw == null) return "AED";
  const s = String(raw).trim();
  if (!s) return "AED";
  const mapped = CURRENCY_NAME_TO_CODE[s.toLowerCase()];
  return mapped ?? s.toUpperCase();
}

function toIsoDate(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  // Some rows may carry an already-string date depending on cell formatting.
  const parsed = new Date(String(raw));
  return isNaN(parsed.getTime()) ? String(raw) : parsed.toISOString().slice(0, 10);
}

/** Recognizes a month-separator row: exactly one populated cell, in column 0. */
function isMonthSeparatorRow(row: unknown[]): string | null {
  const populated = row.map((v, i) => ({ v, i })).filter((c) => c.v != null && c.v !== "");
  if (populated.length === 1 && populated[0].i === 0 && typeof populated[0].v === "string") {
    return populated[0].v;
  }
  return null;
}

/** A data row has a serial number in column 0 and a real supplier name in column 2. */
function isDataRow(row: unknown[]): boolean {
  return row[0] != null && row[0] !== "" && typeof row[2] === "string" && row[2].trim().length > 0;
}

export type ParsedStagingRow = {
  source_row_number: number;
  source_month: string | null;
  raw_values: Record<string, unknown>;
};

export type ParseResult = {
  rows: ParsedStagingRow[];
  monthsDetected: string[];
  skippedRowCount: number;
};

/**
 * Pure function: sheet data in, staged rows out. Kept independent of the
 * File/Blob-reading layer (that's parseExcelFile in import-file-reader.ts)
 * specifically so this logic is unit-testable without a browser or a real
 * .xlsx file — see lib/import-parser.test.ts.
 */
export function parseMirsalSheetRows(sheetRows: unknown[][]): ParseResult {
  const rows: ParsedStagingRow[] = [];
  const monthsDetected = new Set<string>();
  let currentMonth: string | null = null;
  let sourceRowNumber = 0;
  let skippedRowCount = 0;

  // Skip the first 3 rows (formula-error cell, title, headers) — real,
  // confirmed structure, not a guess.
  for (let i = 3; i < sheetRows.length; i++) {
    const row = sheetRows[i];
    if (!row || row.every((v) => v == null || v === "")) continue;

    const monthLabel = isMonthSeparatorRow(row);
    if (monthLabel) {
      currentMonth = monthLabel;
      monthsDetected.add(monthLabel);
      continue;
    }

    if (!isDataRow(row)) {
      skippedRowCount++;
      continue;
    }

    sourceRowNumber++;
    rows.push({
      source_row_number: sourceRowNumber,
      source_month: currentMonth,
      raw_values: {
        supplier: String(row[2]).trim(),
        origin: row[3] != null ? String(row[3]).trim() : null,
        invoice_no: row[4] != null ? String(row[4]).trim() : null,
        awb: row[5] != null ? String(row[5]).trim() : null,
        flight: row[6] != null ? String(row[6]).trim() : null,
        port: row[8] != null ? String(row[8]).trim() : null,
        portal_reference: row[9] != null ? String(row[9]).trim() : null,
        declaration_no: row[10] != null ? String(row[10]).trim() : null,
        request_no: row[11] != null ? String(row[11]).trim() : null,
        status: row[12] != null ? String(row[12]).trim() : null,
        invoice_date: toIsoDate(row[1]),
        invoice_value: row[13] != null ? Number(row[13]) : null,
        currency: normalizeCurrency(row[14]),
        net_weight: row[15] != null ? Number(row[15]) : null,
        gross_weight: row[16] != null ? Number(row[16]) : null,
        zdlm_reference: row[17] != null ? String(row[17]).trim() : null,
        mofaic_reference: row[18] != null ? String(row[18]).trim() : null,
      },
    });
  }

  return { rows, monthsDetected: [...monthsDetected], skippedRowCount };
}
