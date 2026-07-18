import { describe, it, expect } from "vitest";
import { mapToSuggestedStatus } from "./flight-status-mapping";

describe("mapToSuggestedStatus", () => {
  it("maps 'scheduled' to 'Booked' when there's no meaningful delay", () => {
    expect(mapToSuggestedStatus("scheduled", null)).toBe("Booked");
    expect(mapToSuggestedStatus("scheduled", 0)).toBe("Booked");
    expect(mapToSuggestedStatus("scheduled", 5)).toBe("Booked");
  });

  it("maps 'active' to 'Departed' when there's no meaningful delay", () => {
    expect(mapToSuggestedStatus("active", null)).toBe("Departed");
  });

  it("maps 'landed' to 'Departed' (closest available match, not a perfect one)", () => {
    expect(mapToSuggestedStatus("landed", null)).toBe("Departed");
  });

  it("maps 'cancelled' to 'Cancelled' regardless of delay", () => {
    expect(mapToSuggestedStatus("cancelled", null)).toBe("Cancelled");
    expect(mapToSuggestedStatus("cancelled", 30)).toBe("Cancelled");
  });

  it("never suggests anything for 'incident' or 'diverted' — genuine judgment calls", () => {
    expect(mapToSuggestedStatus("incident", null)).toBeNull();
    expect(mapToSuggestedStatus("diverted", null)).toBeNull();
  });

  it("returns null for an unrecognized status", () => {
    expect(mapToSuggestedStatus("something_unexpected", null)).toBeNull();
  });

  it("suggests 'Delayed' once departure delay reaches the 15-minute threshold, overriding the raw status", () => {
    expect(mapToSuggestedStatus("scheduled", 15)).toBe("Delayed");
    expect(mapToSuggestedStatus("active", 20)).toBe("Delayed");
    expect(mapToSuggestedStatus("landed", 45)).toBe("Delayed");
  });

  it("does NOT suggest 'Delayed' for a delay just under the threshold", () => {
    expect(mapToSuggestedStatus("scheduled", 14)).toBe("Booked");
  });

  it("never suggests 'In Transit' under any input — that's a layover concept a flight-number lookup can't know", () => {
    const allStatuses = ["scheduled", "active", "landed", "cancelled", "incident", "diverted", "unknown"];
    const allDelays = [null, 0, 14, 15, 60, 500];
    for (const status of allStatuses) {
      for (const delay of allDelays) {
        expect(mapToSuggestedStatus(status, delay)).not.toBe("In Transit");
      }
    }
  });
});
