"use client";

// ---------------------------------------------------------------------------
// CalendarView — secondary "calendar" view of the procurement page (Tranche
// 033). A forward-looking, Sunday-first month grid of the open session's orders
// placed on their order-by date. Derived entirely from session.pos via the
// pure calendar-grid helpers — no second fetch. A day chip opens focus mode at
// that order.
//
// Tranche 053 (FLOW-004): below md (768px) the 7-col month grid is replaced by
// a grouped-by-week list (supplier · tier chip/dot · date · ₪ amount; tap
// opens focus mode exactly like the desktop cell button). Desktop md+ renders
// the original grid unchanged. CSS-breakpoint switch — no JS media query.
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
  type CalEntry,
  type GridDay,
} from "../_lib/calendar-grid";
import { todayISO } from "../_lib/decision";

const DOW_HE = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
const MONTH_HE = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];
// ux-release-gate 2026-07-23 R2-F01/COPY-032: these used to be the SQL
// engine's raw tier vocabulary ("דחוף"/"חובה השבוע"/"מומלץ להקדים"), which
// contradicted ActionList's decision-bucket labels for the exact same PO
// when a planner switched from list to calendar view. Aligned to
// ActionList's own bucket terms ("חייב לצאת היום"/"יכול לחכות") — must and
// recommended now read identically since both mean "can wait", with the
// per-entry dot/chip color (tierDot/tierChip) still carrying the urgency
// gradient between them.
const TIER_LABEL: Record<PoTierLike, string> = {
  urgent: "חייב לצאת היום",
  must: "יכול לחכות",
  recommended: "יכול לחכות",
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

/** "8 ביוני" — Hebrew day-of-month + month label for the mobile list. */
function hebDate(g: GridDay): string {
  return `${g.dayOfMonth} ב${MONTH_HE[g.monthIdx]}`;
}

interface WeekGroup {
  start: GridDay;
  end: GridDay;
  rows: { entry: CalEntry; day: GridDay; dow: string }[];
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

  // R2-F01/COPY-032: must + recommended now share the "יכול לחכות" label —
  // show one merged summary chip (not two identically-labeled ones), and
  // drop any bucket with nothing in it rather than a "· 0" chip (R2-F11).
  const bucketSummary = useMemo(() => {
    const buckets = [
      {
        key: "urgent" as const,
        label: TIER_LABEL.urgent,
        count: totals.byTier.urgent,
        dot: tierDot("urgent"),
        chip: tierChip("urgent"),
      },
      {
        key: "can_wait" as const,
        label: TIER_LABEL.must,
        count: totals.byTier.must + totals.byTier.recommended,
        dot: tierDot("must"),
        chip: tierChip("must"),
      },
    ];
    return buckets.filter((b) => b.count > 0);
  }, [totals.byTier]);

  // FLOW-004: chunk the Sunday-aligned grid into weeks; keep only weeks that
  // actually carry orders. Same single source of truth (byDay) as the grid.
  const weeks = useMemo<WeekGroup[]>(() => {
    const out: WeekGroup[] = [];
    for (let w = 0; w + 7 <= grid.length; w += 7) {
      const chunk = grid.slice(w, w + 7);
      const rows = chunk.flatMap((g, i) =>
        (byDay.get(g.iso) ?? []).map((entry) => ({
          entry,
          day: g,
          dow: DOW_HE[i]!,
        })),
      );
      if (rows.length > 0) {
        out.push({ start: chunk[0]!, end: chunk[6]!, rows });
      }
    }
    return out;
  }, [grid, byDay]);

  return (
    <div className="space-y-4" data-testid="procurement-calendar">
      {/* Summary strip */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {bucketSummary.map((b) => (
            <span
              key={b.key}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-3xs font-semibold",
                b.chip,
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", b.dot)} />
              {`${b.label} · ${b.count}`}
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

      {/* Mobile (<md): grouped-by-week list — FLOW-004 */}
      <div className="space-y-3 md:hidden" data-testid="procurement-calendar-list">
        {weeks.length === 0 ? (
          <div className="card p-6 text-center text-sm text-fg-muted">
            אין הזמנות מתוכננות בתקופה הקרובה.
          </div>
        ) : (
          weeks.map((w) => (
            <div
              key={w.start.iso}
              className="card overflow-hidden p-0"
              data-testid="calendar-week-group"
              data-week-start={w.start.iso}
            >
              <div className="border-b border-border/60 bg-bg-subtle/50 px-3 py-1.5 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                {`שבוע ${hebDate(w.start)} – ${hebDate(w.end)}`}
              </div>
              <div className="divide-y divide-border/40">
                {w.rows.map(({ entry: e, day: d, dow }) => (
                  <button
                    key={e.session_po_id}
                    type="button"
                    onClick={() => onOpen?.(e.session_po_id)}
                    className={cn(
                      "flex min-h-[44px] w-full items-center gap-2.5 px-3 py-2 text-right transition-colors hover:bg-bg-muted",
                      e.status === "placed" || e.status === "skipped"
                        ? "opacity-50"
                        : "",
                    )}
                    title={`${e.supplier_snapshot} · ${e.line_count} פריטים · ${formatIls(e.total_cost)}`}
                    data-testid={`calendar-list-entry-${e.session_po_id}`}
                  >
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        tierDot(e.tier),
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {e.supplier_snapshot}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-3xs text-fg-subtle">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-1.5 py-px font-semibold",
                            tierChip(e.tier),
                          )}
                        >
                          {TIER_LABEL[e.tier]}
                        </span>
                        <span>{`יום ${dow}׳ · ${hebDate(d)}`}</span>
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                      {formatIls(e.total_cost)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Grid — desktop md+ only (FLOW-004 keeps it byte-identical at md+) */}
      <div className="card hidden overflow-hidden p-0 md:block">
        <div
          className="grid grid-cols-7 border-b border-border/60 bg-bg-subtle/50"
          aria-hidden="true"
        >
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
