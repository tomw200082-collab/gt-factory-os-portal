"use client";

// ---------------------------------------------------------------------------
// /planning/purchase-calendar — Procurement Calendar
//
// A forward-looking month-grid view of the current purchase session's
// consolidated PO drafts, each placed on its order-by date. Gives the
// planner the strategic picture: what to order, from whom, when, how much.
//
// Hebrew operator UI · Sunday-first weeks · honest loading/empty/error.
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import Link from "next/link";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { cn } from "@/lib/cn";
import {
  usePurchaseCalendar,
  type CalendarEntry,
  type PoTier,
} from "./_lib/api";

const WEEKS = 10;
const DOW_HE = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
const MONTH_HE = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];
const TIER_LABEL: Record<PoTier, string> = {
  urgent: "דחוף",
  must: "חובה השבוע",
  recommended: "מומלץ להקדים",
};
const TIER_RANK: Record<PoTier, number> = { urgent: 0, must: 1, recommended: 2 };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fmtMoney(n: number): string {
  const fixed = Math.round(n).toString();
  return `${fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ",")} ₪`;
}
function tierDot(t: PoTier): string {
  if (t === "urgent") return "bg-danger";
  if (t === "must") return "bg-warning";
  return "bg-info";
}
function tierChip(t: PoTier): string {
  if (t === "urgent") return "border-danger/30 bg-danger-softer text-danger-fg";
  if (t === "must") return "border-warning/30 bg-warning-softer text-warning-fg";
  return "border-info/30 bg-info-softer text-info-fg";
}

export default function PurchaseCalendarPage() {
  const { data, isLoading, isError, error } = usePurchaseCalendar();

  const todayISO = useMemo(() => toISO(new Date()), []);

  // Build a Sunday-aligned grid of WEEKS*7 days starting from the Sunday
  // on or before today.
  const grid = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - start.getDay()); // back to Sunday
    const days: Date[] = [];
    for (let i = 0; i < WEEKS * 7; i += 1) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, []);

  const entriesByDay = useMemo(() => {
    const m = new Map<string, CalendarEntry[]>();
    for (const e of data?.entries ?? []) {
      const arr = m.get(e.order_by_date) ?? [];
      arr.push(e);
      m.set(e.order_by_date, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier]);
    }
    return m;
  }, [data]);

  const totals = useMemo(() => {
    const entries = data?.entries ?? [];
    const t = {
      count: entries.length,
      cost: 0,
      byTier: { urgent: 0, must: 0, recommended: 0 } as Record<PoTier, number>,
    };
    for (const e of entries) {
      t.cost += e.total_cost;
      t.byTier[e.tier] += 1;
    }
    return t;
  }, [data]);

  return (
    <div className="space-y-5">
      <WorkflowHeader
        eyebrow="מרחב התכנון"
        title="לוח הרכש"
        description="מבט קדימה על כל הזמנות הרכש של המושב הנוכחי — מה להזמין, מאיזה ספק, מתי וכמה זה עולה."
        meta={
          <Link
            href="/planning/purchase-session"
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1 text-xs font-semibold text-fg-muted transition-colors hover:border-border hover:text-fg"
          >
            למושב הרכש ←
          </Link>
        }
      />

      {isLoading ? (
        <div className="card p-6 text-center text-sm text-fg-muted">
          טוען את לוח הרכש…
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-danger/40 bg-danger-softer px-3 py-2 text-xs text-danger-fg">
          {(error as Error)?.message ?? "לא ניתן לטעון את לוח הרכש."}
        </div>
      ) : !data || data.session_id === null ? (
        <div className="card p-6 text-center text-sm text-fg-muted">
          עדיין לא הורץ מושב רכש. התחילו מושב כדי לראות את לוח ההזמנות.
        </div>
      ) : (
        <>
          {/* Summary strip */}
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              {(Object.keys(TIER_LABEL) as PoTier[]).map((t) => (
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
                {fmtMoney(totals.cost)}
              </span>
            </div>
          </div>

          {/* Calendar grid */}
          <div className="card overflow-hidden p-0">
            {/* DOW header */}
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
            {/* Day cells */}
            <div className="grid grid-cols-7">
              {grid.map((d, idx) => {
                const iso = toISO(d);
                const isToday = iso === todayISO;
                const isPast = iso < todayISO;
                const entries = entriesByDay.get(iso) ?? [];
                const showMonth = d.getDate() === 1 || idx === 0;
                return (
                  <div
                    key={iso}
                    className={cn(
                      "min-h-[5.5rem] border-b border-l border-border/40 p-1.5",
                      idx % 7 === 6 ? "border-l-0" : "",
                      isPast ? "bg-bg-subtle/30" : "bg-bg",
                      isToday ? "ring-1 ring-inset ring-accent/60" : "",
                    )}
                  >
                    <div className="mb-1 flex items-baseline justify-between">
                      <span
                        className={cn(
                          "text-3xs font-semibold tabular-nums",
                          isToday ? "text-accent" : "text-fg-subtle",
                        )}
                      >
                        {d.getDate()}
                      </span>
                      {showMonth ? (
                        <span className="text-3xs text-fg-subtle">
                          {MONTH_HE[d.getMonth()]}
                        </span>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      {entries.map((e) => (
                        <Link
                          key={e.session_po_id}
                          href="/planning/purchase-session"
                          className={cn(
                            "block rounded border px-1.5 py-0.5 text-3xs transition-colors",
                            tierChip(e.tier),
                            e.status === "placed" ? "opacity-50" : "",
                          )}
                          title={`${e.supplier_snapshot} · ${e.line_count} פריטים · ${fmtMoney(e.total_cost)}`}
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
                            {fmtMoney(e.total_cost)}
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-3xs text-fg-subtle">
            כל הזמנה ממוקמת בתאריך ההזמנה האחרון שלה. לחיצה על הזמנה פותחת את
            מושב הרכש.
          </p>
        </>
      )}
    </div>
  );
}
