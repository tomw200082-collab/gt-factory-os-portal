// ---------------------------------------------------------------------------
// CountdownChip — a scannable, colour-coded "order-by" countdown (Tranche 066).
//
// Surfaces the decision engine's already-computed daysUntilOrderBy as a single
// chip so a one-owner factory can triage a list of suppliers at a glance:
//   overdue / today → danger,  ≤3 days → warning,  else → neutral.
// Hebrew labels (scoped-Hebrew procurement surface, per tranche 065).
// Renders nothing when the date is unparseable (days == null).
// ---------------------------------------------------------------------------

import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { orderByCountdown, type CountdownLevel } from "../_lib/decision";

const LEVEL_TONE: Record<CountdownLevel, BadgeTone> = {
  overdue: "danger",
  today: "danger",
  soon: "warning",
  later: "neutral",
};

export function CountdownChip({ days }: { days: number | null }): JSX.Element | null {
  if (days == null) return null;
  const { level, label } = orderByCountdown(days);
  return (
    <Badge tone={LEVEL_TONE[level]} size="xs">
      {label}
    </Badge>
  );
}
