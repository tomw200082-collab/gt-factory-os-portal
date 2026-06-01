// ---------------------------------------------------------------------------
// TrendChart — dependency-free SVG visualisations for the dashboard trend band.
//
// Two presentational components share this file:
//   - <TrendAreaChart>  — single-series area+line (production activity).
//   - <MovementBars>    — grouped inbound/outbound bars (stock movement flow).
//
// Both are theme-aware (colour flows through `currentColor` + design tokens),
// scale fluidly via a viewBox (width:100%), draw in on mount, and expose an
// accessible summary plus per-point native `<title>` tooltips. Motion is gated
// behind `prefers-reduced-motion`: when the user prefers reduced motion the
// charts paint in their final state with no transition. They own no data — the
// page derives the buckets.
// ---------------------------------------------------------------------------
"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { DayBucket, FlowDayBucket } from "../_lib/trends";

// Shared viewBox geometry. Rendered responsively (width:100%, fixed aspect).
const VB_W = 320;
const VB_H = 96;
const PAD_X = 6;
const PAD_TOP = 10;
const PAD_BOTTOM = 16; // room for the sparse x-axis tick labels

// Returns whether the draw-in should have happened, plus whether motion is
// reduced. On reduced motion we flip `drawn` immediately and callers skip the
// transition, so the chart snaps to its final state with no animation.
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

// First / last tick labels only — keeps the axis legible at card width.
function AxisTicks({ buckets }: { buckets: { label: string }[] }) {
  if (buckets.length === 0) return null;
  const first = buckets[0]?.label;
  const last = buckets[buckets.length - 1]?.label;
  return (
    <div className="mt-1 flex justify-between text-3xs tabular-nums text-fg-faint">
      <span>{first}</span>
      <span>{last}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TrendAreaChart — single series.
// ---------------------------------------------------------------------------
export function TrendAreaChart({
  buckets,
  ariaLabel,
  unitLabel = "postings",
  className,
}: {
  buckets: DayBucket[];
  ariaLabel: string;
  /** Word used in per-point tooltips, e.g. "postings". */
  unitLabel?: string;
  className?: string;
}) {
  const { drawn, reduce } = useDraw();
  const n = buckets.length;
  const max = Math.max(1, ...buckets.map((b) => b.value));
  const innerW = VB_W - PAD_X * 2;
  const innerH = VB_H - PAD_TOP - PAD_BOTTOM;
  const baseY = VB_H - PAD_BOTTOM;

  const x = (i: number) => (n <= 1 ? PAD_X + innerW / 2 : PAD_X + (i * innerW) / (n - 1));
  const y = (v: number) => PAD_TOP + innerH - (v / max) * innerH;

  const linePts = buckets.map((b, i) => `${x(i)},${y(b.value)}`);
  const linePath = linePts.length ? `M ${linePts.join(" L ")}` : "";
  const areaPath = linePts.length
    ? `${linePath} L ${x(n - 1)},${baseY} L ${x(0)},${baseY} Z`
    : "";

  const gradId = "trendArea";

  return (
    <div className={cn("text-accent", className)}>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        height={VB_H}
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
        className="overflow-visible"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity={0.22} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Baseline */}
        <line
          x1={PAD_X}
          y1={baseY}
          x2={VB_W - PAD_X}
          y2={baseY}
          className="stroke-border"
          strokeWidth={1}
        />

        {/* Area fill — fades in. */}
        {areaPath ? (
          <path
            d={areaPath}
            fill={`url(#${gradId})`}
            style={{
              opacity: drawn ? 1 : 0,
              transition: reduce ? undefined : "opacity 600ms ease-out",
            }}
          />
        ) : null}

        {/* Line — draws in left-to-right via dashoffset. */}
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
              transition: reduce
                ? undefined
                : "stroke-dashoffset 800ms cubic-bezier(0.165,0.84,0.44,1)",
            }}
          />
        ) : null}

        {/* Points — accessible native tooltips. */}
        {buckets.map((b, i) => (
          <circle
            key={b.key}
            cx={x(i)}
            cy={y(b.value)}
            r={b.value > 0 ? 2.4 : 1.4}
            className={b.value > 0 ? "fill-accent" : "fill-border"}
            style={{
              opacity: drawn ? 1 : 0,
              transition: reduce ? undefined : `opacity 400ms ease-out ${300 + i * 20}ms`,
            }}
          >
            <title>{`${b.label}: ${b.value} ${unitLabel}`}</title>
          </circle>
        ))}
      </svg>
      <AxisTicks buckets={buckets} />
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
  const n = buckets.length;
  const max = Math.max(1, ...buckets.map((b) => Math.max(b.inbound, b.outbound)));
  const innerW = VB_W - PAD_X * 2;
  const innerH = VB_H - PAD_TOP - PAD_BOTTOM;
  const baseY = VB_H - PAD_BOTTOM;

  const groupW = n > 0 ? innerW / n : innerW;
  const barW = Math.max(1.5, Math.min(7, (groupW - 2) / 2));

  function barStyle(delayMs: number) {
    return {
      transformBox: "fill-box" as const,
      transformOrigin: "bottom" as const,
      transform: drawn ? "scaleY(1)" : "scaleY(0)",
      transition: reduce
        ? undefined
        : `transform 600ms cubic-bezier(0.165,0.84,0.44,1) ${delayMs}ms`,
    };
  }

  return (
    <div className={cn(className)}>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        height={VB_H}
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
      >
        <line
          x1={PAD_X}
          y1={baseY}
          x2={VB_W - PAD_X}
          y2={baseY}
          className="stroke-border"
          strokeWidth={1}
        />
        {buckets.map((b, i) => {
          const gx = PAD_X + i * groupW + groupW / 2;
          const inH = (b.inbound / max) * innerH;
          const outH = (b.outbound / max) * innerH;
          const inX = gx - barW - 0.75;
          const outX = gx + 0.75;
          return (
            <g key={b.key}>
              <rect
                x={inX}
                y={baseY - inH}
                width={barW}
                height={Math.max(b.inbound > 0 ? 1 : 0, inH)}
                rx={1}
                className="fill-success"
                style={barStyle(i * 18)}
              >
                <title>{`${b.label}: ${b.inbound} inbound`}</title>
              </rect>
              <rect
                x={outX}
                y={baseY - outH}
                width={barW}
                height={Math.max(b.outbound > 0 ? 1 : 0, outH)}
                rx={1}
                className="fill-fg-subtle"
                style={barStyle(i * 18 + 60)}
              >
                <title>{`${b.label}: ${b.outbound} outbound`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
      <AxisTicks buckets={buckets} />
    </div>
  );
}
