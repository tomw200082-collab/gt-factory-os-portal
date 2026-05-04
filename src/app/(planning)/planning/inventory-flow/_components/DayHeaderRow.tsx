"use client";

// ---------------------------------------------------------------------------
// DayHeaderRow — sticky header row for the desktop grid.
//
// Operational Clarity redesign 2026-05-04:
//   - Two visual rows: week-of labels (top) and per-day labels (bottom)
//   - Per-day cell: line 1 weekday short uppercase ("MON", "TUE") in 9px
//     muted; line 2 day-of-month integer in 13px medium-weight. For today,
//     line 1 reads "TODAY" in accent tone.
//   - Hatched (non-working) cells render an em-dash instead of weekday/day
//   - Today column: vertical accent-band background + accent-toned numerals
// ---------------------------------------------------------------------------

import { cn } from "@/lib/cn";
import { fmtDayHeader, formatDayHeader2, todayIsoLocal } from "../_lib/format";
import type { FlowDay, FlowWeek } from "../_lib/types";

interface DayHeaderRowProps {
  days: FlowDay[];
  weeks: FlowWeek[];
}

const WEEK_LABEL = (idx: number): string => {
  if (idx === 0) return "This week";
  if (idx === 1) return "Next week";
  return `+${idx}`;
};

export function DayHeaderRow({ days, weeks }: DayHeaderRowProps) {
  const today = todayIsoLocal();
  // Slice weeks to those that fall in the daily-window (first 2 weeks)
  const dailyWeeks = weeks.slice(0, Math.ceil(days.length / 7));

  return (
    <div className="sticky top-0 z-20 bg-bg/95 backdrop-blur">
      {/* Row 1: week labels */}
      <div className="flex border-b border-border/40">
        <div className="sticky left-0 z-10 h-7 w-[320px] shrink-0 border-r border-border/40 bg-bg/95" />
        {dailyWeeks.map((w, idx) => (
          <div
            key={w.week_start}
            className="flex h-7 w-[448px] items-center justify-center border-r border-border/40 text-2xs font-semibold uppercase tracking-sops text-fg-subtle"
          >
            {WEEK_LABEL(idx)}
          </div>
        ))}
        {/* spacer cell */}
        <div className="h-7 w-4 shrink-0" />
        {/* "Weeks 3-8" label spans the remaining 6 weekly cells (96px each) */}
        <div className="flex h-7 w-[576px] items-center justify-center border-l border-border/40 text-2xs font-semibold uppercase tracking-sops text-fg-subtle">
          Weeks 3–8 (weekly)
        </div>
      </div>

      {/* Row 2: per-day labels */}
      <div className="flex border-b border-border/40">
        <div className="sticky left-0 z-10 h-12 w-[320px] shrink-0 border-r border-border/40 bg-bg/95 px-3 py-2 text-3xs uppercase tracking-sops text-fg-subtle">
          Item · cover
        </div>
        {days.map((d) => {
          const isToday = d.day === today;
          const isNonWorking = d.tier === "non_working";
          const { weekday, dom } = formatDayHeader2(d.day, isToday);
          return (
            <div
              key={d.day}
              className={cn(
                "relative flex h-12 w-[64px] flex-col items-center justify-center border-r border-border/40",
                isNonWorking
                  ? "bg-hatch-history text-fg-faint"
                  : "text-fg-subtle",
                isToday && "bg-today-band",
              )}
              title={isNonWorking ? d.holiday_name_he ?? "Non-working day" : undefined}
            >
              {isNonWorking ? (
                <span className="text-fg-faint">—</span>
              ) : (
                <>
                  <div
                    className={cn(
                      "text-[9px] font-semibold uppercase tracking-sops leading-tight",
                      isToday ? "text-accent" : "text-fg-subtle",
                    )}
                  >
                    {weekday}
                  </div>
                  <div
                    className={cn(
                      "mt-0.5 text-[13px] font-medium leading-tight tabular-nums",
                      isToday ? "text-accent" : "text-fg-strong",
                    )}
                  >
                    {dom}
                  </div>
                </>
              )}
            </div>
          );
        })}
        <div className="h-12 w-4 shrink-0" />
        {/* Weekly column headers */}
        {weeks.slice(dailyWeeks.length).map((w) => (
          <div
            key={w.week_start}
            className="flex h-12 w-[96px] flex-col items-center justify-center border-r border-l border-border/40 text-3xs uppercase tracking-sops text-fg-subtle"
          >
            <div>Week of</div>
            <div className="mt-0.5 text-xs font-medium tabular-nums text-fg-strong">
              {fmtDayHeader(w.week_start).bottom}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
