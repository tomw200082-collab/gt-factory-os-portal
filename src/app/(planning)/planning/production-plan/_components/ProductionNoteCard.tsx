"use client";

import { StickyNote, Pencil, Ban } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ProductionPlanRow } from "../_lib/types";

export function ProductionNoteCard({
  plan,
  canAct,
  onEdit,
  onCancel,
}: {
  plan: ProductionPlanRow;
  canAct: boolean;
  onEdit: (p: ProductionPlanRow) => void;
  onCancel: (p: ProductionPlanRow) => void;
}) {
  const isCancelled = plan.rendered_state === "cancelled";

  return (
    <div
      className={cn(
        "rounded-lg border border-border/40 bg-bg-raised",
        "border-l-[3px] border-l-fg-subtle/40",
        "transition-all duration-150",
        "hover:shadow-sm hover:border-border/60",
        isCancelled && "opacity-60 border-l-border/20",
      )}
      data-testid="production-note-card"
      data-plan-id={plan.plan_id}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-2">
        {/* Left: icon + label */}
        <div className="flex items-center gap-1.5">
          <StickyNote className="h-3 w-3 text-fg-muted shrink-0" strokeWidth={2} />
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
            Note
          </span>
        </div>

        {/* Right: actions */}
        {!isCancelled && canAct && plan.status === "planned" ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => onEdit(plan)}
              aria-label="Edit note"
              data-testid="note-card-edit"
            >
              <Pencil className="h-2.5 w-2.5" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs text-danger"
              onClick={() => onCancel(plan)}
              aria-label="Cancel note"
              data-testid="note-card-cancel"
            >
              <Ban className="h-2.5 w-2.5" strokeWidth={2.5} />
            </button>
          </div>
        ) : isCancelled ? (
          <Ban className="h-3 w-3 text-fg-faint shrink-0" strokeWidth={2} />
        ) : null}
      </div>

      {/* Divider */}
      <div className="border-t border-border/20" />

      {/* Content */}
      <div className="px-3 pb-3 pt-2">
        <p
          className={cn(
            "text-sm leading-snug line-clamp-5",
            isCancelled ? "text-fg-muted line-through" : "text-fg",
          )}
        >
          {plan.notes ?? <span className="italic text-fg-faint">No note text</span>}
        </p>

        {isCancelled && plan.cancel_reason && (
          <p className="text-[10px] text-fg-faint mt-1.5">
            Cancelled: {plan.cancel_reason}
          </p>
        )}
      </div>
    </div>
  );
}
