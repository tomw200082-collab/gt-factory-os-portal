"use client";

// ---------------------------------------------------------------------------
// DayHeaderRow — sticky header for the desktop grid.
//
// Operational Clarity v2 (2026-05-05) — STRUCTURAL ALIGNMENT FIX
// =============================================================
// This row consumes the SAME `grid-template-columns` template as every
// body row (passed in via `gridStyle`). Header tracks therefore align
// pixel-for-pixel with body tracks; there is zero drift between the
// "MON 4" label and the cell beneath it.
//
// Visual rules:
//   - Two header rows: week labels (top, 28px) + per-day labels (bottom,
//     48px). Both rows feed cells into the SAME grid template.
//   - Per-day cell: weekday short uppercase 9px muted; day-of-month 13px
//     medium-weight. Today: small accent TODAY pill above the day number.
//   - Hatched (non-working) cells render an em-dash.
//   - Today column: vertical accent-band background + accent-toned numerals
//     (visual cross-hair so the eye locks on today while scrolling).
//   - Sticky:
//       row container : position: sticky; top: 0; z-index: 30
//       item-col cell : position: sticky; left: 0; z-index: 40 (top-left
//                       corner — pinned on BOTH axes)
// ---------------------------------------------------------------------------

import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { fmtDayHeader, formatDayHeader2, todayIsoLocal } from "../_lib/format";
import type { FlowDay, FlowWeek } from "../_lib/types";

interface DayHeaderRowProps {
  days: FlowDay[];
  weeks: FlowWeek[];
  gridStyle: CSSProperties;
}

const WEEK_LABEL = (idx: number): string => {
  if (idx === 0) return "This week";
  if (idx === 1) return "Next week";
  return `+${idx}`;
};

export function DayHeaderRow({ days, weeks, gridStyle }: DayHeaderRowProps) {
  const today = todayIsoLocal();
  // Slice weeks to those that fall in the daily-window (first 2 weeks)
  const dailyWeeks = weeks.slice(0, Math.ceil(days.length / 7));
  const weeklyOnly = weeks.slice(dailyWeeks.length);

  // Detect index of today in the daily band so the week-row label can
  // visually anchor "This week" if today is in week 0, etc. (Cosmetic; the
  // dailyWeeks loop drives the actual cells.)

  return (
    <div className="sticky top-0 z-30 bg-bg-raised">
      {/* Row 1 — week labels. Each week-of-7 spans 7 daily tracks via
          `grid-column: span 7`. The sticky item-col cell occupies track 1. */}
      <div
        role="row"
        className="grid h-7 border-b border-border/40 bg-bg-raised"
        style={gridStyle}
      >
        <div
          role="columnheader"
          className="sticky left-0 z-40 h-7 bg-bg-raised"
          style={{
            // Mirror the per-day header's right boundary so the sticky col
            // edge reads as one continuous line through both header rows.
            borderLeft: `3px solid hsl(var(--border))`,
            boxShadow:
              "inset -1px 0 0 hsl(var(--border-strong)), 2px 0 6px -2px hsl(var(--shadow-color-deep) / 0.4)",
          }}
          aria-hidden
        />
        {dailyWeeks.map((w, idx) => (
          <div
            key={w.week_start}
            role="columnheader"
            className="flex h-7 items-center justify-center border-r border-border/40 text-2xs font-semibold uppercase tracking-sops text-fg-subtle"
            style={{ gridColumn: "span 7 / span 7" }}
          >
            {WEEK_LABEL(idx)}
          </div>
        ))}
        {/* spacer cell occupies the gap track */}
        <div className="h-7" aria-hidden />
        {/* Weekly-band header label — spans the remaining N weekly tracks */}
        <div
          role="columnheader"
          className="flex h-7 items-center justify-center border-l border-border/40 text-2xs font-semibold uppercase tracking-sops text-fg-subtle"
          style={{ gridColumn: `span ${Math.max(1, weeklyOnly.length)} / span ${Math.max(1, weeklyOnly.length)}` }}
        >
          Weeks 3–8 (weekly)
        </div>
      </div>

      {/* Row 2 — per-day labels. One cell per daily track + one cell per
          weekly track. Pixel-aligned with the body via shared gridStyle. */}
      <div
        role="row"
        className="grid h-12 border-b border-border/40 bg-bg-raised"
        style={gridStyle}
      >
        {/* Sticky item-col header — subdivided to mirror StickyItemPanel's
            3 slots: ITEM | TREND | COVER. Each sub-label sits exactly over
            its corresponding body slot for a "labeled stat tile" feel.
            Layered right boundary mirrors StickyItemPanel: inset 1px
            hairline + 6px soft drop shadow falling into the data grid. */}
        <div
          role="columnheader"
          className="sticky left-0 z-40 flex h-12 items-stretch overflow-hidden bg-bg-raised text-3xs uppercase tracking-sops text-fg-subtle"
          style={{
            // 3px left rule (matches StickyItemPanel family stripe weight,
            // generic neutral tone since the header has no family).
            borderLeft: `3px solid hsl(var(--border))`,
            boxShadow:
              "inset -1px 0 0 hsl(var(--border-strong)), 2px 0 6px -2px hsl(var(--shadow-color-deep) / 0.4)",
          }}
        >
          <div className="flex flex-1 items-center pl-3 pr-2 truncate">Item</div>
          <div className="flex w-20 shrink-0 items-center justify-center">Trend</div>
          <div className="flex w-24 shrink-0 items-center justify-center border-l border-border/60 bg-bg-subtle/40">
            Cover
          </div>
        </div>
        {days.map((d) => {
          const isToday = d.day === today;
          const isNonWorking = d.tier === "non_working";
          const { weekday, dom } = formatDayHeader2(d.day, false);
          return (
            <div
              key={d.day}
              role="columnheader"
              data-day={d.day}
              data-today={isToday ? "true" : undefined}
              className={cn(
                "relative flex h-12 flex-col items-center justify-center border-r border-border/40",
                isNonWorking
                  ? "bg-hatch-history text-fg-faint"
                  : "text-fg-subtle",
                isToday && !isNonWorking && "bg-today-band",
                // Today column accent edge — drawn as inset shadows so it
                // never affects layout. Mirrored on every body cell of the
                // same column for a clean vertical band.
                isToday && !isNonWorking && "shadow-[inset_1px_0_0_hsl(var(--accent)/0.55),inset_-1px_0_0_hsl(var(--accent)/0.55)]",
              )}
              title={isNonWorking ? d.holiday_name_he ?? "Non-working day" : undefined}
            >
              {isNonWorking ? (
                <span className="text-fg-faint">—</span>
              ) : (
                <>
                  <div
                    className={cn(
                      "text-[9px] font-semibold uppercase tracking-sops leading-none",
                      isToday ? "text-accent" : "text-fg-subtle",
                    )}
                  >
                    {isToday ? (
                      <span
                        className="rounded-sm bg-accent px-1 py-px text-[8px] font-bold uppercase tracking-sops text-accent-fg"
                        data-testid="day-header-today-pill"
                      >
                        TODAY
                      </span>
                    ) : (
                      weekday
                    )}
                  </div>
                  <div
                    className={cn(
                      "mt-1 text-[13px] font-medium leading-none tabular-nums",
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
        {/* gap spacer (matches body) */}
        <div className="h-12" aria-hidden />
        {/* Weekly column headers — one per weekly track */}
        {weeklyOnly.map((w) => (
          <div
            key={w.week_start}
            role="columnheader"
            className="flex h-12 flex-col items-center justify-center border-r border-l border-border/40 text-3xs uppercase tracking-sops text-fg-subtle"
          >
            <div className="leading-none">Week of</div>
            <div className="mt-1 text-xs font-medium leading-none tabular-nums text-fg-strong">
              {fmtDayHeader(w.week_start).bottom}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
