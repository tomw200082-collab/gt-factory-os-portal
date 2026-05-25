// ---------------------------------------------------------------------------
// FactoryStateChip — at-a-glance pill summarising what needs attention
// right now. Derived purely from values the dashboard page already has on
// hand; surfaces no new metrics and issues no new queries. Honest about
// "loading" and "all-clear" — never paints unknown as healthy.
// ---------------------------------------------------------------------------
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

import { cn } from "@/lib/cn";

export interface FactoryStateChipProps {
  /** Number of rows in the Critical Today block. Pass null if still loading. */
  critical: number | null;
  /** Number of urgent procurement rows (overdue/today/urgent). Pass null when
   *  the operator has no purchasing visibility (the block is gated by role). */
  procurementUrgent: number | null;
  /** Number of slipped-plan rows. Pass null if still loading. */
  slipped: number | null;
}

export function FactoryStateChip({
  critical,
  procurementUrgent,
  slipped,
}: FactoryStateChipProps) {
  // While any of the three primary signals is still resolving, render a
  // calm "Reading floor state…" pill — never paint unknown as healthy.
  const stillLoading =
    critical === null || slipped === null;
  if (stillLoading) {
    return (
      <span
        className="dash-chip"
        title="Reading critical-today, slipped-plans and procurement signals."
      >
        <Loader2
          className="h-3 w-3 animate-spin text-fg-subtle motion-reduce:animate-none"
          strokeWidth={2}
          aria-hidden
        />
        Reading floor state
      </span>
    );
  }

  const parts: string[] = [];
  if ((critical ?? 0) > 0) parts.push(`${critical} critical`);
  if ((procurementUrgent ?? 0) > 0) parts.push(`${procurementUrgent} urgent PO`);
  if ((slipped ?? 0) > 0) parts.push(`${slipped} slipped`);

  if (parts.length === 0) {
    return (
      <span
        className="dash-chip"
        data-tone="success"
        title="No critical issues, no urgent procurement, no slipped plans."
      >
        <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        Floor is clear
      </span>
    );
  }

  const hasCritical = (critical ?? 0) > 0;
  const tone: "danger" | "warning" = hasCritical ? "danger" : "warning";
  const Icon = AlertTriangle;

  return (
    <span
      className={cn("dash-chip")}
      data-tone={tone}
      title="Items needing your attention now."
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
      <span className="tabular-nums">{parts.join(" · ")}</span>
    </span>
  );
}
