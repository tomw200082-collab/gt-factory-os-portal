// Grouping the fact rows: by customer, chain, family or SKU, over a period, in shekels or
// units. Pure: no DOM, no React.
//
// Ported from report_template.html (keyOf, aggregate, priorTotals, spark, heatStyle,
// renderGrid). Definitions that stay as they were:
//   - a customer is keyed by NAME, so two Shopify records with one name are one row;
//   - the YoY cell reads "new" while last year's figure is under 1,000 shekels (or 100 units);
//   - a month is shaded only when it is 8% or more away from the row's own monthly average.
// Fixed here, with no change to a definition: the total row's prior year covers the same
// filtered rows as the total itself, and search ignores case.

import { periodMonths, priorMap } from "./period";
import { REPORT_UI } from "../labels";
import type { GridDim, Period, ReportData, Unit } from "./types";

/** A family that exists only to carry delivery and deposits: shown only when it sold something. */
export const SERVICE_FAMILIES: ReadonlySet<string> = new Set(["משלוח", "פיקדונות", "התחשבנויות"]);

export function custChain(d: ReportData, c: number): string {
  return d.cust[c][1] || REPORT_UI.noChain;
}

export function keyOf(d: ReportData, dim: GridDim, c: number, s: number): string {
  if (dim === "cust") return d.cust[c][0] || REPORT_UI.noName;
  if (dim === "chain") return custChain(d, c);
  if (dim === "fam") return d.sku[s][3];
  return `${d.sku[s][0]} · ${d.sku[s][1] || ""}`;
}

export interface AggRow {
  k: string;
  /** month index → value (agorot or units) */
  months: Record<number, number>;
  tot: number;
  /** the first customer / SKU index seen for this key: carries the chain label */
  c: number;
  s: number;
}

export interface Parent {
  dim: GridDim;
  key: string;
}

export function aggregate(d: ReportData, dim: GridDim, ms: readonly number[], unit: Unit, parent?: Parent): AggRow[] {
  const mset = new Set(ms);
  const rows = new Map<string, AggRow>();
  for (const r of d.rows) {
    if (!mset.has(r[0])) continue;
    if (parent && keyOf(d, parent.dim, r[1], r[2]) !== parent.key) continue;
    const k = keyOf(d, dim, r[1], r[2]);
    if (!k) continue;
    let row = rows.get(k);
    if (!row) {
      row = { k, months: {}, tot: 0, c: r[1], s: r[2] };
      rows.set(k, row);
    }
    const v = unit === "rev" ? r[4] : r[3];
    row.months[r[0]] = (row.months[r[0]] || 0) + v;
    row.tot += v;
  }
  return [...rows.values()];
}

/** key → value over the prior-year months of `pmap`. Empty when the period has no complete prior year. */
export function priorTotals(
  d: ReportData,
  dim: GridDim,
  pmap: Record<number, number> | null,
  unit: Unit,
  parent?: Parent,
): Map<string, number> {
  const out = new Map<string, number>();
  if (!pmap) return out;
  for (const row of aggregate(d, dim, Object.values(pmap), unit, parent)) out.set(row.k, row.tot);
  return out;
}

const num = (n: number) => String(+n.toFixed(2));

/** The row's twelve-odd months as a line. Null for fewer than two months: a point is not a trend. */
export function sparkPoints(vals: readonly number[], w = 86, h = 20): { path: string; last: [number, number] } | null {
  if (vals.length < 2) return null;
  const mx = Math.max(...vals, 1);
  const X = (i: number) => 2 + ((w - 4) * i) / (vals.length - 1);
  const Y = (v: number) => h - 2 - ((h - 5) * v) / mx;
  let path = `M${num(X(0))} ${num(Y(vals[0]))}`;
  for (let i = 1; i < vals.length; i++) path += `L${num(X(i))} ${num(Y(vals[i]))}`;
  const li = vals.length - 1;
  return { path, last: [+num(X(li)), +num(Y(vals[li]))] };
}

export interface Heat {
  dir: "up" | "down";
  alpha: number;
}

/** A month's shade against its row's average: none within 8%, then 0.07 up to 0.37 at 100% away. */
export function heatOf(v: number, avg: number): Heat | null {
  if (!v || !avg) return null;
  const rel = (v - avg) / avg;
  if (Math.abs(rel) < 0.08) return null;
  return { dir: rel > 0 ? "up" : "down", alpha: +(0.07 + 0.3 * Math.min(1, Math.abs(rel))).toFixed(3) };
}

export type YoyCell = { kind: "new" } | { kind: "pct"; pct: number; up: boolean };

/** "New" while last year's figure is under 1,000 shekels (100,000 agorot) or 100 units. */
export function yoyCell(tot: number, prior: number, unit: Unit): YoyCell {
  const min = unit === "rev" ? 100_000 : 100;
  if (!(prior >= min)) return { kind: "new" };
  return { kind: "pct", pct: (100 * (tot - prior)) / prior, up: tot >= prior };
}

export type SortCol = "k" | "tot" | "yoy" | number;
export interface SortState {
  col: SortCol;
  dir: "asc" | "desc";
}
export const DEFAULT_SORT: SortState = { col: "tot", dir: "desc" };

/** A name starts ascending, a number starts descending; pressing the same column again flips it. */
export function nextSort(cur: SortState, col: SortCol): SortState {
  if (cur.col === col) return { col, dir: cur.dir === "asc" ? "desc" : "asc" };
  return { col, dir: col === "k" ? "asc" : "desc" };
}

export interface GridOpts {
  dim: "cust" | "fam";
  period: Period;
  unit: Unit;
  q: string;
  sort: SortState;
  /** rows shown; the totals always cover every matching row. Default 400, as the Artifact. */
  cap?: number;
}

export interface GridRow {
  k: string;
  /** a customer's chain, shown beside its name */
  sub: string;
  /** values aligned to `GridModel.ms` */
  months: number[];
  tot: number;
  /** percent of the (filtered) total */
  share: number | null;
  yoy: YoyCell | null;
  spark: number[];
  heat: Array<Heat | null>;
}

export interface GridSummary {
  /** true while a search narrows the rows: the orders and customers below then describe the whole period, not the rows */
  filtered: boolean;
  total: number;
  orders: number;
  customers: number;
  rows: number;
}

/** The sort that applies to this period: a month the period lacks, or year over year without a prior year, falls back to the default. */
export function effectiveSort(sort: SortState, ms: readonly number[], hasYoy: boolean): SortState {
  if (typeof sort.col === "number" && !ms.includes(sort.col)) return DEFAULT_SORT;
  if (sort.col === "yoy" && !hasYoy) return DEFAULT_SORT;
  return sort;
}

export interface GridModel {
  /** the sort actually applied (see effectiveSort) */
  sort: SortState;
  ms: number[];
  hasYoy: boolean;
  rows: GridRow[];
  matched: number;
  capped: boolean;
  total: { months: number[]; tot: number; yoy: { pct: number; up: boolean } | null };
  summary: GridSummary;
}

const CHILD: Record<"cust" | "fam", GridDim> = { cust: "fam", fam: "sku" };

/** Rows of the search that match: a customer by name or chain, a family by name or by one of its SKUs. */
function matcher(d: ReportData, dim: "cust" | "fam", needle: string, ms: readonly number[]): (r: AggRow) => boolean {
  if (dim === "cust") {
    return (r) => r.k.toLowerCase().includes(needle) || custChain(d, r.c).toLowerCase().includes(needle);
  }
  const mset = new Set(ms);
  const families = new Set<string>();
  for (const r of d.rows) {
    if (!mset.has(r[0])) continue;
    const s = d.sku[r[2]];
    if (s[0].toLowerCase().includes(needle) || (s[1] || "").toLowerCase().includes(needle)) families.add(s[3]);
  }
  return (r) => r.k.toLowerCase().includes(needle) || families.has(r.k);
}

export function buildGrid(d: ReportData, opts: GridOpts): GridModel {
  const { dim, period, unit, cap = 400 } = opts;
  const ms = periodMonths(d.months, period);
  const pmap = priorMap(d.months, ms);
  const sort = effectiveSort(opts.sort, ms, pmap !== null);
  const needle = opts.q.trim().toLowerCase();

  let list = aggregate(d, dim, ms, unit);
  if (dim === "fam") list = list.filter((r) => !SERVICE_FAMILIES.has(r.k) || r.tot);

  const priorMonths = pmap ? ms.map((i) => pmap[i]) : [];
  const priorRows = pmap ? aggregate(d, dim, priorMonths, unit) : [];
  const priorByKey = new Map(priorRows.map((r) => [r.k, r.tot]));

  let priorMatching = priorRows;
  if (needle) {
    list = list.filter(matcher(d, dim, needle, ms));
    // the total's prior year covers what the total covers: the same search, applied to last year
    priorMatching = priorRows.filter(matcher(d, dim, needle, priorMonths));
  }

  const yoyOf = (r: AggRow): YoyCell | null => (pmap ? yoyCell(r.tot, priorByKey.get(r.k) || 0, unit) : null);
  const sortKey = (r: AggRow): number | null => {
    if (sort.col === "k") return null;
    if (sort.col === "tot") return r.tot;
    if (sort.col === "yoy") {
      const y = yoyOf(r);
      return y && y.kind === "pct" ? y.pct : null;
    }
    return r.months[sort.col] || 0;
  };
  const sign = sort.dir === "asc" ? 1 : -1;
  list.sort((a, b) => {
    if (sort.col === "k") return a.k.localeCompare(b.k, "he") * sign;
    const av = sortKey(a);
    const bv = sortKey(b);
    if (av === null && bv === null) return 0;
    if (av === null) return 1; // no figure sorts last, whichever way the column runs
    if (bv === null) return -1;
    return (av < bv ? -1 : av > bv ? 1 : 0) * sign;
  });

  const grand = list.reduce((s, r) => s + r.tot, 0);
  const shown = list.slice(0, cap);
  const rows: GridRow[] = shown.map((r) => {
    const avg = r.tot / Math.max(1, ms.length);
    const vals = ms.map((i) => r.months[i] || 0);
    return {
      k: r.k,
      sub: dim === "cust" ? d.cust[r.c][1] : "",
      months: vals,
      tot: r.tot,
      share: grand ? (100 * r.tot) / grand : null,
      yoy: yoyOf(r),
      spark: vals,
      heat: vals.map((v) => heatOf(v, avg)),
    };
  });

  const pg = priorMatching.reduce((s, r) => s + r.tot, 0);
  const totalMonths = ms.map((i) => list.reduce((s, r) => s + (r.months[i] || 0), 0));

  const mset = new Set(ms);
  let orders = 0;
  for (const o of d.orders) if (mset.has(o[3])) orders++;
  const custs = new Set<number>();
  for (const r of d.rows) if (mset.has(r[0])) custs.add(r[1]);

  return {
    sort,
    ms,
    hasYoy: pmap !== null,
    rows,
    matched: list.length,
    capped: list.length > cap,
    total: {
      months: totalMonths,
      tot: grand,
      yoy: pmap && pg ? { pct: (100 * (grand - pg)) / pg, up: grand >= pg } : null,
    },
    summary: { filtered: needle.length > 0, total: grand, orders, customers: custs.size, rows: list.length },
  };
}

export interface GridChild {
  k: string;
  months: number[];
  tot: number;
  /** percent of the parent row */
  share: number | null;
  spark: number[];
}

/** What is inside one row: a customer's families, a family's SKUs. The 40 biggest. */
export function gridChildren(d: ReportData, opts: Pick<GridOpts, "dim" | "period" | "unit">, parentKey: string): GridChild[] {
  const ms = periodMonths(d.months, opts.period);
  const all = aggregate(d, CHILD[opts.dim], ms, opts.unit, { dim: opts.dim, key: parentKey });
  const parentTot = all.reduce((s, r) => s + r.tot, 0);
  return all
    .sort((a, b) => b.tot - a.tot)
    .slice(0, 40)
    .map((r) => {
      const vals = ms.map((i) => r.months[i] || 0);
      return { k: r.k, months: vals, tot: r.tot, share: parentTot ? (100 * r.tot) / parentTot : null, spark: vals };
    });
}

