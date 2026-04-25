// tests/unit/admin/recipe-readiness-format-age.test.ts
import { describe, expect, it } from "vitest";
import { formatPriceAge, priceAgeDays } from "@/lib/admin/recipe-readiness";

describe("formatPriceAge", () => {
  const NOW = new Date("2026-04-25T12:00:00Z").getTime();

  it("returns 'אין מחיר פעיל' when input is null", () => {
    expect(formatPriceAge(null, NOW)).toBe("No active price");
  });

  it("returns '0 ימים' for the same instant", () => {
    expect(formatPriceAge("2026-04-25T12:00:00Z", NOW)).toBe("today");
  });

  it("returns 'יום 1' (singular) for exactly 24h ago", () => {
    expect(formatPriceAge("2026-04-24T12:00:00Z", NOW)).toBe("1 day ago");
  });

  it("returns '{N} ימים' for 2..n days ago", () => {
    expect(formatPriceAge("2026-04-15T12:00:00Z", NOW)).toBe("10 days ago");
  });

  it("clamps a future timestamp to '0 ימים' rather than negative", () => {
    expect(formatPriceAge("2026-05-01T12:00:00Z", NOW)).toBe("today");
  });

  it("returns 'אין מחיר פעיל' when input is malformed", () => {
    expect(formatPriceAge("not-a-date", NOW)).toBe("No active price");
  });

  it("threshold-edge: exactly 89, 90, 91 days produce sequential day counts", () => {
    expect(formatPriceAge("2026-01-26T12:00:00Z", NOW)).toBe("89 days ago");
    expect(formatPriceAge("2026-01-25T12:00:00Z", NOW)).toBe("90 days ago");
    expect(formatPriceAge("2026-01-24T12:00:00Z", NOW)).toBe("91 days ago");
  });

  it("threshold-edge: 180-day boundary", () => {
    expect(formatPriceAge("2025-10-27T12:00:00Z", NOW)).toBe("180 days ago");
    expect(formatPriceAge("2025-10-26T12:00:00Z", NOW)).toBe("181 days ago");
  });
});

describe("priceAgeDays — pure days helper consumed by readiness rules", () => {
  const NOW = new Date("2026-04-25T12:00:00Z").getTime();
  it("returns null when input is null or malformed", () => {
    expect(priceAgeDays(null, NOW)).toBeNull();
    expect(priceAgeDays("not-a-date", NOW)).toBeNull();
  });
  it("clamps a future timestamp to 0", () => {
    expect(priceAgeDays("2026-05-01T12:00:00Z", NOW)).toBe(0);
  });
  it("returns floored integer days for past timestamps", () => {
    expect(priceAgeDays("2026-04-23T12:00:00Z", NOW)).toBe(2);
    // 23h ago floors to 0 (not yet a full day)
    expect(priceAgeDays("2026-04-24T13:00:00Z", NOW)).toBe(0);
    // 25h ago floors to 1
    expect(priceAgeDays("2026-04-24T11:00:00Z", NOW)).toBe(1);
  });
});
