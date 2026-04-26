"use client";

// ---------------------------------------------------------------------------
// WeekCell — 96×52 weekly cell for weeks 3..N in the desktop grid.
//
// Shows min on-hand for that week + tier color + small "Stockout day N" label
// when applicable.
// ---------------------------------------------------------------------------

import { cn } from "@/lib/cn";
import { fmtQty } from "../_lib/format";
import { dayCellClassName } from "../_lib/risk";
import type { FlowWeek } from "../_lib/types";

interface WeekCellProps {
  week: FlowWeek;
}

export function WeekCell({ week }: WeekCellProps) {
  const stockoutDay = week.stockout_day;
  let stockoutDayNum: number | null = null;
  if (stockoutDay) {
    try {
      stockoutDayNum = new Date(`${stockoutDay}T00:00:00`).getDate();
    } catch {
      stockoutDayNum = null;
    }
  }

  return (
    <div
      className={cn(
        "flex h-[52px] w-[96px] flex-col items-center justify-center gap-0.5 text-xs tabular-nums transition-colors hover:brightness-95",
        dayCellClassName(week.tier),
      )}
      title={`Week of ${week.week_start} — min on-hand ${fmtQty(week.min_on_hand)}`}
    >
      <span
        className={cn(
          "leading-none",
          week.tier === "stockout" && "font-semibold",
        )}
      >
        {fmtQty(week.min_on_hand)}
      </span>
      {stockoutDayNum != null ? (
        <span className="text-3xs text-danger-fg/80">
          Stockout day {stockoutDayNum}
        </span>
      ) : null}
    </div>
  );
}
