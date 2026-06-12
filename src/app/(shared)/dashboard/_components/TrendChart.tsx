// ---------------------------------------------------------------------------
// TrendChart — dependency-free, INTERACTIVE SVG visualisations for the
// dashboard trend band.
//
//   - <TrendAreaChart>  — single-series area+line (production activity / value).
//   - <MovementBars>    — grouped inbound/outbound bars (stock movement flow).
//   - <RangeSelector>   — 7 / 14 / 30-day segmented control shared by the band.
//
// Interaction (meaningful, accessible):
//   • pointer + touch  — a crosshair tracks the nearest day and a tooltip shows
//     its exact values (works on phones via touchmove).
//   • keyboard         — the chart is focusable; ←/→ move the cursor, Home/End
//     jump, Esc clears. An aria-live region announces the focused point.
//
// Theme-aware (colour via `currentColor` + tokens), draw-in gated behind
// `prefers-reduced-motion`. Components own no data — the page derives buckets.
// ---------------------------------------------------------------------------
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { DayBucket, FlowDayBucket } from "../_lib/trends";

// Shared viewBox geometry. Rendered responsively (width:100%, fixed height).
const VB_W = 320;
const VB_H = 96;
const PAD_X = 6;
const PAD_TOP = 10;
const PAD_BOTTOM = 16;
const INNER_W = VB_W - PAD_X * 2;
const INNER_H = VB_H - PAD_TOP - PAD_BOTTOM;
const BASE_Y = VB_H - PAD_BOTTOM;

type Tone = "accent" | "info" | "success";
const TONE_TEXT: Record<Tone, string> = {
  accent: "text-accent",
  info: "text-info",
  success: "text-success",
};

function useDraw(): { drawn: boolean; reduce: boolean } {
  const [drawn, setDrawn] = useState(false);
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const prefers =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefers) {
      setReduce(true);
      setDrawn(true);
      return;
    }
    const raf = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return { drawn, reduce };
}

// Active-point interaction (pointer / touch / keyboard) over `n` points.
function useActiveIndex(n: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);

  const fromClientX = (clientX: number): number | null => {
    const el = ref.current;
    if (!el || n <= 0) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0) return null;
    const vbX = ((clientX - r.left) / r.width) * VB_W;
    const i = n <= 1 ? 0 : Math.round(((vbX - PAD_X) / INNER_W) * (n - 1));
    return Math.max(0, Math.min(n - 1, i));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const i = fromClientX(e.clientX);
    if (i !== null) setActive(i);
  };
  const onPointerLeave = () => setActive(null);
  const onTouchPoint = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    const i = fromClientX(t.clientX);
    if (i !== null) setActive(i);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (n <= 0) return;
    let next: number | null = active;
    switch (e.key) {
      case "ArrowRight":
        next = Math.min(n - 1, (active ?? -1) + 1);
        break;
      case "ArrowLeft":
        next = Math.max(0, (active ?? n) - 1);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = n - 1;
        break;
      case "Escape":
        setActive(null);
        return;
      default:
        return;
    }
    e.preventDefault();
    setActive(next);
  };

  return {
    ref,
    active,
    setActive,
    handlers: {
      onPointerMove,
      onPointerLeave,
      onTouchStart: onTouchPoint,
      onTouchMove: onTouchPoint,
      onKeyDown,
    },
  };
}

function AxisTicks({
  buckets,
  peakLabel,
}: {
  buckets: { label: string }[];
  /** "peak 12" — y-reference for the dashed peak gridline (Tranche 061). */
  peakLabel?: string | null;
}) {
  if (buckets.length === 0) return null;
  return (
    <div className="mt-1 flex justify-between text-3xs tabular-nums text-fg-faint">
      <span>{buckets[0]?.label}</span>
      {peakLabel ? <span>{peakLabel}</span> : null}
      <span>{buckets[buckets.length - 1]?.label}</span>
    </div>
  );
}

// Floating tooltip + crosshair host. `xPct` is 0..100 across the chart width.
function Tooltip({ xPct, children }: { xPct: number; children: ReactNode }) {
  const clamped = Math.max(7, Math.min(93, xPct));
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-border bg-bg-raised px-2 py-1 text-2xs shadow-pop"
      style={{ left: `${clamped}%` }}
      role="status"
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TrendAreaChart — single series (counts or reconstructed value).
// ---------------------------------------------------------------------------
export function TrendAreaChart({
  buckets,
  ariaLabel,
  unitLabel = "postings",
  tone = "accent",
  zeroBased = true,
  formatValue,
  className,
}: {
  buckets: DayBucket[];
  ariaLabel: string;
  unitLabel?: string;
  tone?: Tone;
  /** Counts start the axis at 0; value trends scale to [min,max] for legibility. */
  zeroBased?: boolean;
  /** Tooltip value formatter (defaults to a plain integer). */
  formatValue?: (v: number) => string;
  className?: string;
}) {
  const { drawn, reduce } = useDraw();
  const { ref, active, handlers } = useActiveIndex(buckets.length);
  const n = buckets.length;
  const vals = buckets.map((b) => b.value);
  const maxV = Math.max(...vals, zeroBased ? 1 : -Infinity);
  const minV = zeroBased ? 0 : Math.min(...vals);
  const span = maxV - minV || 1;
  const lo = zeroBased ? 0 : minV - span * 0.12;
  const hi = zeroBased ? maxV : maxV + span * 0.12;
  const range = hi - lo || 1;
  const fmt = formatValue ?? ((v: number) => String(Math.round(v)));

  const X = (i: number) => (n <= 1 ? PAD_X + INNER_W / 2 : PAD_X + (i * INNER_W) / (n - 1));
  const Y = (v: number) => PAD_TOP + INNER_H - ((v - lo) / range) * INNER_H;

  const pts = buckets.map((b, i) => `${X(i)},${Y(b.value)}`);
  const linePath = pts.length ? `M ${pts.join(" L ")}` : "";
  const areaPath = pts.length
    ? `${linePath} L ${X(n - 1)},${BASE_Y} L ${X(0)},${BASE_Y} Z`
    : "";
  const gradId = `area-${tone}`;
  const ax = active === null ? null : active;

  return (
    <div className={cn(TONE_TEXT[tone], className)}>
      <div
        ref={ref}
        className="relative cursor-crosshair touch-pan-y rounded outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        tabIndex={0}
        role="img"
        aria-label={ariaLabel}
        {...handlers}
      >
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          width="100%"
          height={VB_H}
          preserveAspectRatio="none"
          className="overflow-visible"
          aria-hidden
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.22} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
          </defs>

          <line x1={PAD_X} y1={BASE_Y} x2={VB_W - PAD_X} y2={BASE_Y} className="stroke-border" strokeWidth={1} />

          {/* Peak y-reference (Tranche 061) — a dashed gridline at the
              window's maximum so spikes are sizeable at a glance. */}
          {vals.some((v) => v > (zeroBased ? 0 : -Infinity)) ? (
            <line
              x1={PAD_X}
              y1={Y(maxV)}
              x2={VB_W - PAD_X}
              y2={Y(maxV)}
              className="stroke-border"
              strokeWidth={0.75}
              strokeDasharray="3 3"
            />
          ) : null}

          {areaPath ? (
            <path
              d={areaPath}
              fill={`url(#${gradId})`}
              style={{ opacity: drawn ? 1 : 0, transition: reduce ? undefined : "opacity 600ms ease-out" }}
            />
          ) : null}

          {linePath ? (
            <path
              d={linePath}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              pathLength={100}
              style={{
                strokeDasharray: 100,
                strokeDashoffset: drawn ? 0 : 100,
                transition: reduce ? undefined : "stroke-dashoffset 800ms cubic-bezier(0.165,0.84,0.44,1)",
              }}
            />
          ) : null}

          {/* Crosshair + emphasized active point */}
          {ax !== null ? (
            <>
              <line x1={X(ax)} y1={PAD_TOP} x2={X(ax)} y2={BASE_Y} className="stroke-fg-subtle" strokeWidth={1} strokeDasharray="2 2" />
              <circle cx={X(ax)} cy={Y(buckets[ax].value)} r={3.4} className="fill-bg-raised" stroke="currentColor" strokeWidth={2} />
            </>
          ) : null}

          {/* Resting points */}
          {ax === null
            ? buckets.map((b, i) => (
                <circle
                  key={b.key}
                  cx={X(i)}
                  cy={Y(b.value)}
                  r={zeroBased && b.value > 0 ? 2.2 : zeroBased ? 1.3 : 1.6}
                  className={zeroBased && b.value === 0 ? "fill-border" : "fill-current"}
                  style={{ opacity: drawn ? 1 : 0, transition: reduce ? undefined : `opacity 400ms ease-out ${260 + i * 16}ms` }}
                />
              ))
            : null}
        </svg>

        {ax !== null ? (
          <Tooltip xPct={(X(ax) / VB_W) * 100}>
            <div className="font-semibold tabular-nums text-fg-strong">{fmt(buckets[ax].value)}</div>
            <div className="text-fg-muted">
              {buckets[ax].label} · {unitLabel}
            </div>
          </Tooltip>
        ) : null}
      </div>
      <AxisTicks
        buckets={buckets}
        peakLabel={buckets.length > 0 ? `peak ${fmt(maxV)}` : null}
      />
      <span className="sr-only" aria-live="polite">
        {ax !== null ? `${buckets[ax].label}: ${fmt(buckets[ax].value)} ${unitLabel}` : ""}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MovementBars — grouped inbound/outbound bars.
// ---------------------------------------------------------------------------
export function MovementBars({
  buckets,
  ariaLabel,
  className,
}: {
  buckets: FlowDayBucket[];
  ariaLabel: string;
  className?: string;
}) {
  const { drawn, reduce } = useDraw();
  const { ref, active, handlers } = useActiveIndex(buckets.length);
  const n = buckets.length;
  const max = Math.max(1, ...buckets.map((b) => Math.max(b.inbound, b.outbound)));
  const groupW = n > 0 ? INNER_W / n : INNER_W;
  const barW = Math.max(1.5, Math.min(7, (groupW - 2) / 2));
  const ax = active;

  function barStyle(delayMs: number) {
    return {
      transformBox: "fill-box" as const,
      transformOrigin: "bottom" as const,
      transform: drawn ? "scaleY(1)" : "scaleY(0)",
      transition: reduce ? undefined : `transform 600ms cubic-bezier(0.165,0.84,0.44,1) ${delayMs}ms`,
    };
  }
  const groupCenter = (i: number) => PAD_X + i * groupW + groupW / 2;

  return (
    <div className={cn(className)}>
      <div
        ref={ref}
        className="relative cursor-crosshair touch-pan-y rounded outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        tabIndex={0}
        role="img"
        aria-label={ariaLabel}
        {...handlers}
      >
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" height={VB_H} preserveAspectRatio="none" aria-hidden>
          {ax !== null ? (
            <rect x={PAD_X + ax * groupW} y={PAD_TOP} width={groupW} height={INNER_H} className="fill-bg-muted" opacity={0.6} rx={1} />
          ) : null}
          <line x1={PAD_X} y1={BASE_Y} x2={VB_W - PAD_X} y2={BASE_Y} className="stroke-border" strokeWidth={1} />
          {buckets.map((b, i) => {
            const gx = groupCenter(i);
            const inH = (b.inbound / max) * INNER_H;
            const outH = (b.outbound / max) * INNER_H;
            return (
              <g key={b.key}>
                <rect
                  x={gx - barW - 0.75}
                  y={BASE_Y - inH}
                  width={barW}
                  height={Math.max(b.inbound > 0 ? 1 : 0, inH)}
                  rx={1}
                  className="fill-success"
                  style={barStyle(i * 16)}
                />
                <rect
                  x={gx + 0.75}
                  y={BASE_Y - outH}
                  width={barW}
                  height={Math.max(b.outbound > 0 ? 1 : 0, outH)}
                  rx={1}
                  className="fill-fg-subtle"
                  style={barStyle(i * 16 + 50)}
                />
              </g>
            );
          })}
        </svg>

        {ax !== null ? (
          <Tooltip xPct={(groupCenter(ax) / VB_W) * 100}>
            <div className="mb-0.5 font-semibold text-fg-strong">{buckets[ax].label}</div>
            <div className="flex items-center gap-1.5 tabular-nums">
              <span className="dot bg-success" aria-hidden />
              <span className="text-fg-muted">In</span>
              <span className="font-semibold text-fg-strong">{buckets[ax].inbound}</span>
            </div>
            <div className="flex items-center gap-1.5 tabular-nums">
              <span className="dot bg-fg-subtle" aria-hidden />
              <span className="text-fg-muted">Out</span>
              <span className="font-semibold text-fg-strong">{buckets[ax].outbound}</span>
            </div>
          </Tooltip>
        ) : null}
      </div>
      <AxisTicks buckets={buckets} />
      <span className="sr-only" aria-live="polite">
        {ax !== null ? `${buckets[ax].label}: ${buckets[ax].inbound} inbound, ${buckets[ax].outbound} outbound` : ""}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RangeSelector — shared 7 / 14 / 30-day segmented control.
// ---------------------------------------------------------------------------
export function RangeSelector({
  value,
  onChange,
  options = [7, 14, 30],
  className,
}: {
  value: number;
  onChange: (days: number) => void;
  options?: number[];
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Trend range in days"
      className={cn("inline-flex rounded-md border border-border bg-bg-raised p-0.5", className)}
    >
      {options.map((o) => {
        const selected = value === o;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            aria-pressed={selected}
            className={cn(
              "rounded px-2.5 py-1 text-2xs font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
              selected ? "bg-accent text-accent-fg" : "text-fg-muted hover:text-fg-strong",
            )}
          >
            {o}d
          </button>
        );
      })}
    </div>
  );
}
