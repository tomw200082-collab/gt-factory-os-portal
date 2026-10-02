"use client";

// The two-year business circle: GT Pulse's signature (D1 V9 promised it).
//
// Outer ring = the last 12 months, inner ring = the 12 before, read clockwise
// with the current month ending at 12 o'clock. Every month is a named button
// (the tap target is the month, never a mark); the marks inside only show
// what it holds: filled for an order, hollow for a cancellation, an amber ring
// for an open draft. The centre says when the last order was, or, for a branch
// that moved to a distributor, where it went, and never counts that as silence.
// Below 360px the ring becomes a grid of the same 24 named buttons.

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { ChartColumn, CircleDot } from "lucide-react";
import { fmtDate, fmtDateTime } from "../../_lib/format";
import { daysSinceIsrael } from "../../_lib/israelTime";
import { UI } from "../../_lib/labels";
import { buildRing, markPoints, monthAngles, monthLabel, monthShort, sectorPath, type RingMonth } from "../../_lib/ring";
import type { OrgCircle, PendingDraft } from "../../_lib/types";
import { OrdersTimeline } from "./OrdersTimeline";

type View = "circle" | "timeline";
const VIEW_KEY = "gt.sales.ordersView";

/** The circle or the timeline, remembered per viewer (a convenience, never state that matters). */
function useOrdersView(): [View, (v: View) => void] {
  const [view, setView] = useState<View>("circle");
  useEffect(() => {
    try {
      if (window.localStorage.getItem(VIEW_KEY) === "timeline") setView("timeline");
    } catch {
      /* storage blocked: the circle is the default */
    }
  }, []);
  const choose = (v: View) => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* not remembered, still switched */
    }
  };
  return [view, choose];
}

export interface BusinessCircleProps {
  data: OrgCircle;
  pending: PendingDraft[];
  moved: { to: string; on: string } | null;
  onMonth: (ym: string) => void;
  now?: Date;
}

const C = 170;
const OUTER = { rO: 168, rI: 122, rMark: 145, cap: 6 };
const INNER = { rO: 118, rI: 76, rMark: 97, cap: 4 };

function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduce(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduce;
}

export function monthName(m: RingMonth): string {
  return `${monthLabel(m.ym)}: ${UI.monthCounts(m.filled, m.refunded, m.hollow, m.open)}`;
}

function activate(e: KeyboardEvent, go: () => void) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    go();
  }
}

type Mark = { kind: "filled" | "hollow" | "open"; x: number; y: number };

/** The marks a month has room for; past the cap the last slot says how many more. */
function marksOf(m: RingMonth, cap: number): { kinds: Array<Mark["kind"]>; more: number } {
  const kinds: Array<Mark["kind"]> = [
    ...Array<Mark["kind"]>(m.open).fill("open"),
    ...Array<Mark["kind"]>(m.filled).fill("filled"),
    ...Array<Mark["kind"]>(m.hollow).fill("hollow"),
  ];
  if (kinds.length <= cap) return { kinds, more: 0 };
  return { kinds: kinds.slice(0, cap - 1), more: kinds.length - (cap - 1) };
}

export function BusinessCircle({ data, pending, moved, onMonth, now }: BusinessCircleProps) {
  const reduce = useReducedMotion();
  const [view, setView] = useOrdersView();
  const ring = useMemo(() => buildRing(data.months, pending), [data.months, pending]);
  const all = [...ring.inner, ...ring.outer];
  const current = ring.outer[ring.outer.length - 1]?.ym;
  const newestFirst = [...all].reverse();
  const quiet = all.every((m) => m.filled + m.hollow + m.open === 0);

  function segments(months: RingMonth[], geo: typeof OUTER, ringName: "outer" | "inner") {
    return months.map((m, i) => {
      const { start, end } = monthAngles(i);
      const { kinds: marks, more } = marksOf(m, geo.cap);
      const points = markPoints(C, C, geo.rMark, start, end, marks.length + (more > 0 ? 1 : 0));
      const has = m.filled + m.hollow + m.open > 0;
      return (
        <g key={m.ym} className="s-ring-month" style={{ ["--i" as string]: ringName === "inner" ? i : i + 12 }}>
          <path
            d={sectorPath(C, C, geo.rO, geo.rI, start, end)}
            role="button"
            tabIndex={0}
            aria-label={monthName(m)}
            data-ym={m.ym}
            data-has={has || undefined}
            data-current={m.ym === current || undefined}
            className="s-ring-seg"
            onClick={() => onMonth(m.ym)}
            onKeyDown={(e) => activate(e, () => onMonth(m.ym))}
          />
          {points.map(([x, y], k) =>
            k === marks.length ? (
              <text key="more" x={x} y={y} dy="0.35em" textAnchor="middle" direction="ltr" className="s-ring-more s-nums" data-testid="ring-more" aria-hidden>
                +{more}
              </text>
            ) : (
            <circle
              key={k}
              cx={x}
              cy={y}
              r={marks[k] === "open" ? 4.6 : 4}
              data-mark={marks[k]}
              className={`s-ring-mark s-ring-mark-${marks[k]}`}
              aria-hidden
            />
            ),
          )}
        </g>
      );
    });
  }

  const last = data.last_order_at;

  return (
    <section data-testid="business-circle" aria-labelledby="org-circle-title" className="s-panel s-org-block s-circle">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="org-circle-title" className="s-section-heading">{UI.circleTitle}</h2>
        <div className="s-view-toggle" role="group" aria-label={UI.ordersViewLabel}>
          <button type="button" aria-pressed={view === "circle"} className={`s-tab ${view === "circle" ? "s-tab-active" : ""}`} onClick={() => setView("circle")}>
            <CircleDot size={15} aria-hidden />
            {UI.viewCircle}
          </button>
          <button type="button" aria-pressed={view === "timeline"} className={`s-tab ${view === "timeline" ? "s-tab-active" : ""}`} onClick={() => setView("timeline")}>
            <ChartColumn size={15} aria-hidden />
            {UI.viewTimeline}
          </button>
        </div>
      </div>

      {view === "timeline" ? (
        <>
          <div className="s-circle-grid-centre s-tl-summary">
            <CentreText moved={moved} last={last} asOf={data.as_of} quiet={quiet} now={now} />
          </div>
          <OrdersTimeline months={all} onMonth={onMonth} />
        </>
      ) : (
      <>
      <div className="s-ring-wrap" data-testid="circle-ring" data-motion={reduce ? "off" : "on"}>
        <svg viewBox="0 0 340 340" className="s-ring" role="group" aria-label={UI.circleMonthsGroup}>
          {segments(ring.inner, INNER, "inner")}
          {segments(ring.outer, OUTER, "outer")}
        </svg>
        <div className="s-ring-centre" data-testid="circle-centre">
          <CentreText moved={moved} last={last} asOf={data.as_of} quiet={quiet} now={now} />
        </div>
      </div>

      <div className="s-circle-grid" data-testid="circle-grid" role="group" aria-label={UI.circleMonthsGroup}>
        <div className="s-circle-grid-centre">
          <CentreText moved={moved} last={last} asOf={data.as_of} quiet={quiet} now={now} />
        </div>
        <div className="s-circle-cells">
          {newestFirst.map((m) => {
            const s = monthShort(m.ym);
            const { kinds: marks, more } = marksOf(m, 4);
            return (
              <button
                key={m.ym}
                type="button"
                className="s-circle-cell"
                aria-label={monthName(m)}
                data-has={m.filled + m.hollow + m.open > 0 || undefined}
                data-current={m.ym === current || undefined}
                onClick={() => onMonth(m.ym)}
              >
                <span className="s-circle-cell-month">{s.month}</span>
                <span className="s-circle-cell-year s-nums">{s.year}</span>
                <span className="s-circle-cell-marks" aria-hidden>
                  {marks.map((k, i) => (
                    <span key={i} data-mark={k} className={`s-dot s-dot-${k}`} />
                  ))}
                  {more > 0 ? <span dir="ltr" className="s-circle-cell-more s-nums">+{more}</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <ul className="s-circle-legend" data-testid="circle-legend">
        <li><span className="s-dot s-dot-filled" aria-hidden />{UI.circleLegendOrder}</li>
        <li><span className="s-dot s-dot-hollow" aria-hidden />{UI.circleLegendCancelled}</li>
        <li><span className="s-dot s-dot-open" aria-hidden />{UI.circleLegendDraft}</li>
        <li className="s-circle-legend-rings s-legend-ring">{UI.circleLegendRings}</li>
        <li className="s-circle-legend-rings s-legend-grid">{UI.circleLegendGrid}</li>
      </ul>
      </>
      )}
    </section>
  );
}

function CentreText({ moved, last, asOf, quiet, now }: { moved: { to: string; on: string } | null; last: string | null; asOf: string | null; quiet: boolean; now?: Date }) {
  return (
    <>
      {moved ? (
        <>
          <span className="s-ring-centre-label">{UI.circleMovedTitle(moved.to)}</span>
          <span className="s-ring-centre-sub s-nums">{UI.circleMovedSince(fmtDate(moved.on))}</span>
        </>
      ) : last ? (
        <>
          <span className="s-ring-centre-label">{UI.lastOrder}</span>
          <span className="s-ring-centre-value s-nums">{fmtDate(last)}</span>
          <span className="s-ring-centre-sub s-nums">{UI.daysSince(daysSinceIsrael(last, now))}</span>
        </>
      ) : (
        <span className="s-ring-centre-label">{quiet ? UI.circleNoOrders : UI.noOrdersYet}</span>
      )}
      {/* two lines on purpose: one line wraps mid-date inside the ring's centre (rendered at 390px) */}
      <span className="s-ring-centre-source">{UI.circleSource}</span>
      {asOf ? (
        <span className="s-ring-centre-source s-nums">
          <bdi>{fmtDateTime(asOf)}</bdi>
        </span>
      ) : null}
    </>
  );
}
