import { describe, it, expect } from "vitest";
import { defaultPeriod, monthLabel, monthName, periodMonths, periodYears, priorMap } from "@/app/(sales)/_lib/report/period";
import { months25 } from "./_d";

const M = months25(); // 0 = 2024-09 ... 12 = 2025-09 ... 16 = 2026-01 ... 24 = 2026-09 (in progress)

describe("report periods", () => {
  it("builds 25 months ending at the month in progress", () => {
    expect(M).toHaveLength(25);
    expect(M[0]).toBe("2024-09");
    expect(M[24]).toBe("2026-09");
  });

  it("'all' is every month, '12' is the twelve closed months before the one in progress", () => {
    expect(periodMonths(M, "all")).toEqual(Array.from({ length: 25 }, (_, i) => i));
    // NP-13 .. NP-2 = 12 .. 23
    expect(periodMonths(M, "12")).toEqual([12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
  });

  it("a year is the months that start with it", () => {
    expect(periodMonths(M, "2026")).toEqual([16, 17, 18, 19, 20, 21, 22, 23, 24]);
    expect(periodMonths(M, "2025")).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(periodMonths(M, "2024")).toEqual([0, 1, 2, 3]);
  });

  it("derives the years from the data, never from a constant", () => {
    expect(periodYears(M)).toEqual(["2024", "2025", "2026"]);
    expect(periodYears(months25("2027-02"))).toEqual(["2025", "2026", "2027"]);
  });

  it("opens on the year of the month in progress", () => {
    expect(defaultPeriod({ months: M, partialIdx: 24 })).toBe("2026");
    expect(defaultPeriod({ months: months25("2027-02"), partialIdx: 24 })).toBe("2027");
  });

  it("labels months the way the Artifact does", () => {
    expect(monthLabel(M, 0)).toBe("ספט׳ 24");
    expect(monthLabel(M, 24)).toBe("ספט׳ 26");
    expect(monthLabel(M, 16)).toBe("ינו׳ 26");
    expect(monthName(M, 23)).toBe("אוגוסט");
  });
});

describe("prior-year month map", () => {
  it("maps each month to the same month a year earlier", () => {
    expect(priorMap(M, [16, 17, 24])).toEqual({ 16: 4, 17: 5, 24: 12 });
  });

  it("is null as soon as one month has no prior year, so there is no YoY column", () => {
    // 2025 starts in 2025-01, whose prior (2024-01) is not in the data; 'all' includes 2024-09 too
    expect(priorMap(M, periodMonths(M, "2025"))).toBeNull();
    expect(priorMap(M, periodMonths(M, "all"))).toBeNull();
    expect(priorMap(M, periodMonths(M, "2024"))).toBeNull();
  });

  it("holds for the closed twelve months and for the current year", () => {
    const p12 = priorMap(M, periodMonths(M, "12"));
    expect(p12).not.toBeNull();
    expect(p12?.[12]).toBe(0);
    expect(p12?.[23]).toBe(11);
    expect(priorMap(M, periodMonths(M, "2026"))).not.toBeNull();
  });
});
