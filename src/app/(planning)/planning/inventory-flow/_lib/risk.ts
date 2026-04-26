// ---------------------------------------------------------------------------
// risk.ts — pure helpers for risk-tier classification mapping + sorting.
//
// Source of truth: contract pack §3 (Hybrid D model).
// Color discipline: tailwind tokens only. NEVER raw emerald/amber/orange/rose.
// Inverted hierarchy: only stockout grabs attention; healthy fades almost to
// background ("פשוט ויפייפה ומהמם" — Tom 2026-04-26).
// ---------------------------------------------------------------------------

import type { DayCellTier, FlowItem, RiskTier } from "./types";

// ----- Item-level tier classes (badge tone for StatusBadge, plus row strip) -----

export interface RiskTierStyle {
  /** Badge tone passed to <Badge tone=...> from StatusBadge.tsx */
  badgeTone: "neutral" | "success" | "warning" | "danger";
  /** Sticky-panel left strip class (4px tier strip per design dispatch) */
  stripClass: string;
  /** Short human label ("Stockout", "Critical", "Watch", "Healthy") */
  label: string;
}

export const RISK_TIER_STYLE: Record<RiskTier, RiskTierStyle> = {
  stockout: {
    badgeTone: "danger",
    stripClass: "bg-danger",
    label: "Stockout",
  },
  critical: {
    badgeTone: "warning",
    stripClass: "bg-warning",
    label: "Critical",
  },
  watch: {
    badgeTone: "warning",
    stripClass: "bg-warning/60",
    label: "Watch",
  },
  healthy: {
    badgeTone: "success",
    stripClass: "bg-success/40",
    label: "Healthy",
  },
};

// ----- Per-day cell background classes (canonical map) -----
//
// Inverted hierarchy:
//   healthy     -> almost-transparent green tint (recedes)
//   watch       -> subtle warning tint
//   critical    -> warning, slightly louder
//   stockout    -> danger, the LOUDEST element
//   non_working -> neutral muted with diagonal stripe (set inline style)

const DAY_CELL_BG: Record<DayCellTier, string> = {
  healthy: "bg-success-softer/40 text-success-fg",
  watch: "bg-warning-softer text-warning-fg",
  critical: "bg-warning-soft text-warning-fg font-medium",
  stockout: "bg-danger-soft text-danger-fg font-semibold",
  non_working: "bg-bg-muted text-fg-subtle",
};

export function dayCellClassName(tier: DayCellTier): string {
  return DAY_CELL_BG[tier];
}

/** Inline stripe pattern for non-working day cells. */
export const NON_WORKING_STRIPE_STYLE: React.CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(135deg, transparent 0 6px, hsl(30 8% 82% / 0.5) 6px 7px)",
};

// ----- Item-level sort: stockout > critical > watch > healthy, then by date -----

const TIER_RANK: Record<RiskTier, number> = {
  stockout: 0,
  critical: 1,
  watch: 2,
  healthy: 3,
};

export function compareItemsByRisk(a: FlowItem, b: FlowItem): number {
  const ta = TIER_RANK[a.risk_tier];
  const tb = TIER_RANK[b.risk_tier];
  if (ta !== tb) return ta - tb;

  // earliest stockout date ascending — NULL last
  const da = a.earliest_stockout_date;
  const db = b.earliest_stockout_date;
  if (da && db) {
    if (da < db) return -1;
    if (da > db) return 1;
  } else if (da && !db) {
    return -1;
  } else if (!da && db) {
    return 1;
  }

  // days_of_cover ascending
  if (a.days_of_cover !== b.days_of_cover) {
    return a.days_of_cover - b.days_of_cover;
  }

  // tiebreak: name (stable)
  return a.item_name.localeCompare(b.item_name);
}

// ----- Predicates -----

export function isAtRisk(t: RiskTier): boolean {
  return t !== "healthy";
}

export function hasIncomingPo(day: { incoming_supply: number }): boolean {
  return day.incoming_supply > 0;
}

/**
 * Demand "spike" heuristic for a day cell — used to render the top-right
 * triangle indicator. v1 rule: a day's total demand is ≥ 2× the average daily
 * demand across the visible 14-day window.
 *
 * Pure / deterministic; does not call backend.
 */
export function isDemandSpike(
  totalDemand: number,
  avgDemand: number,
): boolean {
  if (avgDemand <= 0) return false;
  return totalDemand >= 2 * avgDemand;
}
