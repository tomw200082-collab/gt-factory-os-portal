"use client";

// ---------------------------------------------------------------------------
// InsightsHero — 2-banner actionable hero for the Inventory Flow page.
//
// Replaces the legacy 4-tile HeroBar (Operational Clarity redesign 2026-05-04).
//
// Computed client-side from FlowItem[]:
//   Line 1 (red):  Items that stockout in the next 7 days
//                  (cell_tier_with_production === 'critical_stockout' on
//                   any of days[0..6]).
//   Line 2 (amber): Items below 1-week cover that are NOT already stocking-
//                  out (days_cover_with_production < 7 and not stockout).
//
// Below the banners: a thin sub-row of original 4 stats as small chips:
//   "41 at risk · stockout today · 0 open orders · 7 exceptions"
//
// Empty banners are hidden (no awkward "0 items stockout" line).
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtDaysFromNow } from "../_lib/format";
import type { FlowItem, FlowSummary } from "../_lib/types";

interface InsightsHeroProps {
  items: FlowItem[];
  summary: FlowSummary | null;
  isLoading?: boolean;
}

interface BannerItem {
  item_id: string;
  item_name: string;
  /** Pretty short label for parenthetical context, e.g. "Wed". */
  context: string;
}

// Server-locked horizon for "no stockout" sentinel.
const HORIZON_DAYS = 56;

export function InsightsHero({ items, summary, isLoading }: InsightsHeroProps) {
  const stockoutThisWeek = useMemo<BannerItem[]>(() => {
    if (!items?.length) return [];
    const out: BannerItem[] = [];
    const seen = new Set<string>();
    for (const it of items) {
      // Look at days[0..6]
      const window = it.days.slice(0, 7);
      for (const d of window) {
        const tier = d.cell_tier_with_production ?? null;
        const isStockoutToday =
          tier === "critical_stockout" ||
          (tier == null && d.tier === "stockout");
        if (isStockoutToday) {
          if (!seen.has(it.item_id)) {
            seen.add(it.item_id);
            out.push({
              item_id: it.item_id,
              item_name: it.item_name,
              context: shortWeekday(d.day),
            });
          }
          break;
        }
      }
    }
    return out;
  }, [items]);

  const belowWeekCover = useMemo<BannerItem[]>(() => {
    if (!items?.length) return [];
    const stockoutIds = new Set(stockoutThisWeek.map((x) => x.item_id));
    const out: BannerItem[] = [];
    for (const it of items) {
      if (stockoutIds.has(it.item_id)) continue;
      const cover =
        it.days_cover_with_production != null
          ? it.days_cover_with_production
          : it.days_of_cover;
      if (cover != null && Number.isFinite(cover) && cover >= 0 && cover < 7) {
        // Skip "covered for full horizon" sentinel (server returns horizon
        // length when nothing stocks out — defensive guard).
        if (cover >= HORIZON_DAYS) continue;
        out.push({
          item_id: it.item_id,
          item_name: it.item_name,
          context: "",
        });
      }
    }
    return out;
  }, [items, stockoutThisWeek]);

  const showSubRow = !!summary && !isLoading;

  return (
    <div className="space-y-2 animate-fade-in">
      {/* Reserve space during loading — no layout shift. */}
      {isLoading ? (
        <div className="h-12 w-full animate-pulse rounded-md border border-border/40 bg-bg-muted/40" />
      ) : (
        <>
          {stockoutThisWeek.length > 0 ? (
            <Banner
              tone="danger"
              icon="🔴"
              headline={`${stockoutThisWeek.length} ${
                stockoutThisWeek.length === 1 ? "item" : "items"
              } stockout this week`}
              items={stockoutThisWeek}
              cta={{
                label: "Plan production",
                href: "/planning/production-plan",
              }}
              testid="insights-banner-stockout"
            />
          ) : null}

          {belowWeekCover.length > 0 ? (
            <Banner
              tone="warning"
              icon="🟡"
              headline={`${belowWeekCover.length} ${
                belowWeekCover.length === 1 ? "item" : "items"
              } below 1-week cover`}
              items={belowWeekCover}
              cta={{ label: "Review", href: "?at_risk_only=true" }}
              testid="insights-banner-watch"
            />
          ) : null}

          {stockoutThisWeek.length === 0 && belowWeekCover.length === 0 ? (
            <Banner
              tone="success"
              icon="✓"
              headline="No items stocking out in the next 7 days"
              items={[]}
              testid="insights-banner-allclear"
            />
          ) : null}
        </>
      )}

      {/* Sub-row: original 4 stats demoted to small chips. */}
      {showSubRow ? (
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pt-1 text-[11px] uppercase tracking-sops text-fg-muted"
          data-testid="insights-subrow"
        >
          <SubChip
            label="at risk"
            value={summary!.at_risk_count.toString()}
            tone={summary!.at_risk_count > 0 ? "danger" : "neutral"}
          />
          <span className="text-fg-faint">·</span>
          <SubChip
            label="earliest stockout"
            value={
              summary!.earliest_stockout
                ? fmtDaysFromNow(summary!.earliest_stockout.date)
                : "none"
            }
            tone={summary!.earliest_stockout ? "danger" : "neutral"}
          />
          <span className="text-fg-faint">·</span>
          <SubChip
            label="open orders"
            value={summary!.open_orders_count.toString()}
            tone="neutral"
          />
          <span className="text-fg-faint">·</span>
          <SubChip
            label="exceptions"
            value={summary!.exceptions_count.toString()}
            tone={summary!.exceptions_count > 0 ? "warning" : "neutral"}
          />
        </div>
      ) : null}
    </div>
  );
}

interface BannerProps {
  tone: "danger" | "warning" | "success";
  icon: string;
  headline: string;
  items: BannerItem[];
  cta?: { label: string; href: string };
  testid?: string;
}

function Banner({ tone, icon, headline, items, cta, testid }: BannerProps) {
  const toneClasses =
    tone === "danger"
      ? "border-danger/30 bg-danger-softer/80 text-danger-fg"
      : tone === "warning"
        ? "border-warning/30 bg-warning-softer/80 text-warning-fg"
        : "border-success/30 bg-success-softer/60 text-success-fg";

  const ctaToneClasses =
    tone === "danger"
      ? "bg-danger text-fg-inverted hover:bg-danger/90"
      : tone === "warning"
        ? "border border-warning/60 bg-warning-soft text-warning-fg hover:bg-warning-soft/80"
        : "";

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md border px-4 py-2.5",
        toneClasses,
      )}
      data-testid={testid}
    >
      <span aria-hidden className="text-base leading-none">
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 items-baseline gap-3">
        <span className="text-sm font-semibold tabular-nums">{headline}</span>
        {items.length > 0 ? (
          <>
            <span aria-hidden className="text-fg-faint">
              →
            </span>
            <span className="min-w-0 truncate text-xs text-fg-muted">
              {items
                .slice(0, 6)
                .map((it) => (it.context ? `${it.item_name} (${it.context})` : it.item_name))
                .join(" · ")}
              {items.length > 6 ? ` +${items.length - 6} more` : ""}
            </span>
          </>
        ) : null}
      </div>
      {cta ? (
        <Link
          href={cta.href}
          className={cn(
            "ml-auto inline-flex shrink-0 items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold transition-colors",
            ctaToneClasses,
          )}
        >
          {cta.label}
          <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
        </Link>
      ) : null}
    </div>
  );
}

interface SubChipProps {
  label: string;
  value: string;
  tone: "neutral" | "warning" | "danger";
}

function SubChip({ label, value, tone }: SubChipProps) {
  const valueClass =
    tone === "danger"
      ? "text-danger-fg"
      : tone === "warning"
        ? "text-warning-fg"
        : "text-fg-strong";
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span
        className={cn(
          "text-xs font-semibold normal-case tabular-nums",
          valueClass,
        )}
      >
        {value}
      </span>
      <span className="text-[11px]">{label}</span>
    </span>
  );
}

function shortWeekday(iso: string): string {
  try {
    const d = new Date(`${iso}T00:00:00`);
    return d.toLocaleDateString("en-US", { weekday: "short" });
  } catch {
    return "";
  }
}
