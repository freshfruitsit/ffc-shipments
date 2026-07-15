import { describe, it, expect } from "vitest";
import { dubaiTodayISODate, formatDubaiDate, formatDubaiDateTime, daysFromDubaiNow } from "@/lib/dates";

describe("dubaiTodayISODate", () => {
  it("returns a YYYY-MM-DD string", () => {
    expect(dubaiTodayISODate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("formatDubaiDate", () => {
  it("formats an ISO date as day/short-month/year", () => {
    // Chosen away from midnight boundaries so it can't flip a day under
    // Asia/Dubai (UTC+4) regardless of the machine's local timezone.
    expect(formatDubaiDate("2026-03-15T12:00:00Z")).toBe("15 Mar 2026");
  });

  it("returns an em dash for null/undefined", () => {
    expect(formatDubaiDate(null)).toBe("—");
    expect(formatDubaiDate(undefined)).toBe("—");
  });

  it("converts a late-UTC timestamp into the correct next Dubai day", () => {
    // 23:00 UTC on the 14th is 03:00 on the 15th in Dubai (UTC+4) — this is
    // exactly the class of bug plain new Date().toISOString().slice(0,10)
    // introduces when the server isn't in Asia/Dubai.
    expect(formatDubaiDate("2026-03-14T23:00:00Z")).toBe("15 Mar 2026");
  });
});

describe("formatDubaiDateTime", () => {
  it("formats an ISO timestamp as date + 24h time in Dubai", () => {
    expect(formatDubaiDateTime("2026-03-15T10:30:00Z")).toBe("15 Mar 2026, 14:30");
  });

  it("returns an em dash for null/undefined", () => {
    expect(formatDubaiDateTime(null)).toBe("—");
  });
});

describe("daysFromDubaiNow", () => {
  it("returns null for a null input", () => {
    expect(daysFromDubaiNow(null)).toBeNull();
  });

  it("returns 0 for a timestamp on today's Dubai date", () => {
    const todayNoon = dubaiTodayISODate() + "T12:00:00+04:00";
    expect(daysFromDubaiNow(todayNoon)).toBe(0);
  });

  it("returns a negative number for a past date", () => {
    const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const result = daysFromDubaiNow(past);
    expect(result).toBeLessThanOrEqual(-4);
    expect(result).toBeGreaterThanOrEqual(-6);
  });
});
