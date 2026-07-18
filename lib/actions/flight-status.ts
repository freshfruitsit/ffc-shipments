"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { friendlyRpcError } from "@/lib/actions/errors";
import { mapToSuggestedStatus } from "@/lib/flight-status-mapping";
import type { FlightStatus } from "@/lib/types/database";

export type LiveFlightStatus = {
  raw_status: string;
  airline_name: string | null;
  departure_airport: string | null;
  departure_scheduled: string | null;
  departure_estimated: string | null;
  departure_actual: string | null;
  departure_delay_minutes: number | null;
  arrival_airport: string | null;
  arrival_scheduled: string | null;
  arrival_estimated: string | null;
  arrival_actual: string | null;
  arrival_delay_minutes: number | null;
  /**
   * null specifically for 'incident'/'diverted' — those need a person's
   * judgment, not a guessed mapping. AviationStack's own status values
   * (scheduled/active/landed/cancelled/incident/diverted) don't map 1:1
   * onto ours; in particular 'In Transit' specifically means connecting
   * through a layover airport, which a single flight-number lookup has
   * no way to know, so it's never suggested here — only ever set by hand.
   */
  suggested_status: FlightStatus | null;
};

export type LiveFlightStatusResult = { error?: string; data?: LiveFlightStatus };

export async function checkLiveFlightStatusAction(flightNumber: string): Promise<LiveFlightStatusResult> {
  const trimmed = flightNumber.trim().toUpperCase();
  if (!trimmed) {
    return { error: "No flight number is set for this shipment yet." };
  }

  const apiKey = process.env.AVIATIONSTACK_API_KEY?.trim();
  if (!apiKey) {
    return { error: "Live flight status isn't configured yet." };
  }

  let response: Response;
  try {
    const url = new URL("https://api.aviationstack.com/v1/flights");
    url.searchParams.set("access_key", apiKey);
    url.searchParams.set("flight_iata", trimmed);
    response = await fetch(url.toString());
  } catch {
    return { error: "Couldn't reach the flight status service. Check your connection and try again." };
  }

  if (!response.ok) {
    return { error: "The flight status service didn't respond. Try again shortly." };
  }

  const json = await response.json();

  if (json.error) {
    // AviationStack's own error shape: { error: { code, message } }
    return { error: json.error.message || "The flight status service reported an error." };
  }

  const flights = Array.isArray(json.data) ? json.data : [];
  if (flights.length === 0) {
    return { error: `No current flight data found for ${trimmed}. It may not be scheduled today, or the flight number may not match this airline's IATA format.` };
  }

  const flight = flights[0];
  const departureDelay: number | null = typeof flight.departure?.delay === "number" ? flight.departure.delay : null;

  return {
    data: {
      raw_status: flight.flight_status ?? "unknown",
      airline_name: flight.airline?.name ?? null,
      departure_airport: flight.departure?.airport ?? null,
      departure_scheduled: flight.departure?.scheduled ?? null,
      departure_estimated: flight.departure?.estimated ?? null,
      departure_actual: flight.departure?.actual ?? null,
      departure_delay_minutes: departureDelay,
      arrival_airport: flight.arrival?.airport ?? null,
      arrival_scheduled: flight.arrival?.scheduled ?? null,
      arrival_estimated: flight.arrival?.estimated ?? null,
      arrival_actual: flight.arrival?.actual ?? null,
      arrival_delay_minutes: typeof flight.arrival?.delay === "number" ? flight.arrival.delay : null,
      suggested_status: mapToSuggestedStatus(flight.flight_status, departureDelay),
    },
  };
}

/**
 * Applies just the flight_status suggestion, without disturbing anything
 * else on the shipment's transport record. update_shipment_transport
 * requires every field on each call (it's a full-record update, not a
 * patch) — so this fetches the shipment's current transport data first
 * and re-sends it unchanged alongside the one field that's actually
 * changing, rather than risk nulling out AWB, airline, weights, etc.
 */
export async function applySuggestedFlightStatusAction(
  shipmentId: string,
  newStatus: FlightStatus
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();

  const { data: tab, error: fetchError } = await supabase.rpc("get_shipment_transport_tab", { p_shipment_id: shipmentId });
  if (fetchError || !tab) {
    return { error: "Couldn't load this shipment's current transport details." };
  }

  const t = tab as unknown as {
    awb: string | null; airline_id: string | null; flight: string | null; eta: string | null;
    port_id: string | null; freight_agent_id: string | null; clearing_agent_id: string | null;
    packages: number | null; net_weight: number | null; gross_weight: number | null; transport_remarks: string | null;
  };

  const { error } = await supabase.rpc("update_shipment_transport", {
    p_shipment_id: shipmentId,
    p_awb: t.awb,
    p_airline_id: t.airline_id,
    p_flight: t.flight,
    p_eta: t.eta,
    p_port_id: t.port_id,
    p_freight_agent_id: t.freight_agent_id,
    p_clearing_agent_id: t.clearing_agent_id,
    p_packages: t.packages,
    p_net_weight: t.net_weight,
    p_gross_weight: t.gross_weight,
    p_transport_remarks: t.transport_remarks,
    p_flight_status: newStatus,
    // Never carried over from a live-status suggestion — In Transit is a
    // real business concept (connecting through a layover) that a flight-
    // number lookup can't determine, so it's never auto-suggested at all
    // (see mapToSuggestedStatus), meaning this path can never legitimately
    // need to set one.
    p_transit_airport: null,
  });

  if (error) return { error: friendlyRpcError(error.message) };

  revalidatePath(`/shipments/${shipmentId}`, "layout");
  return { success: true };
}
