// "Copy as CSV": the report's tables as rows of text, in what the screen shows. Pure.
//
// The Artifact copied whatever table was on screen by reading its DOM. Here the rows come from
// the same models the screen draws, so the copy cannot drift from the numbers. Money is whole
// shekels, plain digits, so a spreadsheet reads it as a number.

import { REPORT_UI as L } from "../labels";
import type { GridModel } from "./aggregate";
import type { ChainsModel } from "./chains";
import { dayLabel, DOW_NAMES, dowOf, type RetroRow } from "./daily";
import { signedPct } from "./format";
import { monthLabel, MONTH_SHORT } from "./period";
import type { YearRow } from "./trend";
import { AG, type ReportData, type Unit } from "./types";

/** Every cell quoted, quotes doubled, whitespace flattened, and a byte-order mark so Excel reads Hebrew. */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return (
    "﻿" +
    rows.map((r) => r.map((c) => `"${c.replace(/\s+/g, " ").trim().replace(/"/g, '""')}"`).join(",")).join("\n")
  );
}

const plain = (v: number, unit: Unit): string => String(unit === "rev" ? Math.round(v / AG) : Math.round(v));

export function gridCsvRows(d: ReportData, g: GridModel, tab: "cust" | "prod", unit: Unit): string[][] {
  const head: string[] = [tab === "cust" ? L.colCust : L.colProd];
  for (const i of g.ms) head.push(monthLabel(d.months, i) + (i === d.partialIdx ? " *" : ""));
  head.push(L.colTotal, L.colShare);
  if (g.hasYoy) head.push(L.colYoy);
  const yoyText = (c: GridModel["rows"][number]["yoy"]) => (c ? (c.kind === "new" ? L.yoyNew : signedPct(c.pct)) : "");
  const rows = g.rows.map((r) => {
    const out = [r.k, ...r.months.map((v) => plain(v, unit)), plain(r.tot, unit), r.share === null ? "" : `${r.share.toFixed(1)}%`];
    if (g.hasYoy) out.push(yoyText(r.yoy));
    return out;
  });
  const total = [L.totalRow, ...g.total.months.map((v) => plain(v, unit)), plain(g.total.tot, unit), "100%"];
  if (g.hasYoy) total.push(g.total.yoy ? signedPct(g.total.yoy.pct) : "");
  return [head, ...rows, total];
}

export function chainsCsvRows(d: ReportData, c: ChainsModel, ms: readonly number[], unit: Unit): string[][] {
  const head = [L.chainsColName, L.chainsColMeta, ...ms.map((i) => monthLabel(d.months, i) + (i === d.partialIdx ? " *" : "")), L.colTotal];
  const cells = (months: Record<number, number>) => ms.map((i) => plain(months[i] || 0, unit));
  const rows: string[][] = [];
  for (const ch of c.shown) {
    rows.push([ch.name, ch.seg, ...cells(ch.months), plain(ch.tot, unit)]);
    for (const b of ch.branches) rows.push([`— ${b.name}`, b.last, ...cells(b.months), plain(b.tot, unit)]);
  }
  rows.push([L.chainsTotalRow, "", ...cells(c.totals.months), plain(c.totals.tot, unit)]);
  return [head, ...rows];
}

export function matrixCsvRows(matrix: readonly YearRow[], unit: Unit): string[][] {
  const head = [L.matrixYear, ...MONTH_SHORT.map((m) => `${m}׳`), L.matrixTotal, L.matrixGrowth];
  const rows = matrix.map((r) => [
    r.year,
    ...r.cells.map((cell) => (cell.v === null ? "" : plain(cell.v, unit))),
    plain(r.total, unit),
    r.growth === null ? "—" : signedPct(r.growth),
  ]);
  return [head, ...rows];
}

export function retroCsvRows(rows: readonly RetroRow[], d: ReportData): string[][] {
  const head = [L.retroDate, L.retroDay, L.retroRev, L.retroOrders, L.retroAvg, L.retroVs, L.retroTop];
  const body = rows.map((r) => [
    dayLabel(d, r.e),
    DOW_NAMES[dowOf(d, r.e)],
    plain(r.rev, "rev"),
    String(r.cnt),
    r.avg === null ? "—" : plain(r.avg, "rev"),
    r.partial ? L.retroPartial : r.p === null ? "—" : signedPct(r.p),
    r.top ? `${r.top[0]} · ${plain(r.top[1], "rev")}` : "—",
  ]);
  return [head, ...body];
}
