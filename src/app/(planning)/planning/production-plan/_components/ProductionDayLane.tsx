"use client";

// ProductionDayLane — redesigned day lane for the weekly production board.
// Spec: PDP-UX-01 § 3 Layer 3 + § 4a "Card elegance" + § 9.
//
// Surface treatment:
//   Today    → bg-raised + ring-1 ring-accent/30   (focal point)
//   Past     → bg-subtle / opacity-90              (receded)
//   Overdue  → bg + border-l-2 border-l-danger/60  (NOT flooded red)
//   Future   → bg                                  (neutral)

import { Plus, StickyNote } from "lucide-react";
import { cn } from "@/lib/cn";
import { ProductionJobCard } from "./ProductionJobCard";
import { ProductionNoteCard } from "./ProductionNoteCard";
import type { ProductionPlanRow } from "../_lib/types";

function formatDayTotal(total: number, uom: string): string {
  if (total === 0) return "";
  const n = Number.isInteger(total) ? total.toFixed(0) : total.toFixed(1);
  return `${n} ${uom}`;
}

function laneSurface(isToday: boolean, isOverdue: boolean, isPast: boolean): string {
  if (isToday) return "bg-bg-raised ring-1 ring-accent/30 border-accent/25 shadow-sm";
  if (isOverdue) return "bg-bg border-l-[3px] border-l-danger/60 border-border/40";
  if (isPast) return "bg-bg-subtle border-border/30 opacity-90";
  return "bg-bg border-border/40";
}

function laneHeaderBorder(isToday: boolean, isOverdue: boolean): string {
  if (isToday) return "border-accent/20";
  if (isOverdue) return "border-danger/20";
  return "border-border/30";
}

function dayNameColor(isToday: boolean, isOverdue: boolean, isPast: boolean): string {
  if (isToday) return "text-accent";
  if (isOverdue) return "text-warning-fg";
  if (isPast) return "text-fg-subtle";
  return "text-fg-muted";
}

export function ProductionDayLane({
  date,
  isoDate,
  dayName,
  dateLabel,
  plans,
  canAct,
  isToday,
  isPast,
  isOverdue,
  dayTotal,
  dominantUom,
  onAdd,
  onAddNote,
  onEdit,
  onCancel,
  onDelete,
  onAdjustRecipe,
}: {
  date: Date;
  isoDate: string;
  dayName: string;
  dateLabel: string;
  plans: ProductionPlanRow[];
  canAct: boolean;
  isToday: boolean;
  isPast: boolean;
  isOverdue: boolean;
  dayTotal: number;
  dominantUom: string;
  onAdd: (date: Date) => void;
  onAddNote: (date: Date) => void;
  onEdit: (p: ProductionPlanRow) => void;
  onCancel: (p: ProductionPlanRow) => void;
  onDelete: (p: ProductionPlanRow) => void;
  onAdjustRecipe: (p: ProductionPlanRow) => void;
}) {
  const liveCount = plans.filter((p) => p.rendered_state === "planned").length;
  const doneCount = plans.filter((p) => p.rendered_state === "done").length;

  return (
    <div
      dir="ltr"
      className={cn(
        "relative flex flex-col rounded-lg border transition-shadow duration-150",
        "min-h-[180px]",
        laneSurface(isToday, isOverdue, isPast),
      )}
      data-testid="production-day-lane"
      data-date={isoDate}
    >
      {/* Lane header */}
      <div
        className={cn(
          "flex items-start justify-between gap-2 px-3 pt-3 pb-2 border-b",
          laneHeaderBorder(isToday, isOverdue),
        )}
      >
        <div className="flex flex-col gap-0.5">
          <span
            className={cn(
              "text-[10px] font-bold uppercase tracking-wider leading-none",
              dayNameColor(isToday, isOverdue, isPast),
            )}
          >
            {dayName}
          </span>
          <span
            className={cn(
              "text-sm tabular-nums leading-none",
              isToday ? "text-fg-strong font-semibold" : "text-fg font-medium",
            )}
          >
            {dateLabel}
          </span>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          {isToday && (
            <span className="text-[9px] font-bold uppercase tracking-wider text-accent leading-none">
              Today
            </span>
          )}
          {isOverdue && liveCount > 0 && (
            <span className="text-[9px] font-bold uppercase tracking-wider text-danger leading-none">
              {liveCount} overdue
            </span>
          )}
          {doneCount > 0 && liveCount === 0 && (
            <span className="text-[9px] font-semibold text-success-fg leading-none">
              Completed
            </span>
          )}
          {dayTotal > 0 && (
            <span className="text-[10px] tabular-nums text-fg-faint leading-none">
              {formatDayTotal(dayTotal, dominantUom)}
            </span>
          )}
        </div>
      </div>

      {/* Card stack or empty state */}
      <div className="flex flex-col gap-2 p-2 flex-1">
        {plans.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 flex-1 py-6 text-center">
            {canAct ? (
              <>
                <button
                  type="button"
                  className="flex flex-col items-center gap-2 group/add transition-opacity duration-150"
                  onClick={() => onAdd(date)}
                  data-testid="day-lane-add-empty"
                  aria-label={`Add production for ${dayName} ${dateLabel}`}
                >
                  <div
                    className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center",
                      "bg-bg-muted border border-border/30",
                      "group-hover/add:bg-accent/10 group-hover/add:border-accent/30",
                      "transition-colors duration-150",
                    )}
                  >
                    <Plus
                      className="h-3.5 w-3.5 text-fg-faint group-hover/add:text-accent transition-colors duration-150"
                      strokeWidth={2}
                    />
                  </div>
                  <span className="text-[10px] text-fg-faint group-hover/add:text-fg-subtle transition-colors duration-150">
                    No production planned
                  </span>
                </button>
                <button
                  type="button"
                  className="text-[10px] text-fg-faint hover:text-fg-subtle transition-colors duration-150 underline decoration-dotted underline-offset-2"
                  onClick={() => onAddNote(date)}
                  data-testid="day-lane-add-note-empty"
                  aria-label={`Add note for ${dayName} ${dateLabel}`}
                >
                  or add a note
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="h-8 w-8 rounded-full flex items-center justify-center bg-bg-muted border border-border/30">
                  <Plus className="h-3.5 w-3.5 text-fg-faint" strokeWidth={2} />
                </div>
                <span className="text-[10px] text-fg-faint">
                  No production planned
                </span>
              </div>
            )}
          </div>
        ) : (
          plans.map((p) =>
            p.plan_type === "note" ? (
              <ProductionNoteCard
                key={p.plan_id}
                plan={p}
                canAct={canAct}
                onEdit={onEdit}
                onCancel={onCancel}
                onDelete={onDelete}
              />
            ) : (
              <ProductionJobCard
                key={p.plan_id}
                plan={p}
                canAct={canAct}
                isToday={isToday}
                onEdit={onEdit}
                onCancel={onCancel}
                onDelete={onDelete}
                onAdjustRecipe={onAdjustRecipe}
              />
            )
          )
        )}
      </div>

      {/* Footer Add — only when lane already has cards */}
      {canAct && plans.length > 0 && (
        <div className="px-2 pb-2 flex gap-1">
          <button
            type="button"
            className="btn btn-ghost btn-xs flex-1 gap-1 text-fg-faint hover:text-fg"
            onClick={() => onAdd(date)}
            data-testid="day-lane-add"
          >
            <Plus className="h-3 w-3" strokeWidth={2.5} />
            Production
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-xs flex-1 gap-1 text-fg-faint hover:text-fg"
            onClick={() => onAddNote(date)}
            data-testid="day-lane-add-note"
          >
            <StickyNote className="h-3 w-3" strokeWidth={2} />
            Note
          </button>
        </div>
      )}
    </div>
  );
}
