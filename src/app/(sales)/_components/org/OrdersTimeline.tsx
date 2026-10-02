"use client";

// The business circle's two years on a time axis (Tom, 2026-10-02).
//
// One column per month, the newest at the left. Inside a column the orders
// stack in the circle's language: filled for an order, hollow for a
// cancellation, an amber outline for an open draft. Zoomed in far enough, each
// order is its own block, so a month reads as "these three orders" rather than
// a bar height. The line is the trend: a trailing three-month average of clean
// orders. The scale zooms on the order count; a month taller than the zoomed
// scale is cut at the top and says its true count.
//
// A month column is narrower than a fingertip on a phone, so a tap selects it
// and says what it holds; a 44px button below opens its orders. The keyboard
// opens a month directly, and the arrows walk through time.

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { UI } from "../../_lib/labels";
import { monthLabel, monthShort, type RingMonth } from "../../_lib/ring";
import { barPath, columnX, timelineMonths, yTicks, zoomLevels, type TimelineMonth } from "../../_lib/timeline";

const PAD_TOP = 24;
const PAD_BOTTOM = 30;
const PLOT_H = 180;
const AXIS_W = 30;
const PAD_LEFT = 6;
const GAP = 2;

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

/** The stack of one month, bottom to top, cut at the scale. */
function stackOf(m: TimelineMonth): Kind[] {
  return [
    ...Array<Kind>(m.filled).fill("filled"),
    ...Array<Kind>(m.hollow).fill("hollow"),
    ...Array<Kind>(m.open).fill("open"),
  ];
}

export function OrdersTimeline({ months, onMonth }: { months: RingMonth[]; onMonth: (ym: string) => void }) {
  const data = useMemo(() => timelineMonths(months), [months]);
  const dataMax = Math.max(1, ...data.map((m) => m.total));
  const levels = useMemo(() => zoomLevels(dataMax), [dataMax]);
  const [zoom, setZoom] = useState(0);
  useEffect(() => setZoom((z) => Math.min(z, levels.length - 1)), [levels.length]);
  const yMax = levels[Math.min(zoom, levels.length - 1)];

  const [selected, setSelected] = useState<string | null>(null);
  const clipId = `tl-clip-${useId().replace(/:/g, "")}`;
  const [wrapRef, width] = useWidth<HTMLDivElement>(640);
  const targets = useRef<Array<SVGRectElement | null>>([]);

  const n = data.length;
  const right = width - AXIS_W;
  const left = PAD_LEFT;
  const H = PAD_TOP + PLOT_H + PAD_BOTTOM;
  const base = PAD_TOP + PLOT_H;
  const unit = PLOT_H / yMax;
  const blocks = unit >= 7;
  const y = (v: number) => base - Math.min(v, yMax) * unit;
  const labelEvery = ((right - left) / n) * 3 >= 36 ? 3 : 6;
  const current = data[n - 1]?.ym;
  const sel = data.find((m) => m.ym === selected) ?? null;

  const trendPts = data
    .map((m, i) => {
      if (m.trend === null) return null;
      const { x, w } = columnX(i, n, left, right);
      // not clamped: above the zoomed scale the line leaves the plot (clipped), it never flattens into a false trend
      return [x + w / 2, base - m.trend * unit] as const;
    })
    .filter((p): p is readonly [number, number] => p !== null);
  const trendPath = trendPts.map(([px, py], k) => `${k === 0 ? "M" : "L"} ${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
  const last = trendPts[trendPts.length - 1];

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

  return (
    <div data-testid="orders-timeline" className="s-tl">
      <div className="s-tl-toolbar">
        <span data-testid="timeline-scale" className="s-nums text-[12px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
          {UI.timelineScale(yMax)}
        </span>
        <div className="flex items-center gap-1">
          <button type="button" className="s-icon-btn s-tl-zoom" aria-label={UI.timelineZoomOut} disabled={zoom === 0} onClick={() => setZoom((z) => Math.max(0, z - 1))}>
            <ZoomOut size={18} aria-hidden />
          </button>
          <button type="button" className="s-icon-btn s-tl-zoom" aria-label={UI.timelineZoomIn} disabled={zoom >= levels.length - 1} onClick={() => setZoom((z) => Math.min(levels.length - 1, z + 1))}>
            <ZoomIn size={18} aria-hidden />
          </button>
          <button type="button" className="s-btn s-btn-ghost s-btn-compact" aria-label={UI.timelineZoomFit} disabled={zoom === 0} onClick={() => setZoom(0)}>
            <Maximize2 size={15} aria-hidden />
            {UI.timelineZoomFitShort}
          </button>
        </div>
      </div>

      <div ref={wrapRef} className="s-tl-plot">
        <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} className="s-tl-svg" role="group" aria-label={UI.timelineChartLabel}>
          {/* gridlines and the count axis, on the right: the start side */}
          {yTicks(yMax).map((t) => (
            <g key={t} aria-hidden>
              <line x1={left} x2={right} y1={y(t)} y2={y(t)} className="s-tl-grid" />
              <text x={right + 6} y={y(t)} dy="0.35em" className="s-tl-tick s-nums" textAnchor="start">{t}</text>
            </g>
          ))}

          {data.map((m, i) => {
            const { x, w } = columnX(i, n, left, right);
            const bw = Math.min(24, Math.max(4, w * 0.64));
            const bx = x + (w - bw) / 2;
            const stack = stackOf(m);
            const shown = stack.slice(0, Math.ceil(yMax));
            const over = m.total > yMax;
            const isSel = m.ym === selected;
            const year = m.ym.endsWith("-01");
            const labelled = (n - 1 - i) % labelEvery === 0;
            const s = monthShort(m.ym);

            // segments: in block mode one per order, otherwise one per kind
            const segs: Array<{ kind: Kind; y0: number; y1: number }> = [];
            if (blocks) {
              shown.forEach((k, j) => segs.push({ kind: k, y0: j, y1: j + 1 }));
            } else {
              let at = 0;
              for (const k of ["filled", "hollow", "open"] as Kind[]) {
                const c = shown.filter((v) => v === k).length;
                if (c > 0) segs.push({ kind: k, y0: at, y1: Math.min(at + c, yMax) });
                at += c;
              }
            }

            return (
              <g key={m.ym} className="s-tl-col" data-selected={isSel || undefined}>
                {isSel ? <rect x={x} y={PAD_TOP - 6} width={w} height={PLOT_H + 6} className="s-tl-sel" aria-hidden /> : null}
                {year && i > 0 ? <line x1={x + w} x2={x + w} y1={PAD_TOP} y2={base + 8} className="s-tl-year" aria-hidden /> : null}
                {segs.map((sg, k) => {
                  const top = y(sg.y1);
                  const h = Math.max(0, y(sg.y0) - top - (k < segs.length - 1 || blocks ? GAP : 0));
                  const isTop = k === segs.length - 1;
                  return (
                    <path
                      key={k}
                      d={barPath(bx, top + (blocks ? GAP / 2 : 0), bw, blocks ? Math.max(1, unit - GAP) : h, isTop ? 4 : blocks ? 2 : 0)}
                      className={`s-tl-seg s-tl-seg-${sg.kind}`}
                      data-mark={sg.kind}
                      aria-hidden
                    />
                  );
                })}
                {over ? (
                  <g data-testid="timeline-overflow" aria-hidden>
                    <path d={`M ${bx + bw / 2 - 4} ${PAD_TOP - 4} L ${bx + bw / 2} ${PAD_TOP - 9} L ${bx + bw / 2 + 4} ${PAD_TOP - 4} Z`} className="s-tl-over-mark" />
                    {w >= 22 ? <text x={bx + bw / 2} y={PAD_TOP - 12} textAnchor="middle" className="s-tl-over s-nums">{m.total}</text> : null}
                  </g>
                ) : null}
                {labelled || year ? (
                  <text x={x + w / 2} y={base + 18} textAnchor="middle" className={`s-tl-label${m.ym === current ? " s-tl-label-now" : ""}`} aria-hidden>
                    {year ? `${s.month} ${s.year}` : s.month}
                  </text>
                ) : null}
                <rect
                  ref={(el) => { targets.current[i] = el; }}
                  x={x}
                  y={PAD_TOP - 8}
                  width={w}
                  height={PLOT_H + 8}
                  className="s-tl-hit"
                  role="button"
                  tabIndex={0}
                  aria-label={`${monthLabel(m.ym)}: ${UI.monthCounts(m.filled, m.refunded, m.hollow, m.open)}`}
                  aria-pressed={isSel}
                  onClick={() => setSelected(m.ym)}
                  onPointerEnter={(e) => { if (e.pointerType === "mouse") setSelected(m.ym); }}
                  onFocus={() => setSelected(m.ym)}
                  onKeyDown={(e) => onKey(e, i)}
                />
              </g>
            );
          })}

          <defs>
            <clipPath id={clipId}>
              <rect x={left} y={PAD_TOP - 2} width={right - left} height={PLOT_H + 2} />
            </clipPath>
          </defs>
          {trendPts.length > 1 ? (
            <g aria-hidden className="s-tl-trend" clipPath={`url(#${clipId})`}>
              <path d={trendPath} className="s-tl-trend-line" />
              {last ? <circle cx={last[0]} cy={last[1]} r={4} className="s-tl-trend-end" /> : null}
            </g>
          ) : null}

          <line x1={left} x2={right} y1={base} y2={base} className="s-tl-base" aria-hidden />
        </svg>
      </div>

      <div data-testid="timeline-callout" className="s-tl-callout" aria-live="polite">
        {sel ? (
          <>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold" style={{ color: "hsl(var(--s-fg))" }}>{monthLabel(sel.ym)}</p>
              <p className="text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>{UI.monthCounts(sel.filled, sel.refunded, sel.hollow, sel.open)}</p>
            </div>
            <button type="button" className="s-btn s-btn-primary s-btn-compact shrink-0" onClick={() => onMonth(sel.ym)}>
              {UI.timelineOpenMonth}
            </button>
          </>
        ) : (
          <p className="text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>{UI.timelinePick}</p>
        )}
      </div>

      <ul className="s-circle-legend" data-testid="timeline-legend">
        <li><span className="s-dot s-dot-filled" aria-hidden />{UI.circleLegendOrder}</li>
        <li><span className="s-dot s-dot-hollow" aria-hidden />{UI.circleLegendCancelled}</li>
        <li><span className="s-dot s-dot-open" aria-hidden />{UI.circleLegendDraft}</li>
        <li><span className="s-line-key" aria-hidden />{UI.timelineTrend}</li>
        <li className="s-circle-legend-rings">{UI.timelineAxisHint}</li>
      </ul>
    </div>
  );
}
