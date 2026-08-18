"use client";

// One line, no charts. The masterprompt is explicit that a reports screen is
// not being built: this strip is the whole of it, and it exists to give the
// week a shape, not to be studied.

import { UI } from "../_lib/labels";
import type { WeekStats } from "../_lib/types";

export function StatsStrip({ stats }: { stats: WeekStats | undefined }) {
  if (!stats) return null;
  return (
    <p
      data-testid="stats-strip"
      className="s-nums text-[13px]"
      style={{ color: "hsl(var(--s-fg-muted))" }}
    >
      {UI.statsLine(stats.week_new_leads, stats.working_now, stats.week_converted)}
    </p>
  );
}
