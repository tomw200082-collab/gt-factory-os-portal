"use client";

// ---------------------------------------------------------------------------
// InsightsHero — actionable hero for the Inventory Flow page.
//
// Top-region polish (2026-05-05): senior UX/UI pass to lift the banner from
// "flat row" to a Linear / Bloomberg-Terminal grade hero. Tom mandate:
// "מהממים" — stunning refinements.
//
// Design references (research consulted 2026-05-05):
//   - Refactoring UI (Wathan/Schoger): hierarchy via size + color + weight,
//     not size alone; tertiary actions should feel like links; design in
//     grayscale first.
//   - Linear redesign notes: simplify headers, group filters with the
//     primary action; stop "loud" badges from competing with content.
//   - Nielsen Norman Group: critical info displayed prominently; visual
//     grouping by proximity; avoid alert fatigue (one banner at a time).
//
// Hierarchy applied (top → bottom, biggest → smallest):
//   1. Big display number (28-32px) "5" of "stockout this week"
//   2. Item-name chips with family-color tint (operator scans by family)
//   3. Tertiary CTA ("Plan production →") with hover micro-motion
//   4. Sub-stats row of micro-cards with tier-coloured left accents
//
// Computed client-side from FlowItem[]:
//   stockoutThisWeek: items whose cell_tier_with_production==='critical_stockout'
//                     on any of days[0..6]
//   belowWeekCover : items with days_cover_with_production < 7 that are NOT
//                     already stocking out
//
// Empty banners are hidden. When BOTH are empty we render a restrained
// "All clear" success state with the next-stockout countdown.
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import Link from "next/link";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtDaysFromNow, fmtAgo } from "../_lib/format";
import { familyAccent } from "../_lib/family";
import type { FlowItem, FlowSummary } from "../_lib/types";

interface InsightsHeroProps {
  items: FlowItem[];
  summary: FlowSummary | null;
  isLoading?: boolean;
  /** ISO timestamp of the projection's `as_of` field — surfaced in the
   *  compact "as of" chip on the right edge of the sub-stats row. */
  asOf?: string | null;
}

interface BannerItem {
  item_id: string;
  item_name: string;
  family: string | null;
  /** Pretty short label for parenthetical context, e.g. "Wed". */
  context: string;
}

// Server-locked horizon for "no stockout" sentinel.
const HORIZON_DAYS = 56;

export function InsightsHero({
  items,
  summary,
  isLoading,
  asOf,
}: InsightsHeroProps) {
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
              family: it.family,
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
        if (cover >= HORIZON_DAYS) continue;
        out.push({
          item_id: it.item_id,
          item_name: it.item_name,
          family: it.family,
          context: "",
        });
      }
    }
    return out;
  }, [items, stockoutThisWeek]);

  const showSubRow = !!summary && !isLoading;
  const allClear =
    !isLoading && stockoutThisWeek.length === 0 && belowWeekCover.length === 0;

  return (
    <div className="space-y-2">
      {isLoading ? (
        <div className="h-20 w-full animate-pulse rounded-md border border-border/40 bg-bg-muted/40" />
      ) : (
        <>
          {stockoutThisWeek.length > 0 ? (
            <Banner
              tone="danger"
              count={stockoutThisWeek.length}
              countLabel="stockout this week"
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
              count={belowWeekCover.length}
              countLabel="below 1-week cover"
              items={belowWeekCover}
              cta={{ label: "Review", href: "?at_risk_only=true" }}
              animationDelayClass={
                stockoutThisWeek.length > 0
                  ? "insights-banner-delay-1"
                  : undefined
              }
              testid="insights-banner-watch"
            />
          ) : null}

          {allClear ? (
            <AllClearBanner
              earliestStockout={summary?.earliest_stockout ?? null}
            />
          ) : null}
        </>
      )}

      {/* Sub-row: micro-cards with tier-coloured left accent. */}
      {showSubRow ? (
        <div
          className="flex flex-wrap items-center gap-1.5 pt-1"
          data-testid="insights-subrow"
        >
          <KpiMicroCard
            label="At risk"
            value={summary!.at_risk_count.toString()}
            tone={summary!.at_risk_count > 0 ? "danger" : "neutral"}
          />
          <KpiMicroCard
            label="Earliest stockout"
            value={
              summary!.earliest_stockout
                ? fmtDaysFromNow(summary!.earliest_stockout.date)
                : "none"
            }
            tone={summary!.earliest_stockout ? "danger" : "neutral"}
          />
          <KpiMicroCard
            label="Open orders"
            value={summary!.open_orders_count.toString()}
            tone="neutral"
          />
          <KpiMicroCard
            label="Exceptions"
            value={summary!.exceptions_count.toString()}
            tone={summary!.exceptions_count > 0 ? "warning" : "neutral"}
          />

          {/* "as of" chip pushed to the right edge. FLOW-M09: hidden on
              phones — it wraps to an unpredictable position there, and the
              WorkflowHeader's FreshnessBadge already carries freshness. */}
          {asOf ? (
            <span
              className="ml-auto max-sm:hidden"
              title={`Projection computed at ${asOf}`}
            >
              <span className="asof-chip">
                <Clock className="h-2.5 w-2.5" strokeWidth={2} />
                <span className="uppercase tracking-sops">as of</span>
                <span className="font-medium tabular-nums normal-case text-fg">
                  {fmtAgo(asOf)}
                </span>
              </span>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Banner: red (critical) / amber (warning).
//
// Layout (left → right):
//   icon  |  HERO COUNT (32px display)  •  countLabel  |  item chips  |  cta
//
// Item chips wrap to a second line on narrow viewports. Each chip carries
// a faint family-color tint so the operator scans by product family.
// ---------------------------------------------------------------------------

interface BannerProps {
  tone: "danger" | "warning";
  count: number;
  countLabel: string;
  items: BannerItem[];
  cta?: { label: string; href: string };
  animationDelayClass?: string;
  testid?: string;
}

function Banner({
  tone,
  count,
  countLabel,
  items,
  cta,
  animationDelayClass,
  testid,
}: BannerProps) {
  const ruleClass =
    tone === "danger"
      ? "border-l-[3px] border-l-danger"
      : "border-l-[3px] border-l-warning";

  const heroCountClass =
    tone === "danger" ? "text-danger-fg" : "text-warning-fg";

  // Tertiary-prominent CTA: outline + soft tinted bg with a darker text tone
  // (Refactoring UI: tertiary actions should be discoverable but not flood
  // the banner with brand chrome).
  const ctaToneClasses =
    tone === "danger"
      ? "border border-danger/40 bg-danger-soft text-danger-fg hover:bg-danger-soft/80 hover:border-danger/60"
      : "border border-warning/40 bg-warning-soft text-warning-fg hover:bg-warning-soft/80 hover:border-warning/60";

  const Icon = tone === "danger" ? AlertOctagon : AlertTriangle;
  const iconColor =
    tone === "danger" ? "text-danger" : "text-warning";

  return (
    <div
      className={cn(
        "relative flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-border/40 bg-bg-raised px-4 py-3 shadow-raised animate-insights-banner cta-arrow-host",
        ruleClass,
        animationDelayClass,
      )}
      data-testid={testid}
    >
      {/* Icon */}
      <Icon
        className={cn("h-4 w-4 shrink-0", iconColor)}
        strokeWidth={2}
        aria-hidden
      />

      {/* Hero count + label (inline-flex so they share a baseline) */}
      <div className="flex shrink-0 items-baseline gap-2">
        <span
          className={cn(
            "text-[28px] leading-none font-semibold tabular-nums tracking-tight",
            heroCountClass,
          )}
        >
          {count}
        </span>
        <span className="text-[10px] uppercase tracking-sops font-semibold text-fg-muted">
          {countLabel}
        </span>
      </div>

      {/* Item chips with family-color tint */}
      {items.length > 0 ? (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {items.slice(0, 6).map((it) => (
            <span
              key={it.item_id}
              className="family-chip-tinted inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums"
              style={
                {
                  ["--chip-tint" as string]: familyVarFor(it.family),
                } as React.CSSProperties
              }
              title={it.family ?? undefined}
            >
              <span className="truncate max-w-[16ch]">{it.item_name}</span>
              {it.context ? (
                <span className="text-fg-muted">({it.context})</span>
              ) : null}
            </span>
          ))}
          {items.length > 6 ? (
            <span className="text-[11px] text-fg-muted">
              +{items.length - 6} more
            </span>
          ) : null}
        </div>
      ) : null}

      {/* CTA */}
      {cta ? (
        <Link
          href={cta.href}
          // FLOW-M08: on phones the CTA takes its own full-width line right
          // below the count/chips it refers to (basis-full); sm+ keeps the
          // original right-aligned inline placement (sm:ml-auto).
          className={cn(
            "inline-flex min-h-[32px] shrink-0 basis-full items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:ml-auto sm:basis-auto",
            ctaToneClasses,
          )}
        >
          {cta.label}
          <ArrowRight
            className="cta-arrow h-3 w-3"
            strokeWidth={2.5}
            aria-hidden
          />
        </Link>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// All-clear banner — restrained celebration.
// Don't apologize; don't shout. A small green check, "All clear",
// and a tiny sub-line with the next-stockout countdown when known.
// ---------------------------------------------------------------------------

interface AllClearBannerProps {
  earliestStockout: FlowSummary["earliest_stockout"];
}

function AllClearBanner({ earliestStockout }: AllClearBannerProps) {
  return (
    <div
      className="flex items-center gap-3 rounded-md border border-border/40 border-l-[3px] border-l-success bg-bg-raised px-4 py-2.5 shadow-raised animate-insights-banner"
      data-testid="insights-banner-allclear"
    >
      <CheckCircle2
        className="h-4 w-4 shrink-0 text-success"
        strokeWidth={2}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 items-baseline gap-3">
        <span className="text-sm font-semibold text-success-fg">
          All clear
        </span>
        <span className="text-xs text-fg-muted">
          No items stocking out in the next 7 days
        </span>
      </div>
      {earliestStockout ? (
        <span
          className="ml-auto inline-flex items-baseline gap-1 text-[11px] text-fg-muted"
          title={`${earliestStockout.item_name} on ${earliestStockout.date}`}
        >
          <span className="uppercase tracking-sops text-fg-faint">
            next stockout
          </span>
          <span className="font-medium tabular-nums text-fg">
            {fmtDaysFromNow(earliestStockout.date)}
          </span>
        </span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI micro-card — replaces the bullet-separated inline stats with visually
// grouped pills, each carrying a tier-coloured left accent.
//
// Refactoring UI: separate primary + secondary actions; let color do the
// hierarchy work, not just font size.
// ---------------------------------------------------------------------------

interface KpiMicroCardProps {
  label: string;
  value: string;
  tone: "neutral" | "warning" | "danger";
}

function KpiMicroCard({ label, value, tone }: KpiMicroCardProps) {
  const accentVar =
    tone === "danger"
      ? "var(--danger)"
      : tone === "warning"
        ? "var(--warning)"
        : "var(--border-strong)";

  const valueClass =
    tone === "danger"
      ? "text-danger-fg"
      : tone === "warning"
        ? "text-warning-fg"
        : "text-fg-strong";

  return (
    <span
      className="kpi-microcard"
      style={{ ["--kpi-accent" as string]: accentVar } as React.CSSProperties}
    >
      <span
        className={cn(
          "text-[13px] font-semibold tabular-nums leading-none",
          valueClass,
        )}
      >
        {value}
      </span>
      <span className="text-[9px] uppercase tracking-sops font-semibold leading-none text-fg-muted">
        {label}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a family name to the CSS-variable reference for the chip-tint.
 * Mirrors the slugging logic from family.ts but returns the var() form
 * (e.g. `var(--family-calm)`) so it can be assigned to `--chip-tint`.
 *
 * Falls back to `var(--border)` when the family is unmapped or null,
 * which the `.family-chip-tinted` utility blends into a neutral grey
 * pill — visually "untagged" rather than broken.
 */
function familyVarFor(family: string | null | undefined): string {
  // Reuse the canonical mapping by parsing the hsl(var(--...)) string from
  // familyAccent — keeps the slug table in one place. Defensive: if the
  // caller passes anything off the map, fall back gracefully.
  const accent = familyAccent(family);
  // accent looks like `hsl(var(--family-calm))` for known families,
  // or `hsl(var(--border))` for unknowns.
  const match = accent.match(/var\((--[a-z0-9-]+)\)/i);
  return match ? `var(${match[1]})` : "var(--border)";
}

function shortWeekday(iso: string): string {
  try {
    const d = new Date(`${iso}T00:00:00`);
    return d.toLocaleDateString("en-US", { weekday: "short" });
  } catch {
    return "";
  }
}
