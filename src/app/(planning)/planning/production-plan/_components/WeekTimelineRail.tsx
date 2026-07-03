"use client";

// WeekTimelineRail — the week's production rhythm: a real load-per-day time
// series, not a decorative device. Spec: PDP-UX-01 § 3 Layer 2 + § 4a
// "Timeline readability".
//
// Tranche 117 (visual amplify, Tom-directed via /frontend-design,
// 2026-07-02): every day now shows a baseline track — zero-load days read as
// "no bar yet" instead of empty space, so the row reads as one chart rather
// than floating rectangles. Today gets a soft accent band running the full
// height of its column (bar + line + labels) so it reads as the week's
// anchor at a glance. Date numbers move to font-mono, matching the numeric
// language established across this page in this tranche. Same DayRailInfo
// props, same data — no logic change.

import { cn } from "@/lib/cn";

export interface DayRailInfo {
  iso: string;
  dayName: string;
  dateLabel: string;
  total: number;
  allDone: boolean;
  hasPlanned: boolean;
  isOverdue: boolean;
  isToday: boolean;
  isPast: boolean;
}

const BAR_HEIGHT = 56;

function barColor(day: DayRailInfo): string {
  if (day.allDone) return "bg-success/55";
  if (day.isToday) return "bg-accent/70";
  if (day.isOverdue) return "bg-warning/45";
  if (day.isPast) return "bg-border/50";
  return "bg-accent/28";
}

function dayNameColor(day: DayRailInfo): string {
  if (day.isToday) return "text-accent";
  if (day.isOverdue) return "text-warning-fg";
  return "text-fg-muted";
}

function NotchDot({ day }: { day: DayRailInfo }) {
  if (day.isToday) {
    return (
      <div
        className="h-[14px] w-[14px] rounded-full bg-accent ring-2 ring-accent/35 ring-offset-1 ring-offset-bg"
        aria-label="Today"
      />
    );
  }
  // A11Y-004 — the notch state was conveyed by colour alone. Meaningful states
  // carry a text alternative (role="img" + aria-label) so a screen reader and a
  // colour-blind reader both get the status; the neutral default stays
  // decorative (no special state to announce).
  if (day.allDone) {
    return (
      <div
        className="h-[10px] w-[10px] rounded-full bg-success/60"
        role="img"
        aria-label="All completed"
      />
    );
  }
  if (day.isOverdue) {
    return (
      <div
        className="h-[10px] w-[10px] rounded-full bg-warning/70"
        role="img"
        aria-label="Overdue"
      />
    );
  }
  return <div className="h-[10px] w-[10px] rounded-full bg-border" aria-hidden />;
}

export function WeekTimelineRail({
  days,
  weekMax,
}: {
  days: DayRailInfo[];
  weekMax: number;
}) {
  return (
    <div
      className="mb-5 rounded-lg py-2"
      aria-label="Week production timeline"
      role="region"
      data-testid="week-timeline-rail"
    >
      <div className="flex gap-1">
        {days.map((day) => {
          const fillPct = weekMax > 0 ? Math.min((day.total / weekMax) * 100, 100) : 0;
          const barHeightPct = fillPct > 0 ? Math.max(fillPct * 0.92, 10) : 0;
          return (
            <div
              key={day.iso}
              className={cn(
                "flex-1 flex flex-col items-center gap-1 rounded-md pt-2 pb-1.5 -mt-2",
                day.isToday && "bg-accent-softer",
                day.isPast && !day.isToday && "opacity-55",
              )}
            >
              {/* Bar over its own baseline track — a zero-load day still
                  shows the track, so the row reads as one chart. */}
              <div
                className="w-4/5 flex items-end rounded-t-sm bg-border/40"
                style={{ height: BAR_HEIGHT }}
                aria-hidden
              >
                {barHeightPct > 0 && (
                  <div
                    className={cn("w-full rounded-t-sm transition-all duration-500", barColor(day))}
                    style={{ height: `${barHeightPct}%` }}
                  />
                )}
              </div>

              <div className="relative mt-0.5">
                <NotchDot day={day} />
              </div>

              <span
                className={cn(
                  "text-[10px] font-bold uppercase tracking-sops leading-none",
                  dayNameColor(day),
                )}
              >
                {day.dayName}
              </span>

              <span
                className={cn(
                  "font-mono text-[10px] tabular-nums leading-none",
                  day.isToday ? "text-fg-strong font-semibold" : "text-fg-muted font-medium",
                )}
              >
                {day.dateLabel}
              </span>

              {day.isOverdue && (
                <div className="w-3/5 h-[2px] rounded-full bg-warning/60" aria-hidden />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
