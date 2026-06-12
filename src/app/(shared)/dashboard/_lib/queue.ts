// ---------------------------------------------------------------------------
// Today's Work queue (Tranche 060, design-doc §4 Band 2).
//
// ONE ranked action list replaces the three separate live blocks (Critical
// Today / Urgent Procurement / Slipped Plans) plus late-PO rows. Pure module:
// the page builds QueueRowSpec[] from its existing queries; this file owns
// the ranking contract and small MRP-grammar helpers.
//
// Ranking (design-doc): severity (critical → warning) → category weight
// (stops-production → procurement → slipped → late PO) → age (oldest first).
// Cap 8 rows; the rest is "N more in inbox".
// ---------------------------------------------------------------------------

export type QueueSeverity = "critical" | "warning";

export type QueueCategory =
  | "stops_production"
  | "procurement"
  | "slipped"
  | "late_po";

export interface QueueRowSpec {
  id: string;
  severity: QueueSeverity;
  category: QueueCategory;
  /** Verb + object: "Order lime juice from Tempo". */
  title: string;
  /** MRP why-now line: "On hand 40 L · 2.1d cover". Null when unknown. */
  whyNow: string | null;
  /** ISO timestamp used for age ranking (oldest first). Null ranks last. */
  at: string | null;
  /** Pre-formatted age label ("2h ago", "3d overdue") — page formats. */
  ageLabel: string | null;
  href: string;
  /** Verb on the row's single button: "Order now" / "Post actual" / … */
  cta: string;
}

const SEVERITY_WEIGHT: Record<QueueSeverity, number> = {
  critical: 0,
  warning: 1,
};

const CATEGORY_WEIGHT: Record<QueueCategory, number> = {
  stops_production: 0,
  procurement: 1,
  slipped: 2,
  late_po: 3,
};

export const QUEUE_CAP = 8;

export function rankQueue(
  rows: QueueRowSpec[],
  cap: number = QUEUE_CAP,
): { rows: QueueRowSpec[]; overflow: number } {
  const sorted = [...rows].sort((a, b) => {
    const sev = SEVERITY_WEIGHT[a.severity] - SEVERITY_WEIGHT[b.severity];
    if (sev !== 0) return sev;
    const cat = CATEGORY_WEIGHT[a.category] - CATEGORY_WEIGHT[b.category];
    if (cat !== 0) return cat;
    // Oldest first; unknown timestamps rank last within their group.
    const ta = a.at ? Date.parse(a.at) : Number.POSITIVE_INFINITY;
    const tb = b.at ? Date.parse(b.at) : Number.POSITIVE_INFINITY;
    return ta - tb;
  });
  return {
    rows: sorted.slice(0, cap),
    overflow: Math.max(0, sorted.length - cap),
  };
}

// ---------------------------------------------------------------------------
// MRP grammar helpers — every quantity carries its UOM; urgency is time.
// ---------------------------------------------------------------------------

/** "On hand 40 L · 2.1d cover" — for stockout rows resolvable in flow data. */
export function mrpOnHandLine(args: {
  onHand: number | null;
  uom?: string | null;
  daysOfCover?: number | null;
}): string | null {
  const parts: string[] = [];
  if (args.onHand !== null && Number.isFinite(args.onHand)) {
    parts.push(
      `On hand ${args.onHand.toLocaleString()}${args.uom ? ` ${args.uom}` : ""}`,
    );
  }
  if (args.daysOfCover != null && Number.isFinite(args.daysOfCover)) {
    parts.push(`${Math.max(0, Math.round(args.daysOfCover * 10) / 10)}d cover`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
