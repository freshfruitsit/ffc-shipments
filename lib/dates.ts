/**
 * All business dates in this app are Dubai-local (Asia/Dubai, UTC+4,
 * no DST) — the shipment_date default, ETA display, dashboard aging
 * calculations, and any future deadline logic all need to agree on "today"
 * in Dubai terms, not whatever timezone the server or browser happens to
 * be running in. Centralizing this here means every screen agrees.
 */

const DUBAI_TZ = "Asia/Dubai";

/** Today's date in Dubai, as YYYY-MM-DD — for date input defaultValues. */
export function dubaiTodayISODate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DUBAI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Format an ISO timestamp/date as a Dubai-local date, e.g. "15 Jul 2026". */
export function formatDubaiDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: DUBAI_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

/** Format an ISO timestamp as Dubai-local date + time, e.g. "15 Jul 2026, 14:30". */
export function formatDubaiDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: DUBAI_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

/**
 * Whole days between now (Dubai-local) and a future/past ISO timestamp —
 * for aging/deadline logic (e.g. "ETA passed 2 days ago"). Positive = future,
 * negative = past.
 */
export function daysFromDubaiNow(value: string | null | undefined): number | null {
  if (!value) return null;
  const target = new Date(value);
  const nowDubaiMidnight = new Date(dubaiTodayISODate() + "T00:00:00+04:00");
  const targetDubaiMidnight = new Date(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: DUBAI_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(target) + "T00:00:00+04:00"
  );
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((targetDubaiMidnight.getTime() - nowDubaiMidnight.getTime()) / msPerDay);
}
