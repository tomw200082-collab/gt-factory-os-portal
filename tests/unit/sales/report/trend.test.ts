import { describe, it, expect } from "vitest";
import { monthlyTotals, trendTiles, yearMatrix, yoyBars } from "@/app/(sales)/_lib/report/trend";
import { cust, fact, makeD, rampD, sku } from "./_d";

// rampD: month i carries (i+1) x 1,000 shekels, i = 0..24, so every figure below is arithmetic.
const D = rampD();
const K = 100_000; // 1,000 shekels in agorot

describe("monthly totals", () => {
  it("sums every month in the unit asked for", () => {
    const all = monthlyTotals(D, "rev");
    expect(all).toHaveLength(25);
    expect(all[0]).toBe(1 * K);
    expect(all[24]).toBe(25 * K);
    expect(monthlyTotals(D, "units")[23]).toBe(24);
  });
});

describe("trend tiles", () => {
  const t = trendTiles(D, "rev");

  it("compares the twelve closed months with the twelve before them", () => {
    expect(t.t12).toBe(222 * K); // months 12..23 = 13 + ... + 24
    expect(t.p12).toBe(78 * K); // months 0..11 = 1 + ... + 12
    expect(t.d12).toBeCloseTo(((222 - 78) / 78) * 100, 6); // +184.6%
  });

  it("compares the last full month with the same month last year", () => {
    expect(t.lastFullIdx).toBe(23);
    expect(t.lastFull).toBe(24 * K);
    expect(t.dj).toBeCloseTo(100, 6); // 24 against 12
  });

  it("annualises the mean of the last three full months", () => {
    // (22 + 23 + 24) / 3 x 12 = 276
    expect(t.rate).toBe(276 * K);
  });

  it("reports the month in progress on its own, never against anything", () => {
    expect(t.partial).toBe(25 * K);
  });

  it("has no percentage where the base year had nothing", () => {
    const D0 = makeD({ cust: [cust("א")], sku: [sku("S", "ת", "F")], rows: [fact(23, 0, 0, 1, 500_000), fact(24, 0, 0, 1, 1)] });
    const t0 = trendTiles(D0, "rev");
    expect(t0.d12).toBeNull();
    expect(t0.dj).toBeNull();
  });
});

describe("year over year bars", () => {
  const bars = yoyBars(D, "rev");

  it("has one bar for each month that has a month a year earlier", () => {
    expect(bars).toHaveLength(13); // months 12..24
    expect(bars[0].i).toBe(12);
    expect(bars[12].i).toBe(24);
  });

  it("reads each month against the same month last year", () => {
    expect(bars[0].pct).toBeCloseTo(1200, 6); // 13 against 1
    expect(bars[3].pct).toBeCloseTo(300, 6); // month 15: 16 against 4
    expect(bars[4].pct).toBeCloseTo(240, 6); // month 16: 17 against 5
  });

  it("marks only the month in progress as partial", () => {
    expect(bars.filter((b) => b.partial).map((b) => b.i)).toEqual([24]);
    expect(bars[11].pct).toBeCloseTo(100, 6); // month 23: 24 against 12
    expect(bars[12].pct).toBeCloseTo((12 / 13) * 100, 6); // month 24: 25 against 13
  });
});

describe("years x months matrix", () => {
  const matrix = yearMatrix(D, "rev");

  it("derives its rows from the data", () => {
    expect(matrix.map((r) => r.year)).toEqual(["2024", "2025", "2026"]);
  });

  it("puts each month in its calendar column and leaves the others empty", () => {
    const y24 = matrix[0];
    expect(y24.cells).toHaveLength(12);
    expect(y24.cells[8]).toMatchObject({ month: 9, i: 0, v: 1 * K }); // 2024-09 is the first month
    expect(y24.cells[0].v).toBeNull(); // January 2024 is not in the data
    expect(matrix[2].cells[8]).toMatchObject({ month: 9, i: 24, v: 25 * K, partial: true });
  });

  it("totals a year over the months it has, the month in progress included", () => {
    expect(matrix[0].total).toBe(10 * K); // 1 + 2 + 3 + 4
    expect(matrix[2].total).toBe(189 * K); // 17 + ... + 25
  });

  it("grows over overlapping FULL months only", () => {
    expect(matrix[0].growth).toBeNull(); // no 2023
    // 2025 against 2024: Sep..Dec only = (13+14+15+16) against (1+2+3+4)
    expect(matrix[1].growth).toBeCloseTo(((58 - 10) / 10) * 100, 6);
    // 2026 against 2025: Jan..Aug, the partial September left out = 164 against 68
    expect(matrix[2].growth).toBeCloseTo(((164 - 68) / 68) * 100, 6);
  });

  it("shades a month against its own year's average", () => {
    // 2026 averages 21 (17..25); month 16 (Jan, 17) is 19% under, September (25) is 19% over
    const jan = matrix[2].cells[0];
    expect(jan.v).toBe(17 * K);
    expect(jan.heat).toEqual({ dir: "down", alpha: +(0.07 + 0.3 * (4 / 21)).toFixed(3) });
    expect(matrix[2].cells[8].heat).toEqual({ dir: "up", alpha: +(0.07 + 0.3 * (4 / 21)).toFixed(3) });
    // Mid-year (21) sits on the average
    expect(matrix[2].cells[4].heat).toBeNull();
  });
});
