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
      {/* A grid, not a bullet-joined string. Four counts serialised into one
          <p> wrapped to four lines at 390px and took over the header, so the
          preamble outweighed the first card on the screen that is read
          one-handed more than any other (gate P1). Any strip of four or more
          data points is a grid — bullet strings are not reflow-safe. */}
      <dl
        data-testid="stats-strip"
        className="s-nums grid grid-cols-2 gap-x-4 gap-y-0.5 text-[13px] sm:grid-cols-4"
      >
        {(
          [
            [UI.triageQueueToday, stats.queue_today],
            [UI.triageOverdue, stats.overdue_count],
            [UI.triageUnowned, stats.unassigned_open_count],
            [UI.triageNever, stats.never_contacted_count],
          ] as Array<[string, number]>
        ).map(([label, value]) => (
          <div key={label} className="flex items-baseline gap-1.5">
            <dt style={{ color: "hsl(var(--s-fg-faint))" }}>{label}</dt>
            <dd className="m-0 font-semibold" style={{ color: "hsl(var(--s-fg))" }}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
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
