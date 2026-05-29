"use client";

// ---------------------------------------------------------------------------
// CalendarView — secondary "calendar" view of the procurement page (Tranche
// 033). A forward-looking, Sunday-first month grid of the open session's orders
// placed on their order-by date. Derived entirely from session.pos via the
// pure calendar-grid helpers — no second fetch. A day chip opens focus mode at
// that order.
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import { formatIls } from "@/lib/utils/format-money";
import { cn } from "@/lib/cn";
import type { PurchaseSessionPo } from "../../purchase-session/_lib/types";
import type { PoTierLike } from "../_lib/decision";
import {
  buildGrid,
  calTotals,
  groupByDay,
  posToCalEntries,
} from "../_lib/calendar-grid";
import { todayISO } from "../_lib/decision";

const DOW_HE = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
const MONTH_HE = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];
const TIER_LABEL: Record<PoTierLike, string> = {
  urgent: "דחוף",
  must: "חובה השבוע",
  recommended: "מומלץ להקדים",
};
function tierDot(t: PoTierLike): string {
  if (t === "urgent") return "bg-danger";
  if (t === "must") return "bg-warning";
  return "bg-info";
}
function tierChip(t: PoTierLike): string {
  if (t === "urgent") return "border-danger/30 bg-danger-softer text-danger-fg";
  if (t === "must") return "border-warning/30 bg-warning-softer text-warning-fg";
  return "border-info/30 bg-info-softer text-info-fg";
}

export interface CalendarViewProps {
  pos: PurchaseSessionPo[];
  onOpen?: (sessionPoId: string) => void;
  today?: string;
}

export function CalendarView({
  pos,
  onOpen,
  today,
}: CalendarViewProps): JSX.Element {
  const day = today ?? todayISO();
  const entries = useMemo(() => posToCalEntries(pos), [pos]);
  const grid = useMemo(() => buildGrid(day, 10), [day]);
  const byDay = useMemo(() => groupByDay(entries), [entries]);
  const totals = useMemo(() => calTotals(entries), [entries]);

  return (
    <div className="space-y-4" data-testid="procurement-calendar">
      {/* Summary strip */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(TIER_LABEL) as PoTierLike[]).map((t) => (
            <span
              key={t}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-3xs font-semibold",
                tierChip(t),
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", tierDot(t))} />
              {`${TIER_LABEL[t]} · ${totals.byTier[t]}`}
            </span>
          ))}
        </div>
        <div className="text-sm text-fg">
          {`${totals.count} הזמנות`}
          <span className="mx-2 text-fg-subtle">·</span>
          <span className="font-mono font-semibold tabular-nums">
            {formatIls(totals.cost)}
          </span>
        </div>
      </div>

      {/* Grid */}
      <div className="card overflow-hidden p-0">
        <div className="grid grid-cols-7 border-b border-border/60 bg-bg-subtle/50">
          {DOW_HE.map((d) => (
            <div
              key={d}
              className="px-2 py-1.5 text-center text-3xs font-semibold uppercase tracking-sops text-fg-subtle"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {grid.map((g, idx) => {
            const dayEntries = byDay.get(g.iso) ?? [];
            return (
              <div
                key={g.iso}
                className={cn(
                  "min-h-[5.5rem] border-b border-l border-border/40 p-1.5",
                  idx % 7 === 6 ? "border-l-0" : "",
                  g.isPast ? "bg-bg-subtle/30" : "bg-bg",
                  g.isToday ? "ring-1 ring-inset ring-accent/60" : "",
                )}
              >
                <div className="mb-1 flex items-baseline justify-between">
                  <span
                    className={cn(
                      "text-3xs font-semibold tabular-nums",
                      g.isToday ? "text-accent" : "text-fg-subtle",
                    )}
                  >
                    {g.dayOfMonth}
                  </span>
                  {g.showMonth && (
                    <span className="text-3xs text-fg-subtle">
                      {MONTH_HE[g.monthIdx]}
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {dayEntries.map((e) => (
                    <button
                      key={e.session_po_id}
                      type="button"
                      onClick={() => onOpen?.(e.session_po_id)}
                      className={cn(
                        "block w-full rounded border px-1.5 py-0.5 text-right text-3xs transition-colors hover:brightness-105",
                        tierChip(e.tier),
                        e.status === "placed" || e.status === "skipped"
                          ? "opacity-50"
                          : "",
                      )}
                      title={`${e.supplier_snapshot} · ${e.line_count} פריטים · ${formatIls(e.total_cost)}`}
                      data-testid={`calendar-entry-${e.session_po_id}`}
                    >
                      <div className="flex items-center gap-1">
                        <span
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            tierDot(e.tier),
                          )}
                        />
                        <span className="truncate font-semibold">
                          {e.supplier_snapshot}
                        </span>
                      </div>
                      <div className="mt-0.5 font-mono tabular-nums opacity-80">
                        {formatIls(e.total_cost)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-3xs text-fg-subtle">
        כל הזמנה ממוקמת בתאריך ההזמנה האחרון שלה. לחיצה על הזמנה פותחת אותה במצב
        מיקוד.
      </p>
    </div>
  );
}
