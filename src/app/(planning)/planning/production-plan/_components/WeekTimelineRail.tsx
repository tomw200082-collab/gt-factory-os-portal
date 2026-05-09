"use client";

// WeekTimelineRail — horizontal Sun-Sat timeline rail with load bars, day
// notches, today marker, overdue underlines, and past/future treatment.
// Spec: PDP-UX-01 § 3 Layer 2 + § 4a "Timeline readability".

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

function loadBarColor(day: DayRailInfo): string {
  if (day.allDone) return "bg-success/45";
  if (day.isToday) return "bg-accent/55";
  if (day.isOverdue) return "bg-warning/40";
  if (day.isPast) return "bg-border/40";
  return "bg-accent/22";
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
  if (day.allDone) {
    return <div className="h-[10px] w-[10px] rounded-full bg-success/60" />;
  }
  if (day.isOverdue) {
    return <div className="h-[10px] w-[10px] rounded-full bg-warning/70" />;
  }
  return <div className="h-[10px] w-[10px] rounded-full bg-border" />;
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
      className="mb-5"
      aria-label="Week production timeline"
      role="region"
      data-testid="week-timeline-rail"
    >
      {/* Load bars */}
      <div className="flex gap-1 mb-2 items-end" style={{ height: 40 }} aria-hidden>
        {days.map((day) => {
          const fillPct = weekMax > 0 ? Math.min((day.total / weekMax) * 100, 100) : 0;
          return (
            <div key={day.iso} className="flex-1 flex items-end justify-center">
              <div className="w-4/5 flex items-end" style={{ height: 40 }}>
                {fillPct > 0 ? (
                  <div
                    className={cn(
                      "w-full rounded-t-sm transition-all duration-500",
                      loadBarColor(day),
                    )}
                    style={{ height: `${Math.max(fillPct * 0.9, 8)}%` }}
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Rail line + notches */}
      <div className="relative">
        <div
          className="absolute left-0 right-0 bg-border/40"
          style={{ top: 7, height: 1 }}
          aria-hidden
        />

        <div className="flex gap-1">
          {days.map((day) => (
            <div
              key={day.iso}
              className={cn(
                "flex-1 flex flex-col items-center gap-1",
                day.isPast && !day.isToday ? "opacity-50" : "",
              )}
            >
              <div className="relative z-10">
                <NotchDot day={day} />
              </div>

              <span
                className={cn(
                  "text-[10px] font-bold uppercase tracking-wider leading-none",
                  dayNameColor(day),
                )}
              >
                {day.dayName}
              </span>

              <span
                className={cn(
                  "text-[10px] tabular-nums leading-none",
                  day.isToday
                    ? "text-fg-strong font-semibold"
                    : "text-fg-faint font-medium",
                )}
              >
                {day.dateLabel}
              </span>

              {day.isOverdue && (
                <div
                  className="w-3/5 h-[2px] rounded-full bg-danger/60"
                  aria-hidden
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
