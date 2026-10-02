// The sales report's data, exactly as the backend serves it.
//
// `ReportData` is build_report.py's `D`, unchanged: the report is computed in the
// browser from this one blob, so its shape is the contract. Every array is
// positional; the comments name the positions.

/** [name, chain, pricingTags, firstISO, lastISO, segment, kind] */
export type CustRow = [string, string, string, string, string, string, string];
/** [sku, title, type, family, sugar, category, priceAgorot | null, source] */
export type SkuRow = [string, string, string, string, string, string, number | null, string];
/** [monthIdx, custIdx, skuIdx, units, revenueAgorot, orders] */
export type FactRow = [number, number, number, number, number, number];
/** [custIdx, epochDay (days since 2024-01-01), revenueAgorot, monthIdx, minuteOfDayIsrael] */
export type OrderRow = [number, number, number, number, number];

export interface ChainMeta {
  segment?: string;
  kind?: string;
  status?: string;
  movedTo?: string;
  movedOn?: string;
  serves?: string[];
  rosterBadge?: string;
  group?: string;
  /** customer record name → branch label, for a branch that has two records */
  merge?: Record<string, string>;
  note?: string;
}

export interface ReportData {
  /** 25 x "YYYY-MM"; the last is the month in progress */
  months: string[];
  partialIdx: number;
  /** "DD/MM/YYYY" */
  pulled: string;
  /** "DD/MM" */
  pulledShort: string;
  /** "HH:MM", Israel time */
  pulledTime: string;
  /** days from 1970-01-01 to 2024-01-01 */
  epoch0: number;
  /** days from 2024-01-01 to the pull date */
  todayEpoch: number;
  cust: CustRow[];
  sku: SkuRow[];
  rows: FactRow[];
  orders: OrderRow[];
  chainMeta: Record<string, ChainMeta>;
}

export type ReportState = "ready" | "never";
export type AttemptStatus = "published" | "unchanged" | "failed" | "skipped" | "running";

export interface ReportAttempt {
  at: string;
  status: AttemptStatus;
  error_code: string | null;
}

export interface ReportPayload {
  state: ReportState;
  /** the Shopify data time of what is served */
  data_at: string | null;
  published_at: string | null;
  last_attempt: ReportAttempt | null;
  /** server says: now - data_at > 45 minutes */
  stale: boolean;
  notes: { historic_sku_over_threshold?: number };
  data: ReportData | null;
}

export type Unit = "rev" | "units";
/** "all" | "12" (the twelve closed months) | a year such as "2026" */
export type Period = string;
export type ReportTab = "daily" | "cust" | "prod" | "chain" | "trend";
export type GridDim = "cust" | "fam" | "chain" | "sku";

/** Agorot per shekel: money in D is in agorot. */
export const AG = 100;
