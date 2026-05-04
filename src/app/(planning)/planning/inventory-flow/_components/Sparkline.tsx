"use client";

// ---------------------------------------------------------------------------
// Sparkline — inline 14-day SVG trajectory of projected on-hand for a single
// item row. Pure SVG; no external charting library.
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

import { memo } from "react";
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

  const path = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(2)},${yFor(v).toFixed(2)}`)
    .join(" ");

  // Stockout dot: first day where the projection dips below 0.
  const stockoutIdx = values.findIndex((v) => v < 0);

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
      className={cn("shrink-0", className)}
      role="img"
      aria-label={ariaLabel}
    >
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
      {stockoutIdx >= 0 ? (
        <circle
          cx={xFor(stockoutIdx)}
          cy={yFor(values[stockoutIdx]!)}
          r={1.75}
          fill="hsl(var(--tier-critical-bg))"
          stroke="hsl(var(--bg-raised))"
          strokeWidth={0.75}
        />
      ) : null}
    </svg>
  );
}

export const Sparkline = memo(SparklineInner);
