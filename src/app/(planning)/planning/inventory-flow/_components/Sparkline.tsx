"use client";

// ---------------------------------------------------------------------------
// Sparkline — inline 14-day SVG trajectory of projected on-hand for a single
// item row. Pure SVG; no external charting library.
//
// Polish 2026-05-05 (grid body pass):
//   - Area gradient fill below the line (12% → 0% alpha) — mountain-chart
//     aesthetic per modern data-viz convention (Stripe, Vercel, Linear).
//   - Today's point highlighted with a small filled circle in tier color
//     so Tom can orient where "now" is in the trajectory.
//   - Stockout dot is now 3px (was 1.75px) with a stronger white outline
//     for contrast against the red bg.
//   - Hover: scales the entire SVG to 1.06 with a drop-shadow (via
//     .sparkline-hover-scale CSS class).
//
// Visual:
//   - 64×18 svg (default), stroke-width 1.5, stroke-linecap round
//   - Stroke colored by row's overall risk_tier (mapped to tier-bg tokens)
//   - Soft baseline gridline at y=0 (the stockout threshold) so the eye can
//     measure how far above zero the trajectory is
//   - Single circle marker on the first day where the projection dips < 0
//     (projected stockout point), colored critical_stockout-bg
//   - aria-label summarizing the trajectory for assistive tech
//
// Memoized via React.memo because Inventory Flow renders ~68 of these.
// ---------------------------------------------------------------------------

import { memo, useId } from "react";
import { cn } from "@/lib/cn";
import type { FlowDay, RiskTier } from "../_lib/types";

interface SparklineProps {
  days: FlowDay[];
  riskTier: RiskTier;
  width?: number;
  height?: number;
  className?: string;
}

const TIER_STROKE_VAR: Record<RiskTier, string> = {
  stockout: "var(--tier-critical-bg)",
  critical: "var(--tier-at-risk-bg)",
  watch: "var(--tier-low-bg)",
  healthy: "var(--tier-healthy-bg)",
};

function SparklineInner({
  days,
  riskTier,
  width = 64,
  height = 18,
  className,
}: SparklineProps) {
  const gradientId = useId().replace(/:/g, "-");

  if (days.length === 0) {
    return (
      <svg
        width={width}
        height={height}
        className={className}
        aria-hidden
      />
    );
  }

  // Use the production-aware EOD as the trajectory.
  const values = days.map((d) => d.projected_on_hand_eod_with_production);
  const padX = 1;
  const padY = 2;
  const innerW = Math.max(1, width - padX * 2);
  const innerH = Math.max(1, height - padY * 2);

  const minV = Math.min(0, ...values);
  const maxV = Math.max(1, ...values);
  const span = Math.max(1, maxV - minV);

  const xFor = (i: number) =>
    padX + (i * innerW) / Math.max(1, values.length - 1);
  const yFor = (v: number) =>
    padY + innerH - ((v - minV) / span) * innerH;

  const linePoints = values.map((v, i) => `${xFor(i).toFixed(2)},${yFor(v).toFixed(2)}`);
  const path = linePoints
    .map((pt, i) => `${i === 0 ? "M" : "L"}${pt}`)
    .join(" ");

  // Area path = line path closed at the bottom of the chart.
  const yBottom = (height - padY).toFixed(2);
  const firstX = xFor(0).toFixed(2);
  const lastX = xFor(values.length - 1).toFixed(2);
  const areaPath = `${path} L${lastX},${yBottom} L${firstX},${yBottom} Z`;

  // Stockout dot: first day where the projection dips below 0.
  const stockoutIdx = values.findIndex((v) => v < 0);

  // Today's point — index 0 in the visible window.
  const todayIdx = 0;

  // Baseline (y=0) only meaningful when min < 0 or values straddle 0.
  const showBaseline = minV < 0;
  const yZero = yFor(0);

  const stroke = TIER_STROKE_VAR[riskTier];

  // aria summary
  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  const direction = last > first ? "trending up" : last < first ? "trending down" : "flat";
  const ariaLabel =
    stockoutIdx >= 0
      ? `14-day trajectory ${direction}; projected stockout day ${stockoutIdx + 1}`
      : `14-day trajectory ${direction}; no stockout in window`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("shrink-0 sparkline-hover-scale", className)}
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <linearGradient
          id={`sparkline-area-${gradientId}`}
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop offset="0%" stopColor={`hsl(${stroke})`} stopOpacity={0.18} />
          <stop offset="100%" stopColor={`hsl(${stroke})`} stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Area fill underneath the line — mountain-chart aesthetic. */}
      <path d={areaPath} fill={`url(#sparkline-area-${gradientId})`} />

      {showBaseline ? (
        <line
          x1={padX}
          y1={yZero}
          x2={width - padX}
          y2={yZero}
          stroke="hsl(var(--border))"
          strokeWidth={0.75}
          strokeDasharray="2 2"
          opacity={0.6}
        />
      ) : null}

      {/* Trend line. */}
      <path
        d={path}
        fill="none"
        stroke={`hsl(${stroke})`}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="sparkline-path"
        pathLength={100}
      />

      {/* Today's point — small filled circle in tier color so the eye can
          orient where "now" is on the trend. Drawn under the stockout dot
          so a same-day stockout still wins the visual fight. */}
      {todayIdx < values.length ? (
        <circle
          cx={xFor(todayIdx)}
          cy={yFor(values[todayIdx]!)}
          r={1.5}
          fill={`hsl(${stroke})`}
          stroke="hsl(var(--bg-raised))"
          strokeWidth={0.6}
        />
      ) : null}

      {/* Stockout dot — louder than v1 (3px + white ring) so it pops
          against the red cell bg even at thumbnail size. */}
      {stockoutIdx >= 0 ? (
        <>
          <circle
            cx={xFor(stockoutIdx)}
            cy={yFor(values[stockoutIdx]!)}
            r={3}
            fill="hsl(var(--bg-raised))"
            opacity={0.85}
          />
          <circle
            cx={xFor(stockoutIdx)}
            cy={yFor(values[stockoutIdx]!)}
            r={2.25}
            fill="hsl(var(--tier-critical-bg))"
            stroke="hsl(var(--bg-raised))"
            strokeWidth={0.85}
          />
        </>
      ) : null}
    </svg>
  );
}

export const Sparkline = memo(SparklineInner);
