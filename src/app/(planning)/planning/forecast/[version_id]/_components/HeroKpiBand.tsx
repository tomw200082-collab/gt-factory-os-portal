"use client";

// ---------------------------------------------------------------------------
// Forecast version detail — Hero KPI band.
//
// Owner: W2 Mode B-ForecastMonthly-Redesign (Wave 2 chunks 4 + 5, plan
// §Task 4.1.1).
//
// Renders 4 KPI tiles in a horizontal band above the grid:
//   1. "Demand next month"  — SUM of next-unfrozen-month bucket (units)
//   2. "Items in forecast"  — distinct items with at least one line ("of N active")
//   3. "Progress"           — percent of cells filled (filled / expected)
//   4. "vs prev month"      — +/- % delta vs prev published version, or "—"
//
// All numbers render via formatInt (no .00000000 trailing-zero leakage).
// English LTR per Tom-locked global standard 2026-05-01.
//
// Visual: 4 tiles with subtle gradient backgrounds (Tailwind tokens reused
// from the design system — bg-gradient-to-br + token soft / softer surfaces),
// large tabular-nums values, lucide icons. Mobile @ 390px collapses to 1 col.
// ---------------------------------------------------------------------------

import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Minus,
  Package,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { formatInt } from "../_lib/format";

interface HeroKpiBandProps {
  /** Total demand in the next-unfrozen month bucket (sum of qty across items). */
  totalDemandNextMonth: number;
  /** Distinct items in the forecast (with at least one forecast_line). */
  itemsInForecast: number;
  /** Total eligible FG items in the system (denominator: "of N active"). */
  totalEligibleItems: number;
  /** Total demand in the previous published month, if comparable. null = no prior. */
  totalDemandPrevMonth: number | null;
  /** Percent of cells filled, 0-100, integer. */
  percentProgress: number;
  /** Label of the next month for tile 1 / 4 sub-line ("Jun 2026"). */
  nextMonthLabel: string;
  /** Label of the previous month for tile 4 sub-line ("May 2026"), if any. */
  prevMonthLabel: string | null;
}

export function HeroKpiBand(props: HeroKpiBandProps) {
  const {
    totalDemandNextMonth,
    itemsInForecast,
    totalEligibleItems,
    totalDemandPrevMonth,
    percentProgress,
    nextMonthLabel,
    prevMonthLabel,
  } = props;

  // Trend % (positive number = growth, negative = decline). null when no prior.
  const trendPct: number | null =
    totalDemandPrevMonth && totalDemandPrevMonth > 0
      ? ((totalDemandNextMonth - totalDemandPrevMonth) / totalDemandPrevMonth) * 100
      : null;

  const progressTone: KpiTone =
    percentProgress >= 100
      ? "success"
      : percentProgress >= 50
        ? "info"
        : "warning";

  return (
    <div
      className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      data-testid="forecast-hero-kpi-band"
    >
      <KpiTile
        label="Demand next month"
        value={formatInt(totalDemandNextMonth)}
        subValue={`units · ${nextMonthLabel}`}
        icon={TrendingUp}
        tone="primary"
      />

      <KpiTile
        label="Items in forecast"
        value={formatInt(itemsInForecast)}
        subValue={
          totalEligibleItems > 0 ? `of ${totalEligibleItems} active FG` : "—"
        }
        icon={Package}
        tone="neutral"
      />

      <KpiTile
        label="Progress"
        value={`${Math.round(percentProgress)}%`}
        subValue="cells filled"
        icon={CheckCircle2}
        tone={progressTone}
      />

      <KpiTile
        label="vs prev month"
        value={
          trendPct === null
            ? "—"
            : `${trendPct >= 0 ? "+" : ""}${trendPct.toFixed(1)}%`
        }
        subValue={
          prevMonthLabel
            ? `${formatInt(totalDemandPrevMonth ?? 0)} in ${prevMonthLabel}`
            : "no prior published"
        }
        icon={
          trendPct === null
            ? Minus
            : trendPct >= 0
              ? ArrowUpRight
              : ArrowDownRight
        }
        tone={
          trendPct === null
            ? "neutral"
            : trendPct >= 0
              ? "success"
              : "warning"
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single tile.
// ---------------------------------------------------------------------------

type KpiTone = "primary" | "neutral" | "info" | "success" | "warning" | "danger";

interface KpiTileProps {
  label: string;
  value: string;
  subValue: string;
  icon: LucideIcon;
  tone: KpiTone;
}

const TONE_TILE_CLASSES: Record<KpiTone, { gradient: string; iconBg: string; icon: string; ring: string }> = {
  primary: {
    gradient: "from-accent-soft/40 via-bg-raised to-bg-raised",
    iconBg: "bg-accent-soft",
    icon: "text-accent",
    ring: "border-accent/30",
  },
  neutral: {
    gradient: "from-bg-raised via-bg-raised to-bg-subtle/40",
    iconBg: "bg-bg-subtle",
    icon: "text-fg-muted",
    ring: "border-border/70",
  },
  info: {
    gradient: "from-info-softer/40 via-bg-raised to-bg-raised",
    iconBg: "bg-info-softer",
    icon: "text-info-fg",
    ring: "border-info/30",
  },
  success: {
    gradient: "from-success-softer/40 via-bg-raised to-bg-raised",
    iconBg: "bg-success-softer",
    icon: "text-success-fg",
    ring: "border-success/30",
  },
  warning: {
    gradient: "from-warning-softer/40 via-bg-raised to-bg-raised",
    iconBg: "bg-warning-softer",
    icon: "text-warning-fg",
    ring: "border-warning/30",
  },
  danger: {
    gradient: "from-danger-softer/40 via-bg-raised to-bg-raised",
    iconBg: "bg-danger-softer",
    icon: "text-danger-fg",
    ring: "border-danger/30",
  },
};

function KpiTile({ label, value, subValue, icon: Icon, tone }: KpiTileProps) {
  const c = TONE_TILE_CLASSES[tone];
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border bg-gradient-to-br p-4 transition-colors duration-150 hover:border-border-strong",
        c.gradient,
        c.ring,
      )}
      data-testid="forecast-kpi-tile"
      data-tone={tone}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-3xs font-semibold uppercase tracking-sops text-fg-muted">
            {label}
          </div>
          <div className="mt-1.5 text-3xl font-bold tabular-nums tracking-tight text-fg-strong">
            {value}
          </div>
          <div className="mt-0.5 text-2xs text-fg-muted">{subValue}</div>
        </div>
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/40",
            c.iconBg,
          )}
          aria-hidden
        >
          <Icon className={cn("h-4 w-4", c.icon)} strokeWidth={2} />
        </div>
      </div>
    </div>
  );
}
