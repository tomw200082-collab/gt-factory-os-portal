// Pure logic for the production-plan board pack (Tranche 048).
//
//   - buildUomOptions     — UoM <select> option list for ManualAddModal
//                           (INTER-004). Derived from the UoMs actually
//                           present on the visible plan rows plus the
//                           contract UOMS seed list, deduped.
//   - computeTodaySummary — "Today" strip numbers (D13 Tier 1): planned /
//                           reported / unreported for today's lane plus a
//                           compact tomorrow preview.
//   - groupFieldErrors    — splits server 422 validation errors into
//                           per-field buckets + a general remainder so the
//                           ManualAddModal can render inline field errors
//                           (INTER-004) instead of toast-only.
//   - fmtUpdatedTime      — "HH:MM" stamp for the manual-refresh header
//                           (INTER-011).
//
// No React, no fetch — unit-tested in board-summary.test.ts.

import { UOMS } from "@/lib/contracts/enums";
import type { ProductionPlanRow } from "./types";

// ---------------------------------------------------------------------------
// INTER-004 — UoM options.
// The codebase's real UoM universe is the `uom` table seed mirrored in
// src/lib/contracts/enums.ts (KG, L, UNIT, G, MG, TON, ML, PCS, BAG, CASE,
// BOX, BOTTLE, TIN). UoMs already present on the visible plan rows are
// listed first (most likely to be reused), then the contract set, deduped.
// ---------------------------------------------------------------------------
export function buildUomOptions(
  presentUoms: ReadonlyArray<string | null | undefined>,
  knownUoms: readonly string[] = UOMS,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const u of presentUoms) {
    const v = (u ?? "").trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  for (const u of knownUoms) {
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

// ---------------------------------------------------------------------------
// D13 Tier 1 — Today strip + tomorrow preview.
// Only plan_type === "production" rows count; notes never carry quantities.
// Cancelled rows are excluded everywhere.
//   planned    = live + already-reported production plans for today
//   reported   = rendered_state "done"
//   unreported = rendered_state "planned" (still waiting on an actual)
// ---------------------------------------------------------------------------
export interface TodaySummary {
  todayPlanned: number;
  todayReported: number;
  todayUnreported: number;
  /** Today's still-unreported plans, for the "Move to tomorrow" quick action. */
  unreportedTodayPlans: ProductionPlanRow[];
  tomorrowJobs: number;
  tomorrowUnits: number;
  /** Uniform UoM across tomorrow's jobs, or null when mixed / none. */
  tomorrowUom: string | null;
}

export function computeTodaySummary(
  rows: ReadonlyArray<ProductionPlanRow>,
  todayIso: string,
  tomorrowIso: string,
): TodaySummary {
  const production = rows.filter(
    (r) => r.plan_type === "production" && r.rendered_state !== "cancelled",
  );
  const today = production.filter((r) => r.plan_date === todayIso);
  const reported = today.filter((r) => r.rendered_state === "done");
  const unreported = today.filter((r) => r.rendered_state === "planned");

  const tomorrow = production.filter(
    (r) => r.plan_date === tomorrowIso && r.rendered_state === "planned",
  );
  const tomorrowUnits = tomorrow.reduce((sum, r) => {
    const n = parseFloat(r.planned_qty ?? "0");
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
  const tomorrowUoms = tomorrow.map((r) => r.uom).filter((u): u is string => !!u);
  const tomorrowUom =
    tomorrowUoms.length > 0 && tomorrowUoms.every((u) => u === tomorrowUoms[0])
      ? tomorrowUoms[0]
      : null;

  return {
    todayPlanned: today.length,
    todayReported: reported.length,
    todayUnreported: unreported.length,
    unreportedTodayPlans: unreported,
    tomorrowJobs: tomorrow.length,
    tomorrowUnits,
    tomorrowUom,
  };
}

// ---------------------------------------------------------------------------
// INTER-004 — server 422 field-error grouping.
// The create endpoint returns validation_errors: [{ path: [...], message }].
// Bucket them by first path segment when it matches a known form field;
// everything else lands in `general` so no error is silently dropped.
// ---------------------------------------------------------------------------
export interface FieldErrorInput {
  path?: unknown[];
  message?: string;
}

export interface GroupedFieldErrors {
  byField: Record<string, string[]>;
  general: string[];
}

export function groupFieldErrors(
  errors: ReadonlyArray<FieldErrorInput>,
  knownFields: readonly string[],
): GroupedFieldErrors {
  const byField: Record<string, string[]> = {};
  const general: string[] = [];
  for (const err of errors) {
    const message = (err.message ?? "").trim();
    if (!message) continue;
    const head = err.path?.[0];
    const field = typeof head === "string" ? head : null;
    if (field && knownFields.includes(field)) {
      (byField[field] ??= []).push(message);
    } else {
      general.push(field ? `${field}: ${message}` : message);
    }
  }
  return { byField, general };
}

// ---------------------------------------------------------------------------
// INTER-011 — "Updated HH:MM" stamp next to the manual Refresh button.
// 24h clock, zero-padded; empty string for a missing/invalid timestamp so
// the header renders nothing instead of "NaN:NaN".
// ---------------------------------------------------------------------------
export function fmtUpdatedTime(epochMs: number): string {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return "";
  const d = new Date(epochMs);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
