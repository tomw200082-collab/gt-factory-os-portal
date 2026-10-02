import { describe, it, expect } from "vitest";
import { buildGrid } from "@/app/(sales)/_lib/report/aggregate";
import { chainsCsvRows, gridCsvRows, matrixCsvRows, retroCsvRows, toCsv } from "@/app/(sales)/_lib/report/csv";
import { buildChains } from "@/app/(sales)/_lib/report/chains";
import { buildDaily, retroRows } from "@/app/(sales)/_lib/report/daily";
import { periodMonths } from "@/app/(sales)/_lib/report/period";
import { yearMatrix } from "@/app/(sales)/_lib/report/trend";
import { cust, fact, makeD, order, rampD, sku } from "./_d";

describe("CSV", () => {
  it("quotes every cell, doubles quotes, flattens whitespace and starts with a byte-order mark for Excel", () => {
    expect(toCsv([["a", 'b"c'], ["1", "2 \n  3"]])).toBe('﻿"a","b""c"\n"1","2 3"');
  });

  const D = makeD({
    cust: [cust("קפה א"), cust("קפה ב", "רשת X")],
    sku: [sku("S1", "תה", "FRESH")],
    rows: [fact(16, 0, 0, 1, 200_000), fact(17, 1, 0, 1, 80_000), fact(4, 0, 0, 1, 100_000)],
  });

  it("writes the customers grid as the screen shows it: month columns, total, share and year over year", () => {
    const g = buildGrid(D, { dim: "cust", period: "2026", unit: "rev", q: "", sort: { col: "tot", dir: "desc" } });
    const rows = gridCsvRows(D, g, "cust", "rev");
    expect(rows[0].slice(0, 3)).toEqual(["לקוח", "ינו׳ 26", "פבר׳ 26"]);
    expect(rows[0].slice(-4)).toEqual(["ספט׳ 26 *", "סה״כ", "%", "מול אשתקד"]);
    // קפה א: 2,000 shekels in January, all of it the total; 2,000 against 1,000 last year
    expect(rows[1].slice(0, 2)).toEqual(["קפה א", "2000"]);
    expect(rows[1].slice(-3)).toEqual(["2000", "71.4%", "+100%"]);
    expect(rows[2][0]).toBe("קפה ב");
    expect(rows[2].slice(-1)).toEqual(["חדש"]);
    expect(rows.at(-1)?.[0]).toBe("סה״כ");
  });

  it("writes the chains tree flattened with its level, and the matrix and retro table", () => {
    const ms = periodMonths(D.months, "2026");
    const c = buildChains(D, ms, "rev");
    const rows = chainsCsvRows(D, c, ms, "rev");
    expect(rows[0][0]).toBe("רשת · סניף · מוצר");
    expect(rows.at(-1)?.[0]).toBe("סה״כ רשתות");
    const m = matrixCsvRows(yearMatrix(rampD(), "rev"), "rev");
    expect(m[0].slice(0, 2)).toEqual(["שנה", "ינו׳"]);
    expect(m[3].slice(-2)).toEqual(["189000", "+141%"]); // 2026: 189,000 shekels; growth 141%
    const d2 = makeD({ cust: [cust("א")], orders: [order(0, 995, 10_000, 24, 600), order(0, 1000, 5_000, 24, 500)] });
    const r = retroCsvRows(retroRows(d2, buildDaily(d2), 14), d2);
    expect(r[0]).toEqual(["תאריך", "יום", "מחזור", "הזמנות", "ממוצע להזמנה", "מול רגיל", "הלקוח הגדול של היום"]);
    expect(r[1].slice(0, 2)).toEqual(["27/9", "ראשון"]);
  });
});
