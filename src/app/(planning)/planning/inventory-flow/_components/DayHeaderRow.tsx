"use client";

// ---------------------------------------------------------------------------
// DayHeaderRow — sticky header row for the desktop grid.
//
// Two visual rows:
//   Row 1: week-of labels ("This week", "Next week", "+2", ...) spanning the
//          7 day-columns each (text-2xs muted)
//   Row 2: per-day labels — top weekday letter + bottom day-of-month
//
// Friday / Saturday / blocking-holiday columns get muted background.
// Today column gets a soft accent background + tiny "Today" tag.
// ---------------------------------------------------------------------------

import { cn } from "@/lib/cn";
import { fmtDayHeader, todayIsoLocal } from "../_lib/format";
import { NON_WORKING_STRIPE_STYLE } from "../_lib/risk";
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
          const { top, bottom } = fmtDayHeader(d.day);
          const isToday = d.day === today;
          const isNonWorking = d.tier === "non_working";
          return (
            <div
              key={d.day}
              style={isNonWorking ? NON_WORKING_STRIPE_STYLE : undefined}
              className={cn(
                "relative flex h-12 w-[64px] flex-col items-center justify-center border-r border-border/40 text-fg-subtle",
                isNonWorking && "text-fg-faint",
                isToday && "bg-accent-soft/40",
              )}
              title={isNonWorking ? d.holiday_name_he ?? undefined : undefined}
            >
              <div className="text-3xs uppercase tracking-sops">{top}</div>
              <div
                className={cn(
                  "mt-0.5 text-sm font-medium tabular-nums",
                  isToday ? "text-accent" : "text-fg-strong",
                )}
              >
                {bottom}
              </div>
              {isToday ? (
                <div className="absolute -top-0.5 right-1 text-[8px] font-semibold uppercase tracking-sops text-accent">
                  Today
                </div>
              ) : null}
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
