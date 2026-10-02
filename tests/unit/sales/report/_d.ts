// Hand-built report data for the unit tests: small enough to check by hand.
import type { ChainMeta, CustRow, FactRow, OrderRow, ReportData, SkuRow } from "@/app/(sales)/_lib/report/types";

/** 25 months ending at 2026-09, the last one in progress: index 0 = 2024-09 ... 24 = 2026-09. */
export function months25(end = "2026-09"): string[] {
  const [y, m] = end.split("-").map(Number);
  const out: string[] = [];
  for (let k = 24; k >= 0; k--) {
    const t = y * 12 + (m - 1) - k;
    out.push(`${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`);
  }
  return out;
}

export const cust = (name: string, chain = "", last = "", segment = ""): CustRow => [name, chain, "", "", last, segment, ""];
export const sku = (code: string, title: string, family: string): SkuRow => [code, title, "Tea 1 l", family, "—", "תמציות תה", 6500, "TSV"];
/** [monthIdx, custIdx, skuIdx, units, revAgorot, orders] */
export const fact = (m: number, c: number, s: number, units: number, rev: number, orders = 1): FactRow => [m, c, s, units, rev, orders];
/** [custIdx, epochDay, revAgorot, monthIdx, minuteOfDay] */
export const order = (c: number, e: number, rev: number, m: number, minute: number): OrderRow => [c, e, rev, m, minute];

/** Pulled Sunday 2026-09-27 09:15 Israel. Epoch day 1000 = 2026-09-27 (1 = 2024-01-02). */
export function makeD(over: Partial<ReportData> = {}): ReportData {
  return {
    months: months25(),
    partialIdx: 24,
    pulled: "27/09/2026",
    pulledShort: "27/09",
    pulledTime: "09:15",
    epoch0: 19723,
    todayEpoch: 1000,
    cust: [],
    sku: [],
    rows: [],
    orders: [],
    chainMeta: {} as Record<string, ChainMeta>,
    ...over,
  };
}

/** One customer and one SKU; month i carries revenue (i+1) x 1000 shekels. Hand-checkable trend data. */
export function rampD(): ReportData {
  const rows: FactRow[] = [];
  for (let i = 0; i < 25; i++) rows.push(fact(i, 0, 0, i + 1, (i + 1) * 100_000));
  return makeD({ cust: [cust("לקוח א")], sku: [sku("S1", "מוצר א", "FRESH")], rows, orders: [order(0, 990, 100_000, 24, 600)] });
}
