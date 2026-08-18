"use client";

// One line, no charts. The masterprompt is explicit that a reports screen is
// not being built: this strip is the whole of it, and it exists to give the
// week a shape, not to be studied.

import { UI } from "../_lib/labels";
import type { WeekStats } from "../_lib/types";

export function StatsStrip({ stats }: { stats: WeekStats | undefined }) {
  // Reserve the line's height while it loads. Returning null moved everything
  // below it the moment the numbers arrived, on the screen most likely to be
  // read one-handed mid-scroll.
  if (!stats) return <p data-testid="stats-strip-loading" className="min-h-[20px]" />;

  // Two lines, and the order is the point. The triage line describes the
  // morning that exists; the weekly line describes the week and reads
  // "0 · 0 · 0" for as long as a batch-imported backlog is being cleared
  // (audit P0-5), so it goes second and quieter.
  return (
    <div className="flex flex-col gap-0.5">
      <p
        data-testid="stats-strip"
        className="s-nums text-[13px]"
        style={{ color: "hsl(var(--s-fg))" }}
      >
        {UI.triageLine(
          stats.queue_today,
          stats.overdue_count,
          stats.unassigned_open_count,
          stats.never_contacted_count,
        )}
      </p>
      <p
        data-testid="stats-strip-week"
        className="s-nums text-[12px]"
        style={{ color: "hsl(var(--s-fg-muted))" }}
      >
        {UI.statsLine(stats.week_new_leads, stats.working_now, stats.week_converted)}
      </p>
    </div>
  );
}
