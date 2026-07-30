import { describe, expect, it } from "vitest";
import { formatIsraeliDate } from "./format-date";

describe("formatIsraeliDate", () => {
  it("renders an ISO date the Israeli way", () => {
    expect(formatIsraeliDate("2026-07-10")).toBe("10/07/2026");
    expect(formatIsraeliDate("2026-12-31")).toBe("31/12/2026");
  });

  it("accepts a datetime and uses its date part", () => {
    expect(formatIsraeliDate("2026-07-10T08:00:00.000Z")).toBe("10/07/2026");
  });

  it("returns an empty string for nothing", () => {
    expect(formatIsraeliDate(null)).toBe("");
    expect(formatIsraeliDate(undefined)).toBe("");
    expect(formatIsraeliDate("   ")).toBe("");
  });

  it("passes an unrecognised value through instead of printing a lie", () => {
    // An operator surface degrades to the raw value — never to "Invalid Date"
    // and never to a plausible-looking wrong date.
    expect(formatIsraeliDate("לא ידוע")).toBe("לא ידוע");
    expect(formatIsraeliDate("25/06/2026")).toBe("25/06/2026");
  });
});
