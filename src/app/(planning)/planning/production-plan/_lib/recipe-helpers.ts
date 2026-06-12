// Pure helpers for the RecipeOverridePanel (Tranche 052 — improvised liquid
// recipe). No fetch, no React — unit-tested in recipe-helpers.test.ts.
//
// Model: the panel edits a "working set" of liquid lines (per-output-unit
// quantities). The server's GET response provides both the effective set and
// the standard reference; the diff vs standard is computed client-side for
// display only — the server re-validates everything on PUT.

import type {
  PlanRecipeLiquidLine,
  PlanRecipeOverrideLine,
  PlanRecipeRemovedLine,
  PlanRecipeResponse,
} from "./recipe-types";

// ---------------------------------------------------------------------------
// Working line — what each editable table row holds.
// ---------------------------------------------------------------------------
export interface WorkingRecipeLine {
  component_id: string;
  component_name: string | null;
  /** Editable qty-per-output-unit as the raw input string. */
  qty: string;
  uom: string;
  /** Current on-hand; null = unknown (component newly added this session). */
  available_qty: string | null;
  /** Standard-tree qty per unit; null = not part of the standard recipe. */
  standard_qty_per_unit: string | null;
  in_standard: boolean;
}

// ---------------------------------------------------------------------------
// Quantity text helpers — qty_8dp arrives as "0.50000000"; inputs and chips
// want "0.5" without losing precision.
// ---------------------------------------------------------------------------
export function trimQtyText(s: string | null | undefined): string {
  if (s === null || s === undefined) return "";
  const t = s.trim();
  if (t === "") return "";
  if (!/^-?\d+(\.\d+)?$/.test(t)) return t; // not plain decimal — leave as-is
  if (!t.includes(".")) return t;
  return t.replace(/0+$/, "").replace(/\.$/, "");
}

export function parseQtyInput(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Format a computed number for display: ≤4 decimals, trailing zeros trimmed. */
export function fmtComputedQty(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  if (Number.isInteger(n)) return n.toFixed(0);
  return n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

// ---------------------------------------------------------------------------
// Totals — total run consumption = qty-per-unit × planned qty.
// ---------------------------------------------------------------------------
export function computeLineTotal(
  qtyPerUnit: string,
  plannedQty: string,
): number | null {
  const q = parseQtyInput(qtyPerUnit);
  const p = parseQtyInput(plannedQty);
  if (q === null || p === null || q < 0 || p < 0) return null;
  // Round away float dust — display-grade math; the server owns truth.
  return Math.round(q * p * 1e8) / 1e8;
}

// ---------------------------------------------------------------------------
// Availability tier — green enough / amber tight / red short vs the run total.
// "tight" = covers the run but with under 10% headroom left.
// ---------------------------------------------------------------------------
export type AvailabilityTier = "ok" | "tight" | "short" | "unknown";

export function availabilityTier(
  availableQty: string | null,
  total: number | null,
): AvailabilityTier {
  if (availableQty === null || total === null) return "unknown";
  const avail = parseQtyInput(availableQty);
  if (avail === null) return "unknown";
  if (total <= 0) return "ok";
  if (avail < total) return "short";
  if (avail < total * 1.1) return "tight";
  return "ok";
}

// ---------------------------------------------------------------------------
// Diff vs standard — per-line status for chips.
// ---------------------------------------------------------------------------
export type LineDiffStatus = "unchanged" | "changed" | "added";

export function lineDiffStatus(line: WorkingRecipeLine): LineDiffStatus {
  if (!line.in_standard || line.standard_qty_per_unit === null) return "added";
  const cur = parseQtyInput(line.qty);
  const std = parseQtyInput(line.standard_qty_per_unit);
  if (cur === null || std === null) return cur === std ? "unchanged" : "changed";
  return Math.abs(cur - std) < 1e-9 ? "unchanged" : "changed";
}

// ---------------------------------------------------------------------------
// Working-set construction from the GET response.
// ---------------------------------------------------------------------------
export function toWorkingLines(resp: PlanRecipeResponse): WorkingRecipeLine[] {
  return resp.liquid_lines.map((l: PlanRecipeLiquidLine) => ({
    component_id: l.component_id,
    component_name: l.component_name,
    qty: trimQtyText(l.qty_per_unit),
    uom: l.uom,
    available_qty: l.available_qty,
    standard_qty_per_unit: l.standard_qty_per_unit,
    in_standard: l.in_standard,
  }));
}

/**
 * The standard liquid set as working lines — used by "Reset to standard" and
 * by the identical-to-standard check. Combines in-standard effective lines
 * (at their STANDARD qty) with removed standard lines (availability unknown
 * for those — the GET response only carries balances for effective lines).
 */
export function standardWorkingLines(
  resp: PlanRecipeResponse,
): WorkingRecipeLine[] {
  const fromEffective = resp.liquid_lines
    .filter((l) => l.in_standard && l.standard_qty_per_unit !== null)
    .map((l) => ({
      component_id: l.component_id,
      component_name: l.component_name,
      qty: trimQtyText(l.standard_qty_per_unit),
      uom: l.uom,
      available_qty: l.available_qty,
      standard_qty_per_unit: l.standard_qty_per_unit,
      in_standard: true,
    }));
  const fromRemoved = resp.removed_standard_lines.map(
    (l: PlanRecipeRemovedLine) => ({
      component_id: l.component_id,
      component_name: l.component_name,
      qty: trimQtyText(l.standard_qty_per_unit),
      uom: l.uom ?? "",
      available_qty: null,
      standard_qty_per_unit: l.standard_qty_per_unit,
      in_standard: true,
    }),
  );
  return [...fromEffective, ...fromRemoved];
}

/**
 * True when the working set is numerically identical to the standard recipe
 * (same components, same per-unit quantities, same uoms). Saving an
 * identical set sends lines:[] so the plan reverts to the standard BOM
 * instead of storing a no-op override row.
 */
export function isSameAsStandard(
  working: WorkingRecipeLine[],
  standard: WorkingRecipeLine[],
): boolean {
  if (working.length !== standard.length) return false;
  const stdById = new Map(standard.map((l) => [l.component_id, l]));
  for (const w of working) {
    const s = stdById.get(w.component_id);
    if (!s) return false;
    if (w.uom !== s.uom) return false;
    const wq = parseQtyInput(w.qty);
    const sq = parseQtyInput(s.qty);
    if (wq === null || sq === null) return false;
    if (Math.abs(wq - sq) >= 1e-9) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// PUT body construction + validation.
// ---------------------------------------------------------------------------
export interface WorkingSetValidation {
  ok: boolean;
  /** First human-readable problem; null when ok. */
  problem: string | null;
}

export function validateWorkingSet(
  working: WorkingRecipeLine[],
): WorkingSetValidation {
  if (working.length === 0) {
    return {
      ok: false,
      problem:
        "The recipe has no lines. Use “Reset to standard” to go back to the standard recipe.",
    };
  }
  const seen = new Set<string>();
  for (const w of working) {
    const name = w.component_name ?? w.component_id;
    if (seen.has(w.component_id)) {
      return { ok: false, problem: `${name} appears more than once.` };
    }
    seen.add(w.component_id);
    const q = parseQtyInput(w.qty);
    if (q === null || q <= 0) {
      return {
        ok: false,
        problem: `Enter a quantity greater than 0 for ${name}.`,
      };
    }
    if (!w.uom.trim()) {
      return { ok: false, problem: `Choose a unit for ${name}.` };
    }
  }
  return { ok: true, problem: null };
}

export function buildPutLines(
  working: WorkingRecipeLine[],
): PlanRecipeOverrideLine[] {
  return working.map((w) => ({
    component_id: w.component_id,
    qty_per_output_unit: parseQtyInput(w.qty) ?? 0,
    uom: w.uom.trim(),
  }));
}
