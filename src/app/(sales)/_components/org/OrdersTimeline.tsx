"use client";

// The business circle's two years on a time axis (Tom, 2026-10-02; redesigned
// the same day at his word: "elegant, glowing, inviting, and clear").
//
// It reads top down. First comes a headline: the orders of the two years, and
// which way the last three full months lean against the three before. Below it
// is the instrument, one column per month with the newest at the left. Zoomed
// in far enough, each order is a bead, as in the circle: filled for an order,
// hollow for a cancellation, amber for an open draft. At fit, a month is a slim
// glowing capsule. The trend is a smooth curve with light under it, and it
// stops at the last full month: the month in progress is drawn as such and
// never counts, because a partial month is not a drop.
//
// A tap lights a month like a beam, dims the rest, and says what it holds; a
// 44px button opens its orders. The keyboard opens a month directly, and the
// arrows walk through time.

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Minus, MoveHorizontal, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { UI } from "../../_lib/labels";
import { monthLabel, monthShort, type RingMonth } from "../../_lib/ring";
import { barPath, columnX, smoothPath, timelineMonths, trendSummary, yTicks, zoomLevels, type TimelineMonth } from "../../_lib/timeline";

const PAD_TOP = 34;
const PLOT_H = 172;
const PAD_BOTTOM = 46;
const AXIS_W = 26;
const PAD_LEFT = 4;
const GAP = 2;
/** a bead needs this much height per order before it reads as a bead */
const BEAD_UNIT = 10;

function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

type Kind = "filled" | "hollow" | "open";

/** The stack of one month, bottom to top. */
function stackOf(m: TimelineMonth): Kind[] {
  return [
    ...Array<Kind>(m.filled).fill("filled"),
    ...Array<Kind>(m.hollow).fill("hollow"),
    ...Array<Kind>(m.open).fill("open"),
  ];
}

const fmtAvg = (n: number) => (Math.round(n * 10) / 10).toLocaleString("he-IL");

export function OrdersTimeline({ months, onMonth, meta, asOf = null }: { months: RingMonth[]; onMonth: (ym: string) => void; meta?: ReactNode; asOf?: string | null }) {
  const data = useMemo(() => timelineMonths(months, asOf), [months, asOf]);
  const summary = useMemo(() => trendSummary(data), [data]);
  const dataMax = Math.max(1, ...data.map((m) => m.total));
  // zoom stops at the height of a typical month: past it nearly every column would
  // only say it is cut, and the chart would show nothing (visual gate TL-001)
  const levels = useMemo(() => {
    const busy = data.map((m) => m.total).filter((t) => t > 0).sort((a, b) => a - b);
    const typical = busy.length ? busy[Math.floor((busy.length - 1) / 2)] : 0;
    return zoomLevels(dataMax).filter((l, k) => k === 0 || l >= typical);
  }, [data, dataMax]);
  const [zoom, setZoom] = useState(0);
  useEffect(() => setZoom((z) => Math.min(z, levels.length - 1)), [levels.length]);
  const yMax = levels[Math.min(zoom, levels.length - 1)];

  // selected: chosen by tap, click or keyboard, and said in words below the chart.
  // hovered: a mouse passing over, lit for the eye only; it never speaks (A11Y NEW-001).
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const lit = hovered ?? selected;
  const uid = useId().replace(/:/g, "");
  const [wrapRef, width] = useWidth<HTMLDivElement>(640);
  const targets = useRef<Array<SVGRectElement | null>>([]);
  // a finger drawn along the chart chooses the month under it (a month column is
  // narrower than a fingertip on a phone); the tap that ends a drag is not a second choice
  const scrub = useRef<{ x: number; moved: boolean } | null>(null);
  const scrubbed = useRef(false);
  // what was chosen when a press began: the press focuses the month (which chooses it)
  // before its click, so "tap again to let go" must look at the state before the press
  const pressStart = useRef<string | null | undefined>(undefined);

  const n = data.length;
  const right = width - AXIS_W;
  const left = PAD_LEFT;
  const H = PAD_TOP + PLOT_H + PAD_BOTTOM;
  const base = PAD_TOP + PLOT_H;
  const unit = PLOT_H / yMax;
  const colW = (right - left) / n;
  // beads when there is room and few enough of them to read as orders, not as a wall
  const beads = unit >= BEAD_UNIT && (zoom > 0 || yMax <= 4);
  const y = (v: number) => base - Math.min(v, yMax) * unit;
  const labelEvery = colW * 3 >= 36 ? 3 : 6;
  const sel = data.find((m) => m.ym === selected) ?? null;
  const litMonth = data.find((m) => m.ym === lit) ?? null;
  // one tab stop for the whole chart; the arrows move within it (roving tabindex)
  const tabStop = sel ? data.indexOf(sel) : n - 1;

  // the trend: a smooth curve through the full months, with light under it
  const trendPts = data
    .map((m, i) => {
      if (m.trend === null) return null;
      const { x, w } = columnX(i, n, left, right);
      // not clamped: above the zoomed scale the line leaves the plot (clipped), it never flattens into a false trend
      return [x + w / 2, base - m.trend * unit] as const;
    })
    .filter((p): p is readonly [number, number] => p !== null)
    .sort((a, b) => a[0] - b[0]);
  const trendLine = smoothPath(trendPts);
  const trendArea =
    trendPts.length > 1
      ? `${trendLine} L ${trendPts[trendPts.length - 1][0].toFixed(1)} ${base} L ${trendPts[0][0].toFixed(1)} ${base} Z`
      : "";
  const newest = [...data].reverse().find((m) => m.trend !== null) ?? null;
  const end = trendPts[0];

  // the year row under the months
  const years = useMemo(() => {
    const out: Array<{ year: string; from: number; to: number }> = [];
    data.forEach((m, i) => {
      const yr = m.ym.slice(0, 4);
      const last = out[out.length - 1];
      if (last && last.year === yr) last.to = i;
      else out.push({ year: yr, from: i, to: i });
    });
    return out;
  }, [data]);

  function monthAt(clientX: number, el: Element): number {
    const box = el.getBoundingClientRect();
    const x = clientX - box.left;
    return Math.max(0, Math.min(n - 1, Math.floor((right - x) / colW)));
  }

  function onKey(e: KeyboardEvent, i: number) {
    const move = (to: number) => {
      e.preventDefault();
      const t = Math.max(0, Math.min(n - 1, to));
      targets.current[t]?.focus();
      setSelected(data[t].ym);
    };
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onMonth(data[i].ym);
    } else if (e.key === "ArrowLeft") move(i + 1);
    else if (e.key === "ArrowRight") move(i - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(n - 1);
  }

  const TrendIcon = summary.direction === "up" ? TrendingUp : summary.direction === "down" ? TrendingDown : MoveHorizontal;

  return (
    <div data-testid="orders-timeline" className="s-tl">
      <div className="s-tl-head">
        <p className="s-tl-total">
          <span className="s-tl-total-n s-nums">{summary.total.toLocaleString("he-IL")}</span>
          <span className="s-tl-total-l">{summary.total === 1 ? UI.timelineTotalOne : UI.timelineTotal}</span>
        </p>
        {summary.direction ? (
          <span className="s-tl-trendpill s-nums" data-dir={summary.direction} data-testid="timeline-trend">
            <TrendIcon size={15} aria-hidden />
            {UI.timelineTrendWord(summary.direction, summary.pct)}
            <span className="sr-only"> · {UI.timelineTrendBasis}</span>
          </span>
        ) : null}
      </div>
      {summary.direction ? <p className="s-tl-basis" aria-hidden>{UI.timelineTrendBasis}</p> : null}
      {meta ? <div className="s-tl-meta">{meta}</div> : null}

      <div className="s-tl-toolbar">
        <span data-testid="timeline-scale" className="s-tl-scale s-nums">{UI.timelineScale(yMax)}</span>
        <div className="s-tl-zoombar" role="group" aria-label={UI.timelineZoomLabel}>
          <button type="button" className="s-tl-zoom" aria-label={UI.timelineZoomOut} title={zoom === 0 ? UI.timelineZoomAtFit : undefined} disabled={zoom === 0} onClick={() => setZoom((z) => Math.max(0, z - 1))}>
            <Minus size={16} aria-hidden />
          </button>
          <button type="button" className="s-tl-zoom" aria-label={UI.timelineZoomIn} title={zoom >= levels.length - 1 ? UI.timelineZoomAtMax : undefined} disabled={zoom >= levels.length - 1} onClick={() => setZoom((z) => Math.min(levels.length - 1, z + 1))}>
            <Plus size={16} aria-hidden />
          </button>
          <button type="button" className="s-tl-zoom s-tl-zoom-fit" aria-label={UI.timelineZoomFit} title={zoom === 0 ? UI.timelineZoomAtFit : undefined} disabled={zoom === 0} onClick={() => setZoom(0)}>
            <Maximize2 size={14} aria-hidden />
            <span className="s-tl-zoom-fit-text">{UI.timelineZoomFitShort}</span>
          </button>
        </div>
      </div>

      <div
        ref={wrapRef}
        className="s-tl-plot"
        data-selecting={litMonth ? "" : undefined}
        onPointerLeave={() => setHovered(null)}
        onPointerDown={(e) => {
          scrubbed.current = false;
          if (e.pointerType !== "mouse") scrub.current = { x: e.clientX, moved: false };
        }}
        onPointerMove={(e) => {
          const s = scrub.current;
          if (!s) return;
          if (!s.moved && Math.abs(e.clientX - s.x) < 6) return;
          s.moved = true;
          scrubbed.current = true;
          const svg = e.currentTarget.querySelector("svg");
          if (svg) setSelected(data[monthAt(e.clientX, svg)].ym);
        }}
        onPointerUp={() => { scrub.current = null; }}
        onPointerCancel={() => { scrub.current = null; }}
      >
        <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} className="s-tl-svg" role="group" aria-label={UI.timelineChartLabel}>
          <defs>
            <linearGradient id={`${uid}-area`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className="s-tl-stop-area-top" />
              <stop offset="1" className="s-tl-stop-area-bottom" />
            </linearGradient>
            <linearGradient id={`${uid}-bar`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className="s-tl-stop-bar-top" />
              <stop offset="1" className="s-tl-stop-bar-bottom" />
            </linearGradient>
            <linearGradient id={`${uid}-beam`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className="s-tl-stop-beam-top" />
              <stop offset="1" className="s-tl-stop-beam-bottom" />
            </linearGradient>
            <clipPath id={`${uid}-clip`}>
              <rect x={left} y={PAD_TOP - 2} width={right - left} height={PLOT_H + 2} />
            </clipPath>
          </defs>

          <rect x={left} y={PAD_TOP - 8} width={right - left} height={PLOT_H + 8} rx={14} className="s-tl-stage" aria-hidden />

          {/* faint dotted gridlines; the count axis on the right, the start side */}
          {yTicks(yMax).map((t) => (
            <g key={t} aria-hidden>
              {t > 0 ? <line x1={left + 6} x2={right - 6} y1={y(t)} y2={y(t)} className="s-tl-grid" /> : null}
              <text x={right + 7} y={y(t)} dy="0.35em" className="s-tl-tick s-nums" textAnchor="start">{t}</text>
            </g>
          ))}

          {litMonth ? (() => {
            const i = data.indexOf(litMonth);
            const { x, w } = columnX(i, n, left, right);
            return <rect x={x + 1} y={PAD_TOP - 8} width={Math.max(2, w - 2)} height={PLOT_H + 8} rx={Math.min(10, w / 2)} fill={`url(#${uid}-beam)`} className="s-tl-beam" aria-hidden />;
          })() : null}

          {/* the light under the trend, behind the months */}
          {trendArea ? <path d={trendArea} fill={`url(#${uid}-area)`} clipPath={`url(#${uid}-clip)`} className="s-tl-area" aria-hidden /> : null}

          {data.map((m, i) => {
            const { x, w } = columnX(i, n, left, right);
            const bw = Math.min(18, Math.max(5, w * 0.56));
            const bx = x + (w - bw) / 2;
            const cx = x + w / 2;
            const stack = stackOf(m);
            const shown = stack.slice(0, Math.ceil(yMax));
            const over = m.total > yMax;
            const isSel = m.ym === lit;
            const year = m.ym.endsWith("-01");
            const labelled = (n - 1 - i) % labelEvery === 0;
            const s = monthShort(m.ym);

            let marks: ReactNode[];
            if (beads) {
              const r = Math.max(2.5, Math.min((w - 3) / 2, (unit - 3) / 2, 7));
              marks = shown.map((k, j) => (
                <circle key={j} cx={cx} cy={base - (j + 0.5) * unit} r={k === "filled" ? r : r - 0.8} className={`s-tl-bead s-tl-bead-${k}`} data-mark={k} aria-hidden />
              ));
            } else {
              const segs: Array<{ kind: Kind; y0: number; y1: number }> = [];
              let at = 0;
              for (const k of ["filled", "hollow", "open"] as Kind[]) {
                const c = shown.filter((v) => v === k).length;
                if (c > 0) segs.push({ kind: k, y0: at, y1: Math.min(at + c, yMax) });
                at += c;
              }
              marks = segs.map((sg, k) => {
                const top = y(sg.y1);
                const isTop = k === segs.length - 1;
                const h = Math.max(0, y(sg.y0) - top - (isTop ? 0 : GAP));
                return (
                  <path
                    key={k}
                    d={barPath(bx, top, bw, h, isTop ? bw / 2 : 1.5)}
                    fill={sg.kind === "filled" ? `url(#${uid}-bar)` : undefined}
                    className={`s-tl-seg s-tl-seg-${sg.kind}`}
                    data-mark={sg.kind}
                    aria-hidden
                  />
                );
              });
            }

            // the count bubble rides above both the column and the trend's point, never over either (TL-002)
            const trendY = m.trend === null ? Infinity : base - m.trend * unit;
            const colTop = Math.max(PAD_TOP + 21, Math.min(y(Math.min(m.total, yMax)), trendY - 6));
            return (
              <g key={m.ym} className="s-tl-col" data-selected={isSel || undefined} data-partial={m.partial || undefined}>
                {/* dimmed on the wrapper: the arrival animation owns the bars' own opacity */}
                <g className="s-tl-dim">
                  <g className="s-tl-bars" style={{ ["--i" as string]: i }}>{marks}</g>
                </g>
                {over ? (
                  <g data-testid="timeline-overflow" aria-hidden>
                    {w >= 22 ? (
                      <>
                        <rect x={cx - 13} y={PAD_TOP - 28} width={26} height={17} rx={8.5} className="s-tl-over-chip" />
                        <text x={cx} y={PAD_TOP - 19.5} dy="0.35em" textAnchor="middle" className="s-tl-over s-nums">{m.total}</text>
                      </>
                    ) : (
                      <path d={`M ${cx - 3.5} ${PAD_TOP - 6} L ${cx} ${PAD_TOP - 11} L ${cx + 3.5} ${PAD_TOP - 6}`} className="s-tl-over-mark" />
                    )}
                  </g>
                ) : null}
                {isSel && m.total > 0 && !over ? (
                  <g aria-hidden className="s-tl-bubble">
                    <rect x={cx - 13} y={colTop - 27} width={26} height={19} rx={9.5} />
                    <text x={cx} y={colTop - 17.5} dy="0.35em" textAnchor="middle" className="s-nums">{m.total}</text>
                  </g>
                ) : null}
                {m.partial ? (
                  <g aria-hidden>
                    <rect x={Math.max(0, cx - 17)} y={base + 6} width={34} height={18} rx={9} className="s-tl-now-chip" />
                    <text x={Math.max(17, cx)} y={base + 15} dy="0.35em" textAnchor="middle" className="s-tl-label s-tl-label-now">{s.month}</text>
                  </g>
                ) : labelled || year ? (
                  <text x={cx} y={base + 15} dy="0.35em" textAnchor="middle" className="s-tl-label" aria-hidden>{s.month}</text>
                ) : null}
                <rect
                  ref={(el) => { targets.current[i] = el; }}
                  x={x}
                  y={PAD_TOP - 8}
                  width={w}
                  height={PLOT_H + 8}
                  className="s-tl-hit"
                  role="button"
                  tabIndex={i === tabStop ? 0 : -1}
                  aria-label={`${monthLabel(m.ym)}: ${UI.monthCounts(m.filled, m.refunded, m.hollow, m.open)}${m.partial ? ` (${UI.timelineInProgress})` : ""}`}
                  aria-pressed={m.ym === selected}
                  onPointerDown={() => { pressStart.current = selected; }}
                  onClick={() => {
                    const before = pressStart.current === undefined ? selected : pressStart.current;
                    pressStart.current = undefined;
                    if (scrubbed.current) {
                      scrubbed.current = false;
                      return;
                    }
                    setSelected(before === m.ym ? null : m.ym);
                  }}
                  onPointerEnter={(e) => { if (e.pointerType === "mouse") setHovered(m.ym); }}
                  onFocus={() => setSelected(m.ym)}
                  onKeyDown={(e) => onKey(e, i)}
                />
              </g>
            );
          })}

          {trendPts.length > 1 ? (
            <g aria-hidden className="s-tl-trend" clipPath={`url(#${uid}-clip)`}>
              <path d={trendLine} className="s-tl-trend-glow" />
              <path d={trendLine} pathLength={1} className="s-tl-trend-line" />
              {end ? (
                <>
                  <circle cx={end[0]} cy={end[1]} r={9} className="s-tl-trend-halo" />
                  <circle cx={end[0]} cy={end[1]} r={4} className="s-tl-trend-end" />
                </>
              ) : null}
            </g>
          ) : null}

          {/* the year row: each year named under its months */}
          {years.map((yr, k) => {
            const a = columnX(yr.to, n, left, right).x;
            const b = columnX(yr.from, n, left, right);
            const mid = (a + b.x + b.w) / 2;
            const span = b.x + b.w - a;
            return (
              <g key={yr.year} aria-hidden>
                {k > 0 ? <line x1={b.x + b.w} x2={b.x + b.w} y1={base + 28} y2={base + 42} className="s-tl-yearsep" /> : null}
                {span >= 34 ? <text x={mid} y={base + 36} dy="0.35em" textAnchor="middle" className="s-tl-year s-nums">{yr.year}</text> : null}
              </g>
            );
          })}
        </svg>
      </div>

      {/* not a live region: each month's own name already says what it holds, so this would say it twice (A11Y NEW-003) */}
      <div data-testid="timeline-callout" className="s-tl-callout" data-on={sel ? "" : undefined}>
        {sel ? (
          <>
            <div className="min-w-0">
              <p className="s-tl-callout-title">
                {monthLabel(sel.ym)}
                {sel.partial ? <span className="s-tl-callout-tag">{UI.timelineInProgress}</span> : null}
              </p>
              <p className="s-tl-callout-sub">{UI.monthCounts(sel.filled, sel.refunded, sel.hollow, sel.open)}</p>
            </div>
            <div className="s-tl-callout-actions">
              {/* every month within reach of a full-size target, whatever the column width (WCAG 2.5.8) */}
              <div className="s-tl-steps" role="group" aria-label={UI.timelineSteps}>
                <button type="button" className="s-tl-zoom" aria-label={UI.timelineMonthPrev} disabled={data.indexOf(sel) === 0} onClick={() => setSelected(data[data.indexOf(sel) - 1].ym)}>
                  <ChevronRight size={18} aria-hidden />
                </button>
                <button type="button" className="s-tl-zoom" aria-label={UI.timelineMonthNext} disabled={data.indexOf(sel) === n - 1} onClick={() => setSelected(data[data.indexOf(sel) + 1].ym)}>
                  <ChevronLeft size={18} aria-hidden />
                </button>
              </div>
              <button
                type="button"
                className="s-btn s-btn-primary s-btn-compact shrink-0"
                disabled={sel.total === 0}
                title={sel.total === 0 ? UI.monthEmpty : undefined}
                onClick={() => onMonth(sel.ym)}
              >
                {UI.timelineOpenMonth}
              </button>
            </div>
          </>
        ) : (
          <p className="s-tl-callout-sub">{UI.timelinePick}</p>
        )}
      </div>

      <ul className="s-tl-legend" data-testid="timeline-legend">
        <li><span className="s-dot s-dot-filled" aria-hidden />{UI.circleLegendOrder}</li>
        <li><span className="s-dot s-dot-hollow" aria-hidden />{UI.circleLegendCancelled}</li>
        <li><span className="s-dot s-dot-open" aria-hidden />{UI.circleLegendDraft}</li>
        <li>
          <span className="s-line-key" aria-hidden />
          {UI.timelineTrend}
          {newest?.trend != null ? <span className="s-tl-legend-now s-nums">{UI.timelineAvgNow(fmtAvg(newest.trend))}</span> : null}
        </li>
        <li className="s-tl-legend-hint">{UI.timelineAxisHint}</li>
      </ul>
    </div>
  );
}
