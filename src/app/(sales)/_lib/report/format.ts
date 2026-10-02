// Number formats for the report. Pure.
//
// The Artifact printed a bare "₪" for zero (its `f0` returns '' for 0). A real zero is
// information, and a blank beside a currency sign reads as a rendering fault, so zero
// prints as zero here.

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

/** +12% / -9% / 0%: whole percent, the sign from the true value, never "-0". */
export function signedPct(p: number): string {
  const t = p.toFixed(0);
  return `${p >= 0 ? "+" : ""}${t === "-0" ? "0" : t}%`;
}

export type ChipTone = "up" | "dn";

export function pctChip(p: number | null): { text: string; tone: ChipTone } | null {
  if (p === null) return null;
  return { text: signedPct(p), tone: p >= 0 ? "up" : "dn" };
}

/** A table cell: the number alone, blank for zero (the header and the summary line carry the unit). */
export const cell = (v: number, unit: Unit): string => (v ? intFmt.format(Math.round(unit === "rev" ? v / AG : v)) : "");

/** 2026-09-24 to 24/09/26. Empty stays empty. */
export function shortDate(iso: string): string {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : "";
}
