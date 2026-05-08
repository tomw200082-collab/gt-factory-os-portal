"use client";

// ---------------------------------------------------------------------------
// FeasibilityGauge — large circular SVG gauge for simulation feasibility %.
// Renders a donut ring with an animated fill representing how many components
// are fully covered vs total components needed.
// ---------------------------------------------------------------------------

import { cn } from "@/lib/cn";

interface FeasibilityGaugeProps {
  covered: number;
  partial: number;
  notCovered: number;
  noData: number;
  size?: number;
  className?: string;
}

export function FeasibilityGauge({
  covered,
  partial,
  notCovered,
  noData,
  size = 140,
  className,
}: FeasibilityGaugeProps) {
  const total = covered + partial + notCovered + noData;
  const feasibleFraction = total > 0 ? covered / total : 0;
  const feasiblePct = Math.round(feasibleFraction * 100);

  const r = (size - 16) / 2;
  const circumference = 2 * Math.PI * r;

  // Segment sizes
  const coveredArc = circumference * (total > 0 ? covered / total : 0);
  const partialArc = circumference * (total > 0 ? partial / total : 0);
  const shortArc = circumference * (total > 0 ? notCovered / total : 0);
  const noDataArc = circumference - coveredArc - partialArc - shortArc;

  // Color based on overall feasibility
  const primaryColor =
    feasibleFraction >= 0.9
      ? "hsl(var(--success))"
      : feasibleFraction >= 0.6
        ? "hsl(var(--warning))"
        : "hsl(var(--danger))";

  const label =
    feasibleFraction >= 0.9
      ? "Feasible"
      : feasibleFraction >= 0.6
        ? "Partial"
        : "Blocked";

  const labelClass =
    feasibleFraction >= 0.9
      ? "text-success-fg"
      : feasibleFraction >= 0.6
        ? "text-warning-fg"
        : "text-danger-fg";

  // We draw four arcs: covered (green) → partial (amber) → short (red) → noData (muted)
  // Each arc starts where the previous one ended. Using strokeDasharray + offset.
  // offset at start = rotate(-90deg) places gap at top.
  function arcProps(filledLength: number, offsetLength: number) {
    return {
      strokeDasharray: `${filledLength} ${circumference - filledLength}`,
      strokeDashoffset: -offsetLength,
    };
  }

  const cx = size / 2;
  const cy = size / 2;

  return (
    <div
      className={cn("flex flex-col items-center gap-2", className)}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`Feasibility gauge: ${feasiblePct}% feasible`}
          style={{ transform: "rotate(-90deg)" }}
        >
          {/* Track */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="hsl(var(--border) / 0.3)"
            strokeWidth={10}
          />
          {/* Covered arc (green) */}
          {coveredArc > 0 && (
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="hsl(var(--success))"
              strokeWidth={10}
              strokeLinecap="butt"
              {...arcProps(coveredArc, 0)}
            >
              <title>{covered} unit{covered !== 1 ? "s" : ""} fully covered</title>
            </circle>
          )}
          {/* Partial arc (amber) */}
          {partialArc > 0 && (
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="hsl(var(--warning))"
              strokeWidth={10}
              strokeLinecap="butt"
              {...arcProps(partialArc, coveredArc)}
            >
              <title>{partial} unit{partial !== 1 ? "s" : ""} partially covered</title>
            </circle>
          )}
          {/* Short arc (red) */}
          {shortArc > 0 && (
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="hsl(var(--danger))"
              strokeWidth={10}
              strokeLinecap="butt"
              {...arcProps(shortArc, coveredArc + partialArc)}
            >
              <title>{notCovered} unit{notCovered !== 1 ? "s" : ""} in shortage</title>
            </circle>
          )}
          {/* No-data arc (muted) */}
          {noDataArc > 1 && (
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="hsl(var(--fg-faint) / 0.5)"
              strokeWidth={10}
              strokeLinecap="butt"
              {...arcProps(noDataArc, coveredArc + partialArc + shortArc)}
            >
              <title>{noData} unit{noData !== 1 ? "s" : ""} — no stock data</title>
            </circle>
          )}
        </svg>

        {/* Center label */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ transform: "none" }}
        >
          <span
            className={cn(
              "text-2xl font-bold tabular-nums leading-none",
              labelClass,
            )}
          >
            {feasiblePct}%
          </span>
          <span className={cn("mt-0.5 text-3xs font-semibold uppercase tracking-sops", labelClass)}>
            {label}
          </span>
        </div>
      </div>

      {/* Legend */}
      {total > 0 && (
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-3xs text-fg-muted">
          {covered > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
              {covered} covered
            </span>
          )}
          {partial > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-warning" />
              {partial} partial
            </span>
          )}
          {notCovered > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-danger" />
              {notCovered} short
            </span>
          )}
          {noData > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-fg-faint" />
              {noData} no data
            </span>
          )}
        </div>
      )}
    </div>
  );
}
