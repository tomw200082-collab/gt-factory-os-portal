"use client";

// ---------------------------------------------------------------------------
// Forecast version detail — Hero KPI band (edit-chrome polish 2026-05-05).
//
// Owner: W2 Mode B-ForecastMonthly-Redesign (Wave 2 chunks 4 + 5, plan
// §Task 4.1.1).
//
// Sources consulted (2026-05-05 polish):
//   - Linear "How we redesigned the Linear UI" — calm, consistent KPI rails
//     where numbers carry the weight, not the chrome around them.
//   - Inventory Flow InsightsHero (PRODUCTION/window2-portal-sandbox/src/.../
//     InsightsHero.tsx) — established `.kpi-microcard` pattern with tier
//     accent left border + tabular value + uppercase 9px label.
//
// Layout: 5 micro-cards in a horizontal band. Each card has:
//   - 2px tier-coloured left accent (--kpi-accent CSS var)
//   - Large tabular value on top (22px, semibold, tight tracking)
//   - 9px uppercase label below
//   - Small sub-line for context ("units · Jun 2026", "of N active", etc.)
//
// The 5 KPIs (top→down priority):
//   1. Demand next month   — sum of next-bucket forecast (units)
//   2. Items in forecast   — distinct items with at least one line
//   3. Total horizon qty   — 8-week (or N-month) sum across all cells
//   4. Largest item        — name of item with biggest single-bucket cell
//   5. vs prev month       — +/- % delta vs prev published, "—" if none
//
// All numbers render via a local int formatter (kept inline so we don't
// reach into _lib/format.ts which the Grid agent owns).
// ---------------------------------------------------------------------------

import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Crown,
  Layers,
  Package,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

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
  /** Label of the next month for tile 1 / 5 sub-line ("Jun 2026"). */
  nextMonthLabel: string;
  /** Label of the previous month for tile 5 sub-line ("May 2026"), if any. */
  prevMonthLabel: string | null;
  /** Total qty across full horizon (sum of all cells). */
  totalDemandHorizon?: number;
  /** Number of months/weeks in the horizon (for the horizon-sum sub-line). */
  horizonBucketCount?: number;
  /** Name of the highest-quantity item in the next-month bucket, if any. */
  largestItemName?: string | null;
  /** Quantity of the largest item in the next-month bucket. */
  largestItemQty?: number | null;
}

function fmtIntLocal(raw: number | null | undefined): string {
  if (raw === null || raw === undefined) return "—";
  if (!Number.isFinite(raw)) return "—";
  return Math.floor(raw).toLocaleString("en-US");
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
    totalDemandHorizon,
    horizonBucketCount,
    largestItemName,
    largestItemQty,
  } = props;

  // Trend % (positive number = growth, negative = decline). null when no prior.
  const trendPct: number | null =
    totalDemandPrevMonth && totalDemandPrevMonth > 0
      ? ((totalDemandNextMonth - totalDemandPrevMonth) /
          totalDemandPrevMonth) *
        100
      : null;

  const progressTone: KpiTone =
    percentProgress >= 100
      ? "success"
      : percentProgress >= 50
        ? "info"
        : "warning";

  return (
    <div
      className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 fc-kpi-fade-in"
      data-testid="forecast-hero-kpi-band"
    >
      <KpiMicroCard
        label="Demand next month"
        value={fmtIntLocal(totalDemandNextMonth)}
        sub={`units · ${nextMonthLabel}`}
        icon={TrendingUp}
        tone="primary"
      />

      <KpiMicroCard
        label="Items in forecast"
        value={fmtIntLocal(itemsInForecast)}
        sub={
          totalEligibleItems > 0
            ? `of ${totalEligibleItems} active FG`
            : "—"
        }
        icon={Package}
        tone="neutral"
      />

      <KpiMicroCard
        label="Total horizon qty"
        value={fmtIntLocal(totalDemandHorizon ?? 0)}
        sub={
          horizonBucketCount && horizonBucketCount > 0
            ? `units · ${horizonBucketCount} month${horizonBucketCount === 1 ? "" : "s"}`
            : "—"
        }
        icon={Layers}
        tone="info"
      />

      <KpiMicroCard
        label="Largest item"
        value={largestItemQty ? fmtIntLocal(largestItemQty) : "—"}
        sub={largestItemName ?? "no items yet"}
        subTruncate
        icon={Crown}
        tone="warning"
      />

      <KpiMicroCard
        label={trendPct === null ? "Progress" : "vs prev month"}
        value={
          trendPct === null
            ? `${Math.round(percentProgress)}%`
            : `${trendPct >= 0 ? "+" : ""}${trendPct.toFixed(1)}%`
        }
        sub={
          trendPct === null
            ? "cells filled"
            : prevMonthLabel
              ? `${fmtIntLocal(totalDemandPrevMonth ?? 0)} in ${prevMonthLabel}`
              : "no prior published"
        }
        icon={
          trendPct === null
            ? CheckCircle2
            : trendPct >= 0
              ? ArrowUpRight
              : ArrowDownRight
        }
        tone={
          trendPct === null
            ? progressTone
            : trendPct >= 0
              ? "success"
              : "warning"
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single micro-card.
// ---------------------------------------------------------------------------

type KpiTone = "primary" | "neutral" | "info" | "success" | "warning" | "danger";

interface KpiMicroCardProps {
  label: string;
  value: string;
  sub: string;
  icon: LucideIcon;
  tone: KpiTone;
  /** When true, the sub line truncates with ellipsis instead of wrapping. */
  subTruncate?: boolean;
}

const TONE_ACCENT: Record<KpiTone, string> = {
  primary: "var(--accent)",
  neutral: "var(--border-strong)",
  info: "var(--info)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
};

const TONE_VALUE_CLASS: Record<KpiTone, string> = {
  primary: "text-fg-strong",
  neutral: "text-fg-strong",
  info: "text-fg-strong",
  success: "text-success-fg",
  warning: "text-fg-strong",
  danger: "text-danger-fg",
};

function KpiMicroCard({
  label,
  value,
  sub,
  icon: Icon,
  tone,
  subTruncate,
}: KpiMicroCardProps) {
  return (
    <div
      className="fc-kpi-card"
      style={{ ["--kpi-accent" as string]: TONE_ACCENT[tone] } as React.CSSProperties}
      data-testid="forecast-kpi-microcard"
      data-tone={tone}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="fc-kpi-card-label">{label}</span>
        <Icon
          className="h-3 w-3 shrink-0 text-fg-faint"
          strokeWidth={2}
          aria-hidden
        />
      </div>
      <div className={`fc-kpi-card-value ${TONE_VALUE_CLASS[tone]}`}>
        {value}
      </div>
      <div
        className={`fc-kpi-card-sub${subTruncate ? " truncate" : ""}`}
        title={subTruncate ? sub : undefined}
      >
        {sub}
      </div>
    </div>
  );
}
