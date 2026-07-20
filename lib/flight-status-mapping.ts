import type { FlightStatus } from "@/lib/types/database";

/**
 * Maps AviationStack's own status vocabulary (scheduled/active/landed/
 * cancelled/incident/diverted) onto ours (Booked/Manifested/Departed/
 * Delayed/In Transit/Cancelled) — never a perfect 1:1 mapping, so this
 * is a SUGGESTION a person confirms, not something auto-applied.
 *
 * Deliberately returns null for 'incident' and 'diverted' — those are
 * genuine judgment calls, not something to guess at. Also never suggests
 * 'In Transit': that specifically means the shipment is connecting
 * through a layover airport, a real business concept a single flight-
 * number lookup has no way to determine.
 */
export function mapToSuggestedStatus(rawStatus: string, departureDelayMinutes: number | null): FlightStatus | null {
  // Cancelled takes priority over everything else — a cancelled flight
  // can still carry delay data from before it was cancelled, and
  // "Cancelled" is a more definitive, more important state than "merely
  // delayed" for anyone reading this.
  if (rawStatus === "cancelled") return "Cancelled";

  // A meaningfully delayed departure is "Delayed" regardless of whether
  // AviationStack still calls the flight 'scheduled' or already 'active' —
  // delay is reported as a separate field from their own status enum.
  if (departureDelayMinutes !== null && departureDelayMinutes >= 15) return "Delayed";

  switch (rawStatus) {
    case "scheduled": return "Booked";
    case "active": return "Departed";
    // AviationStack's 'landed' has no distinct match in our enum (we
    // don't track "arrived" separately from "departed") — closest
    // reasonable value, not a perfect one.
    case "landed": return "Departed";
    // 'incident' and 'diverted' deliberately return null.
    default: return null;
  }
}
