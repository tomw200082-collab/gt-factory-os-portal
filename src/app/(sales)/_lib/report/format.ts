// Number formats for the report. Pure.
//
// The Artifact printed a bare "₪" for zero (its `f0` returns '' for 0). A real zero is
// information, and a blank beside a currency sign reads as a rendering fault, so zero
// prints as zero here.

import { REPORT_UI as L } from "../labels";
import { AG, type Unit } from "./types";

const intFmt = new Intl.NumberFormat("he-IL");

export const fmtInt = (v: number): string => intFmt.format(Math.round(v));

/** Agorot as whole shekels: ₪123,456. */
export const money = (agorot: number): string => `₪${intFmt.format(Math.round(agorot / AG))}`;

/** A value in the chosen unit: shekels from agorot, or a plain count of units. */
export const amount = (v: number, unit: Unit): string => (unit === "rev" ? money(v) : fmtInt(v));

/** Short axis label: ₪1.5M, ₪123K, ₪450. */
export function compact(v: number, unit: Unit): string {
  const sym = unit === "rev" ? "₪" : "";
  const x = unit === "rev" ? v / AG : v;
  const a = Math.abs(x);
  if (a >= 1e6) return `${sym}${(x / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sym}${Math.round(x / 1e3)}K`;
  return `${sym}${Math.round(x)}`;
}

/** +12% / -9% / 0%: whole percent. Sign and tone come from the ROUNDED figure, so "0%" is neither up nor down. */
/** Halves round away from zero, so -0.5 and +0.5 are each one percent. */
const round = (p: number): number => Math.sign(p) * Math.round(Math.abs(p));

export function signedPct(p: number): string {
  const r = round(p);
  return r === 0 ? "0%" : `${r > 0 ? "+" : "-"}${Math.abs(r)}%`;
}

export type ChipTone = "up" | "dn";

/** up, down, or "mt" (quiet) when the rounded figure is zero. */
export function pctTone(p: number): ChipTone | "mt" {
  const r = round(p);
  return r === 0 ? "mt" : r > 0 ? "up" : "dn";
}

export function pctChip(p: number | null): { text: string; tone: ChipTone | "mt" } | null {
  if (p === null) return null;
  return { text: signedPct(p), tone: pctTone(p) };
}

/** Shekels with their sign, units with their word: a figure always says what it counts. */
export const amountUnit = (v: number, unit: Unit): string => (unit === "rev" ? money(v) : `${fmtInt(v)} ${L.unitShort}`);

/** "2026-02" as "פבר׳ 26", the way the month headers write it. */
export function monthYear(ym: string): string {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  return `${L.monthsShort[+m - 1]}׳ ${y.slice(2)}`;
}

/** A table cell: the number alone, blank for zero (the header and the summary line carry the unit). */
export const cell = (v: number, unit: Unit): string => (v ? intFmt.format(Math.round(unit === "rev" ? v / AG : v)) : "");

/** 2026-09-24 to 24/09/26. Empty stays empty. */
export function shortDate(iso: string): string {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : "";
}

/** A phone's table cell: the figure in at most five characters (8.3K, 414K, 2.97M), blank for zero. The full figure travels with it. */
export function cellCompact(v: number, unit: Unit): string {
  if (!v) return "";
  const x = Math.abs(unit === "rev" ? v / AG : v);
  const sign = v < 0 ? "-" : "";
  const one = (n: number) => String(Math.round(n * 10) / 10);
  if (x >= 1e6) return `${sign}${String(Math.round((x / 1e6) * 100) / 100)}M`;
  if (x >= 1e4) return `${sign}${Math.round(x / 1e3)}K`;
  if (x >= 1e3) return `${sign}${one(x / 1e3)}K`;
  return `${sign}${Math.round(x)}`;
}
