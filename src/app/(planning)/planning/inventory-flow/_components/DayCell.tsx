"use client";

// ---------------------------------------------------------------------------
// DayCell — single 64×52 cell for one item × one day in the desktop grid.
//
// Visual: tier-colored background + projected_on_hand_eod number (tabular).
// Corner glyphs:
//   ↓ bottom-right when incoming PO arrives this day
//   ▾ top-right when this day's demand is a "spike" relative to window avg
// Non-working days render an em-dash on a striped neutral background.
//
// Wrapped in DayPopover so click reveals demand/supply detail.
// ---------------------------------------------------------------------------

import { ArrowDown, Triangle } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtQty } from "../_lib/format";
import {
  dayCellClassName,
  hasIncomingPo,
  isDemandSpike,
  NON_WORKING_STRIPE_STYLE,
} from "../_lib/risk";
import type { FlowDay, FlowItem } from "../_lib/types";
import { DayPopover } from "./DayPopover";

interface DayCellProps {
  item: FlowItem;
  day: FlowDay;
  avgDailyDemand: number;
  isToday: boolean;
}

export function DayCell({ item, day, avgDailyDemand, isToday }: DayCellProps) {
  const isNonWorking = day.tier === "non_working";
  const totalDemand = day.demand_lionwheel + day.demand_forecast;
  const spike = !isNonWorking && isDemandSpike(totalDemand, avgDailyDemand);
  const incoming = !isNonWorking && hasIncomingPo(day);

  const cellInner = (
    <div
      role="button"
      tabIndex={0}
      style={isNonWorking ? NON_WORKING_STRIPE_STYLE : undefined}
      className={cn(
        "relative flex h-[52px] w-[64px] cursor-pointer items-center justify-center text-xs tabular-nums transition-colors",
        dayCellClassName(day.tier),
        isToday && "ring-1 ring-inset ring-accent/40",
        !isNonWorking && "hover:brightness-95",
      )}
      title={isNonWorking ? day.holiday_name_he ?? "Non-working day" : undefined}
    >
      {isNonWorking ? (
        <span className="text-fg-faint">—</span>
      ) : (
        <span className="leading-none">{fmtQty(day.projected_on_hand_eod)}</span>
      )}

      {/* Top-right: demand spike */}
      {spike ? (
        <Triangle
          className="absolute right-1 top-1 h-2 w-2 fill-warning text-warning"
          strokeWidth={1}
        />
      ) : null}

      {/* Bottom-right: incoming PO */}
      {incoming ? (
        <ArrowDown
          className="absolute bottom-1 right-1 h-2.5 w-2.5 text-info"
          strokeWidth={2.5}
        />
      ) : null}
    </div>
  );

  if (isNonWorking) {
    // Don't open the popover on non-working days; nothing useful to surface.
    return cellInner;
  }

  return (
    <DayPopover item={item} day={day}>
      {cellInner}
    </DayPopover>
  );
}
