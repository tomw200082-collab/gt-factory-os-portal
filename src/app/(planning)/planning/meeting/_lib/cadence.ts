"use client";

// Weekly Cadence cockpit — shared types, date logic, and data hooks.
//
// The cockpit is the single day-aware surface that drives the operator rhythm:
//   • Thursday — FIRM: review the draft week (~2 weeks out) and lock it.
//   • Sunday   — PROCURE: buy against the firmed week (existing purchase-session).
//   • Daily    — EXECUTE: make today's batch, report the actual.
//
// Backend contracts mirrored here (drift is a bug):
//   GET  /api/planning/draft-week?week_start=  → DraftWeekResponse
//   POST /api/planning/firm-week               → FirmWeekResponse

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Types — mirror of gt-factory-os/api/src/planning/schemas.ts
// ---------------------------------------------------------------------------
export type CadenceStep = "firm" | "procure" | "execute";

export interface DraftWeekPackEntry {
  item_id: string;
  item_name: string | null;
  qty: number;
}

export interface DraftWeekRow {
  plan_id: string;
  plan_date: string; // YYYY-MM-DD
  track: "tea_tank" | "matcha_repack";
  base_bom_head_id: string | null;
  base_name: string | null;
  base_family: string | null;
  batch_size_l: number | null;
  packs: DraftWeekPackEntry[];
  item_id: string | null;
  item_name: string | null;
  planned_qty: number;
  uom: string;
  notes: string | null;
}

export interface DraftWeekResponse {
  week_start: string;
  week_end: string;
  as_of: string;
  batch_count: number;
  rows: DraftWeekRow[];
}

export interface FirmWeekResponse {
  week_start: string;
  week_end: string;
  newly_firmed_count: number;
  week_firmed_total: number;
  idempotent_replay: boolean;
}

// ---------------------------------------------------------------------------
// Date helpers (Sunday-first operator week, matching production-plan helpers)
// ---------------------------------------------------------------------------
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setDate(d.getDate() - d.getDay()); // back up to Sunday
  out.setHours(0, 0, 0, 0);
  return out;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(d.getDate() + n);
  return out;
}

/** Parse a YYYY-MM-DD string as a local-midnight Date (no TZ drift). */
export function parseIsoDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function fmtDayHeader(d: Date): { dayName: string; dateLabel: string } {
  return {
    dayName: DAY_NAMES[d.getDay()],
    dateLabel: `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`,
  };
}

export function fmtWeekRange(startIso: string): string {
  const start = parseIsoDate(startIso);
  const end = addDays(start, 6);
  const s = `${MONTH_NAMES[start.getMonth()]} ${start.getDate()}`;
  const sameMonth = start.getMonth() === end.getMonth();
  const e = sameMonth
    ? `${end.getDate()}, ${end.getFullYear()}`
    : `${MONTH_NAMES[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
  return `Week of ${s}–${e}`;
}

// ---------------------------------------------------------------------------
// Cadence logic
// ---------------------------------------------------------------------------
// Which step is "today"? Thursday is the firm meeting, Sunday the procurement
// meeting; every other day the rhythm is execution.
export function stepForToday(today = new Date()): CadenceStep {
  const dow = today.getDay(); // 0=Sun … 4=Thu
  if (dow === 4) return "firm";
  if (dow === 0) return "procure";
  return "execute";
}

// The week we firm on Thursday: the Sunday that opens the week starting ~2
// weeks out. On Thursday that is ~10 days ahead, giving the Sunday procurement
// session a full week of lead before production begins. Anchored to the
// current week's Sunday + 14 so it is stable across the Thu→Sun handoff.
export function defaultFirmWeekStart(today = new Date()): string {
  return toIsoDate(addDays(startOfWeek(today), 14));
}

// The five Sun–Thu working days of a week, as ISO dates.
export function workingDaysOf(weekStartIso: string): string[] {
  const start = parseIsoDate(weekStartIso);
  return [0, 1, 2, 3, 4].map((i) => toIsoDate(addDays(start, i)));
}

// ---------------------------------------------------------------------------
// Data hooks
// ---------------------------------------------------------------------------
export class CadenceFetchError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "CadenceFetchError";
    this.status = status;
  }
}

export function useDraftWeek(weekStart: string, enabled = true) {
  return useQuery<DraftWeekResponse, CadenceFetchError>({
    queryKey: ["cadence", "draft-week", weekStart],
    queryFn: async () => {
      const res = await fetch(
        `/api/planning/draft-week?week_start=${encodeURIComponent(weekStart)}`,
      );
      if (!res.ok) {
        throw new CadenceFetchError(
          res.status,
          res.status === 403
            ? "You don't have permission to view the draft week."
            : `Could not load the draft week (HTTP ${res.status}).`,
        );
      }
      return (await res.json()) as DraftWeekResponse;
    },
    staleTime: 30_000,
    enabled,
    retry: (n, err) =>
      err instanceof CadenceFetchError && (err.status === 403 || err.status === 401)
        ? false
        : n < 2,
  });
}

function genIdempotencyKey(): string {
  try {
    return (
      (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
        ?.randomUUID?.() ?? `firm-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
  } catch {
    return `firm-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

export function useFirmWeek() {
  const qc = useQueryClient();
  return useMutation<FirmWeekResponse, Error, { week_start: string }>({
    mutationFn: async ({ week_start }) => {
      const res = await fetch("/api/planning/firm-week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency_key: genIdempotencyKey(),
          week_start,
        }),
      });
      if (!res.ok) {
        let detail = "";
        try {
          const j = (await res.json()) as { detail?: string; error?: string };
          detail = j.detail ?? j.error ?? "";
        } catch {
          /* ignore */
        }
        throw new Error(
          res.status === 403
            ? "You don't have permission to firm a week (planner/admin only)."
            : res.status === 503
              ? "The system is locked right now (break-glass). Try again later."
              : `Could not firm the week (HTTP ${res.status})${detail ? ` — ${detail}` : ""}.`,
        );
      }
      return (await res.json()) as FirmWeekResponse;
    },
    onSuccess: () => {
      // The firmed rows leave 'draft' → refetch the now-emptier draft week.
      void qc.invalidateQueries({ queryKey: ["cadence", "draft-week"] });
      void qc.invalidateQueries({ queryKey: ["production-plan"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Family colour — maps bom_head.display_family onto the 16 globals.css
// `--family-*` tokens. Unknown families fall back to the accent token.
// ---------------------------------------------------------------------------
const KNOWN_FAMILIES = new Set([
  "calm", "consciousness", "cosmo", "desertea", "detox", "energy", "fresh",
  "matcha", "muza", "namastea", "nonomimi", "odk", "pink-sangria",
  "red-sangria", "revive", "white-sangria",
]);

export function familyTintVar(family: string | null): string {
  if (!family) return "var(--accent)";
  const key = family.trim().toLowerCase().replace(/\s+/g, "-");
  return KNOWN_FAMILIES.has(key) ? `var(--family-${key})` : "var(--accent)";
}
