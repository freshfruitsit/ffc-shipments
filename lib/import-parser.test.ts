import { describe, it, expect } from "vitest";
import { parseMirsalSheetRows } from "./import-parser";

// Mirrors the REAL structure confirmed against the actual uploaded workbook:
// row 0 (formula error), row 1 (title), row 2 (headers), then alternating
// month-separator and data rows.
function buildSampleSheet(): unknown[][] {
  return [
    ["#VALUE!"],
    ["Air Shipments 2025 (Mirsal 2)"],
    ["SL #", "Date", null, "Origin", "Invoice #", "AWB #", null, "ETA", "Port ", "Reference #", "Declaration #", "Request #", "Status", "Invoice Value", null, "Weights", null, "ZDLM", "MOFAIC"],
    ["January 2025"],
    ["01", new Date("2025-01-01"), "BE Fresh Produce B. V", "Netherlands", "198608", "61538798491", "3V0516", "08:35", "DWC", "001 Jan25 AIR", 1012616993024, "6393409274", "Received", 30459.05, "Euro", 4263.43, 5033, 3529586, "AECI1154234440333774343"],
    ["02", new Date("2025-01-01"), "Frutos Del Valle Patagonico", "Argentina", "115462", "17670237871", "EK0248", "00:20", "DFC", "002 Jan25 AIR", null, null, "Completed", 12000, "US Dollar", 1000, 1200, null, null],
    ["February 2025"],
    ["01", new Date("2025-02-01"), "Heritage Produce", "USA", "3091", "23584481320", "TK0762", "06:50", "DFC", "001 Feb25 AIR", null, null, "Under Review", 5000, "AED", 500, 600, null, null],
    [], // a genuinely blank row, as sometimes appears near sheet boundaries
  ];
}

describe("parseMirsalSheetRows", () => {
  it("skips the formula-error row, title row, and header row", () => {
    const result = parseMirsalSheetRows(buildSampleSheet());
    expect(result.rows).toHaveLength(3);
  });

  it("detects both months as separate labels", () => {
    const result = parseMirsalSheetRows(buildSampleSheet());
    expect(result.monthsDetected).toEqual(["January 2025", "February 2025"]);
  });

  it("assigns the correct source_month to rows after each separator", () => {
    const result = parseMirsalSheetRows(buildSampleSheet());
    expect(result.rows[0].source_month).toBe("January 2025");
    expect(result.rows[1].source_month).toBe("January 2025");
    expect(result.rows[2].source_month).toBe("February 2025");
  });

  it("numbers data rows sequentially across the whole sheet, not per-month", () => {
    const result = parseMirsalSheetRows(buildSampleSheet());
    expect(result.rows.map((r) => r.source_row_number)).toEqual([1, 2, 3]);
  });

  it("extracts supplier, AWB, invoice number, and invoice value correctly", () => {
    const result = parseMirsalSheetRows(buildSampleSheet());
    expect(result.rows[0].raw_values).toMatchObject({
      supplier: "BE Fresh Produce B. V",
      awb: "61538798491",
      invoice_no: "198608",
      invoice_value: 30459.05,
    });
  });

  it("maps a recognized currency name to its ISO code", () => {
    const result = parseMirsalSheetRows(buildSampleSheet());
    expect(result.rows[0].raw_values.currency).toBe("EUR");
    expect(result.rows[1].raw_values.currency).toBe("USD");
  });

  it("passes an already-coded currency through uppercased, unchanged", () => {
    const result = parseMirsalSheetRows(buildSampleSheet());
    expect(result.rows[2].raw_values.currency).toBe("AED");
  });

  it("converts the Date object invoice date to an ISO date string", () => {
    const result = parseMirsalSheetRows(buildSampleSheet());
    expect(result.rows[0].raw_values.invoice_date).toBe("2025-01-01");
  });

  it("preserves net/gross weight as numbers", () => {
    const result = parseMirsalSheetRows(buildSampleSheet());
    expect(result.rows[0].raw_values.net_weight).toBe(4263.43);
    expect(result.rows[0].raw_values.gross_weight).toBe(5033);
  });

  it("preserves the source status text for fn_map_source_status_to_overall to interpret later", () => {
    const result = parseMirsalSheetRows(buildSampleSheet());
    expect(result.rows[0].raw_values.status).toBe("Received");
    expect(result.rows[1].raw_values.status).toBe("Completed");
  });

  it("does not crash on a genuinely blank trailing row", () => {
    expect(() => parseMirsalSheetRows(buildSampleSheet())).not.toThrow();
  });

  it("returns an empty result for an empty sheet", () => {
    const result = parseMirsalSheetRows([]);
    expect(result.rows).toHaveLength(0);
    expect(result.monthsDetected).toHaveLength(0);
  });

  it("handles a row with no invoice value gracefully (null, not NaN or a thrown error)", () => {
    const sheet = buildSampleSheet();
    sheet[4][13] = null;
    const result = parseMirsalSheetRows(sheet);
    expect(result.rows[0].raw_values.invoice_value).toBeNull();
  });
});
