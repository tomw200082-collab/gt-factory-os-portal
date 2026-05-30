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
  firmed_count: number;
  rows: DraftWeekRow[];
}

export interface FirmWeekResponse {
  week_start: string;
  week_end: string;
  newly_firmed_count: number;
  week_firmed_total: number;
  idempotent_replay: boolean;
}

export interface GenerateDraftsResponse {
  tea_proposal_id: string | null;
  matcha_proposal_id: string | null;
  draft_total_upcoming: number;
  generated_at: string;
  idempotent_replay: boolean;
}

export interface FirmedWeekDemandRow {
  item_id: string;
  item_name: string | null;
  track: "tea_tank" | "matcha_repack";
  fg_units: number;
}

export interface FirmedWeekDemandResponse {
  week_start: string;
  week_end: string;
  as_of: string;
  total_fg_units: number;
  distinct_fg_count: number;
  rows: FirmedWeekDemandRow[];
}

// Client-side FG rollup of the *draft* week — the pre-firm "if you firm this
// week, here's what we commit to produce" preview. Mirrors the backend
// firmed-week-demand view but over the drafts already in hand (no extra call):
// tea rows contribute their resolved packs; matcha rows contribute planned_qty.
export interface FgRollupEntry {
  item_id: string;
  item_name: string | null;
  units: number;
  track: "tea_tank" | "matcha_repack";
}

export function rollupDraftFgUnits(rows: DraftWeekRow[]): FgRollupEntry[] {
  const byItem = new Map<string, FgRollupEntry>();
  const add = (
    itemId: string | null,
    itemName: string | null,
    units: number,
    track: "tea_tank" | "matcha_repack",
  ) => {
    if (!itemId || !(units > 0)) return;
    const cur = byItem.get(itemId);
    if (cur) {
      cur.units += units;
      if (cur.item_name === null && itemName !== null) cur.item_name = itemName;
    } else {
      byItem.set(itemId, { item_id: itemId, item_name: itemName, units, track });
    }
  };
  for (const r of rows) {
    if (r.track === "tea_tank") {
      for (const p of r.packs) add(p.item_id, p.item_name, p.qty, "tea_tank");
    } else {
      add(r.item_id, r.item_name, r.planned_qty, "matcha_repack");
    }
  }
  return Array.from(byItem.values()).sort((a, b) => b.units - a.units);
}

// ---------------------------------------------------------------------------
// Date helpers (Sunday-first operator week, matching production-plan helpers)
// ---------------------------------------------------------------------------
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

// "Now" anchored to the factory's wall clock (Asia/Jerusalem), so the
// Thursday/Sunday cadence step is correct regardless of the operator's browser
// timezone. Returns a Date whose *local* fields (getDay/getDate/…) reflect IL
// wall-clock time — sufficient for day-of-week + week-boundary math.
export function nowInIsrael(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  // hour can come back as "24" at midnight in some engines — normalize.
  const hour = get("hour") % 24;
  return new Date(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
}

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
export function stepForToday(today = nowInIsrael()): CadenceStep {
  const dow = today.getDay(); // 0=Sun … 4=Thu
  if (dow === 4) return "firm";
  if (dow === 0) return "procure";
  return "execute";
}

// The week we firm on Thursday: the Sunday that opens the week starting ~2
// weeks out. On Thursday that is ~10 days ahead, giving the Sunday procurement
// session a full week of lead before production begins. Anchored to the
// current week's Sunday + 14 so it is stable across the Thu→Sun handoff.
// Sunday of the week `weeks` weeks ahead of `today`, ISO date. The cadence is
// a rolling two-week-ahead commit: weeks=2 is the Thursday firm target (the new
// week entering the plan), weeks=1 is the "near" week — fine-tuned on Thursday
// and bought on the Sunday that starts it.
export function weekStartInWeeks(weeks: number, today = nowInIsrael()): string {
  return toIsoDate(addDays(startOfWeek(today), weeks * 7));
}

export function defaultFirmWeekStart(today = nowInIsrael()): string {
  return weekStartInWeeks(2, today);
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

export function useFirmedWeekDemand(weekStart: string, enabled = true) {
  return useQuery<FirmedWeekDemandResponse, CadenceFetchError>({
    queryKey: ["cadence", "firmed-week-demand", weekStart],
    queryFn: async () => {
      const res = await fetch(
        `/api/planning/firmed-week-demand?week_start=${encodeURIComponent(weekStart)}`,
      );
      if (!res.ok) {
        throw new CadenceFetchError(
          res.status,
          `Could not load firmed-week demand (HTTP ${res.status}).`,
        );
      }
      return (await res.json()) as FirmedWeekDemandResponse;
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

export function useGenerateDrafts() {
  const qc = useQueryClient();
  return useMutation<GenerateDraftsResponse, Error, void>({
    mutationFn: async () => {
      const res = await fetch("/api/planning/generate-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotency_key: genIdempotencyKey() }),
      });
      if (!res.ok) {
        throw new Error(
          res.status === 403
            ? "You don't have permission to generate drafts (planner/admin only)."
            : res.status === 503
              ? "The system is locked right now (break-glass). Try again later."
              : `Could not generate drafts (HTTP ${res.status}).`,
        );
      }
      return (await res.json()) as GenerateDraftsResponse;
    },
    onSuccess: () => {
      // Fresh drafts → refetch the week board.
      void qc.invalidateQueries({ queryKey: ["cadence", "draft-week"] });
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
