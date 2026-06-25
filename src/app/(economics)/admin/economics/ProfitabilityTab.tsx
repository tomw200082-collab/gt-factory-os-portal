"use client";

// ---------------------------------------------------------------------------
// Economics — Profitability tab (economics-interactive-redesign).
//
// A CFO/COO-grade, interactive product-viability surface that sits alongside
// the existing Overview / Component Costs / Raw Materials tabs. It is built
// entirely on the data the /api/economics list already returns (per-SKU COGS,
// avg sale price, material margin, trailing-90-day units + revenue) — no new
// backend contract. The one write it performs reuses the existing
// PATCH /api/economics/sale-price/:item_id endpoint.
//
// Three linked views, top to bottom:
//   1. Portfolio KPIs   — blended (revenue-weighted) gross margin, total and
//                         annualised 90-day contribution, profitable vs
//                         loss-making SKU split, and contribution concentration
//                         (how much of the money comes from the top few SKUs).
//   2. Viability matrix — a margin-% × 90-day-revenue quadrant scatter, bubble
//                         area ∝ contribution. A live "target margin" slider
//                         moves the threshold line and re-segments the
//                         portfolio into Stars / Cash engines / Premium niche /
//                         Review, with loss-makers flagged in the red zone.
//                         Hovering reads out a SKU; clicking opens the simulator.
//   3. Contribution Pareto — SKUs ranked by trailing-90-day contribution with a
//                         cumulative line, so the operator can see exactly how
//                         many SKUs carry 80% of the gross profit and which
//                         ones drag.
//
// The What-if simulator (a drawer) lets a planner model a price / cost / volume
// change and see the new margin and contribution before committing — and, when
// they like a price, apply it to the live avg sale price in one click.
//
// "Analysable" = sold in the last 90 days AND margin computable (COGS complete
// AND a sale price set). SKUs that fall outside that set can't be placed on a
// profitability axis honestly, so they are surfaced as an explicit, clickable
// excluded-count rather than silently dropped — the Overview tab is where their
// measurement gaps get fixed.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Sparkles,
  AlertTriangle,
  RotateCcw,
  Check,
  Target,
  Info,
} from "lucide-react";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Drawer } from "@/components/overlays/Drawer";
import { formatIls, formatPct, formatQtyInt } from "@/lib/utils/format-money";

// ---------------------------------------------------------------------------
// Row shape — a structural subset of the page's EconomicsRow, so the page can
// pass its rows straight through.
// ---------------------------------------------------------------------------

export interface ProfitRow {
  item_id: string;
  item_name: string;
  cogs_per_unit_ils: string | null;
  cogs_complete: boolean;
  avg_sale_price_ils: string | null;
  material_margin_ils: string | null;
  material_margin_pct: string | null;
  qty_sold_90d: string;
  order_count_90d: number;
  revenue_90d_ils: string | null;
  qty_on_hand: string;
}

// 90 trailing days → annual run-rate.
const ANNUALISE = 365 / 90;

function num(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Derived per-SKU economics. Computed once, reused across every view + the
// simulator. A SKU is `analysable` when it sold in the trailing 90 days and
// its margin is computable end-to-end.
// ---------------------------------------------------------------------------

interface SkuEconomics {
  row: ProfitRow;
  price: number | null;
  cogs: number | null;
  marginUnit: number | null;
  marginPct: number | null;
  qty90d: number;
  revenue90d: number | null;
  contribution90d: number | null; // marginUnit × qty90d
  analysable: boolean;
}

export function deriveSku(row: ProfitRow): SkuEconomics {
  const price = num(row.avg_sale_price_ils);
  const cogs = num(row.cogs_per_unit_ils);
  const qty90d = num(row.qty_sold_90d) ?? 0;
  const revenue90d = num(row.revenue_90d_ils);
  const marginUnit =
    num(row.material_margin_ils) ??
    (price != null && cogs != null ? price - cogs : null);
  const marginPct =
    num(row.material_margin_pct) ??
    (marginUnit != null && price != null && price > 0
      ? (marginUnit / price) * 100
      : null);
  const contribution90d = marginUnit != null ? marginUnit * qty90d : null;
  const analysable =
    qty90d > 0 &&
    row.cogs_complete &&
    price != null &&
    marginUnit != null &&
    revenue90d != null;
  return {
    row,
    price,
    cogs,
    marginUnit,
    marginPct,
    qty90d,
    revenue90d,
    contribution90d,
    analysable,
  };
}

// ---------------------------------------------------------------------------
// Viability quadrant classification. A SKU's segment depends on the live
// target-margin threshold (vertical-axis split) and the portfolio's median
// 90-day revenue (horizontal-axis split). Loss-makers short-circuit to their
// own segment — a SKU bleeding money is never a "niche premium".
// ---------------------------------------------------------------------------

type Segment = "star" | "cash" | "niche" | "review" | "loss";

const SEGMENT_META: Record<
  Segment,
  { label: string; tone: ChartTone; blurb: string }
> = {
  star: {
    label: "Stars",
    tone: "success",
    blurb: "High margin and high revenue — protect and grow these.",
  },
  cash: {
    label: "Cash engines",
    tone: "info",
    blurb:
      "High revenue but thinner margin — volume carries the P&L; small price/cost moves compound.",
  },
  niche: {
    label: "Premium niche",
    tone: "accent",
    blurb:
      "Healthy margin but low revenue — headroom to push volume without discounting.",
  },
  review: {
    label: "Review",
    tone: "warning",
    blurb:
      "Low margin and low revenue — re-price, re-cost, or consider retiring.",
  },
  loss: {
    label: "Loss-making",
    tone: "danger",
    blurb: "Sells below material cost — every unit shipped destroys margin.",
  },
};

export function classifySegment(
  s: SkuEconomics,
  targetMarginPct: number,
  medianRevenue: number,
): Segment {
  if (s.marginUnit != null && s.marginUnit < 0) return "loss";
  const highMargin = (s.marginPct ?? 0) >= targetMarginPct;
  const highRevenue = (s.revenue90d ?? 0) >= medianRevenue;
  if (highMargin && highRevenue) return "star";
  if (!highMargin && highRevenue) return "cash";
  if (highMargin && !highRevenue) return "niche";
  return "review";
}

// ---------------------------------------------------------------------------
// Tone → tailwind tokens. Mirrors the chip/badge tones used across the page.
// ---------------------------------------------------------------------------

type ChartTone = "success" | "info" | "accent" | "warning" | "danger";

const TONE_FILL: Record<ChartTone, string> = {
  success: "fill-success",
  info: "fill-info",
  accent: "fill-accent",
  warning: "fill-warning",
  danger: "fill-danger",
};
const TONE_TEXT: Record<ChartTone, string> = {
  success: "text-success-fg",
  info: "text-info-fg",
  accent: "text-accent",
  warning: "text-warning-fg",
  danger: "text-danger-fg",
};
const TONE_BAR: Record<ChartTone, string> = {
  success: "bg-success",
  info: "bg-info",
  accent: "bg-accent",
  warning: "bg-warning",
  danger: "bg-danger",
};

// ---------------------------------------------------------------------------
// KpiStat — one figure in the portfolio strip.
// ---------------------------------------------------------------------------

function KpiStat({
  label,
  value,
  sub,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  hint: string;
  tone?: "default" | "success" | "danger" | "warning";
  icon?: JSX.Element;
}): JSX.Element {
  const valueColor =
    tone === "success"
      ? "text-success-fg"
      : tone === "danger"
        ? "text-danger-fg"
        : tone === "warning"
          ? "text-warning-fg"
          : "text-fg-strong";
  return (
    <div className="rounded-lg border border-border/60 bg-bg-subtle/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
          {label}
        </span>
        <span
          className="inline-flex cursor-help text-fg-subtle"
          title={hint}
          aria-label={hint}
        >
          {icon ?? <Info className="h-3 w-3" strokeWidth={2.25} />}
        </span>
      </div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${valueColor}`}>
        {value}
      </div>
      {sub ? (
        <div className="mt-0.5 text-3xs text-fg-subtle">{sub}</div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ViabilityMatrix — interactive margin% × 90-day-revenue quadrant scatter.
// Pure inline SVG (no chart dependency). viewBox is a fixed 1000×560 space
// that scales to the container width; data → space mapping is linear on both
// axes. Hover reads out a SKU; click opens the simulator.
// ---------------------------------------------------------------------------

const VB_W = 1000;
const VB_H = 560;
const PAD = { top: 28, right: 28, bottom: 52, left: 64 };

function ViabilityMatrix({
  skus,
  targetMarginPct,
  medianRevenue,
  onSelect,
}: {
  skus: SkuEconomics[];
  targetMarginPct: number;
  medianRevenue: number;
  onSelect: (itemId: string) => void;
}): JSX.Element {
  const [hover, setHover] = useState<string | null>(null);

  const plotW = VB_W - PAD.left - PAD.right;
  const plotH = VB_H - PAD.top - PAD.bottom;

  // Y domain (margin %): always include 0, clamp to sensible bounds, pad.
  const marginVals = skus.map((s) => s.marginPct ?? 0);
  const yMaxData = Math.max(40, ...marginVals);
  const yMinData = Math.min(0, ...marginVals);
  const yMax = Math.ceil((yMaxData + 5) / 10) * 10;
  const yMin = Math.floor((yMinData - 5) / 10) * 10;

  // X domain (90-day revenue): 0 → padded max.
  const revVals = skus.map((s) => s.revenue90d ?? 0);
  const xMaxData = Math.max(1, ...revVals);
  const xMax = xMaxData * 1.08;

  // Bubble radius ∝ sqrt(|contribution|) so area encodes magnitude.
  const contribAbs = skus.map((s) => Math.abs(s.contribution90d ?? 0));
  const maxContrib = Math.max(1, ...contribAbs);

  const xPx = (rev: number) => PAD.left + (rev / xMax) * plotW;
  const yPx = (m: number) => PAD.top + (1 - (m - yMin) / (yMax - yMin)) * plotH;
  const rPx = (c: number) => 6 + Math.sqrt(Math.abs(c) / maxContrib) * 26;

  const yZero = yPx(0);
  const yTarget = yPx(targetMarginPct);
  const xMedian = xPx(medianRevenue);

  // Y gridline ticks every 20%.
  const yTicks: number[] = [];
  for (let t = yMin; t <= yMax; t += 20) yTicks.push(t);

  const hovered = hover ? skus.find((s) => s.row.item_id === hover) : null;

  // Tooltip position as % of the container, derived from the hovered point.
  const tip =
    hovered != null
      ? {
          leftPct: (xPx(hovered.revenue90d ?? 0) / VB_W) * 100,
          topPct: (yPx(hovered.marginPct ?? 0) / VB_H) * 100,
          sku: hovered,
        }
      : null;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="w-full"
        role="img"
        aria-label="Product viability matrix: margin percent versus trailing 90-day revenue"
      >
        {/* Quadrant background washes (only meaningful above the 0 line). */}
        <rect
          x={xMedian}
          y={PAD.top}
          width={VB_W - PAD.right - xMedian}
          height={Math.max(0, yTarget - PAD.top)}
          className="fill-success/[0.05]"
        />
        <rect
          x={PAD.left}
          y={PAD.top}
          width={xMedian - PAD.left}
          height={Math.max(0, yTarget - PAD.top)}
          className="fill-accent/[0.04]"
        />
        {/* Loss zone (below 0% margin). */}
        <rect
          x={PAD.left}
          y={yZero}
          width={plotW}
          height={Math.max(0, PAD.top + plotH - yZero)}
          className="fill-danger/[0.05]"
        />

        {/* Y gridlines + labels. */}
        {yTicks.map((t) => (
          <g key={`y-${t}`}>
            <line
              x1={PAD.left}
              x2={VB_W - PAD.right}
              y1={yPx(t)}
              y2={yPx(t)}
              className={t === 0 ? "stroke-border" : "stroke-border/40"}
              strokeWidth={t === 0 ? 1.5 : 1}
            />
            <text
              x={PAD.left - 10}
              y={yPx(t) + 4}
              textAnchor="end"
              className="fill-fg-subtle text-[13px] tabular-nums"
            >
              {t}%
            </text>
          </g>
        ))}

        {/* Median-revenue divider. */}
        <line
          x1={xMedian}
          x2={xMedian}
          y1={PAD.top}
          y2={PAD.top + plotH}
          className="stroke-border/50"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
        <text
          x={xMedian}
          y={PAD.top + plotH + 30}
          textAnchor="middle"
          className="fill-fg-subtle text-[12px]"
        >
          median revenue {formatIls(medianRevenue)}
        </text>

        {/* Target-margin threshold line. */}
        <line
          x1={PAD.left}
          x2={VB_W - PAD.right}
          y1={yTarget}
          y2={yTarget}
          className="stroke-accent"
          strokeWidth={1.5}
          strokeDasharray="6 4"
        />
        <text
          x={VB_W - PAD.right}
          y={yTarget - 7}
          textAnchor="end"
          className="fill-accent text-[12px] font-semibold"
        >
          target {targetMarginPct}%
        </text>

        {/* Axis titles. */}
        <text
          x={PAD.left + plotW / 2}
          y={VB_H - 8}
          textAnchor="middle"
          className="fill-fg-muted text-[13px] font-medium"
        >
          Trailing 90-day revenue →
        </text>
        <text
          transform={`translate(16 ${PAD.top + plotH / 2}) rotate(-90)`}
          textAnchor="middle"
          className="fill-fg-muted text-[13px] font-medium"
        >
          Gross margin %
        </text>

        {/* Points. Painted largest-first so small bubbles stay clickable. */}
        {[...skus]
          .sort(
            (a, b) =>
              Math.abs(b.contribution90d ?? 0) -
              Math.abs(a.contribution90d ?? 0),
          )
          .map((s) => {
            const seg = classifySegment(s, targetMarginPct, medianRevenue);
            const tone = SEGMENT_META[seg].tone;
            const cx = xPx(s.revenue90d ?? 0);
            const cy = yPx(s.marginPct ?? 0);
            const r = rPx(s.contribution90d ?? 0);
            const isHover = hover === s.row.item_id;
            return (
              <circle
                key={s.row.item_id}
                cx={cx}
                cy={cy}
                r={r}
                className={`${TONE_FILL[tone]} cursor-pointer transition-opacity ${
                  isHover ? "stroke-fg-strong" : ""
                }`}
                fillOpacity={isHover ? 0.95 : 0.55}
                strokeWidth={isHover ? 2 : 0}
                onMouseEnter={() => setHover(s.row.item_id)}
                onMouseLeave={() => setHover((h) => (h === s.row.item_id ? null : h))}
                onClick={() => onSelect(s.row.item_id)}
              >
                <title>
                  {s.row.item_name} — margin {formatPct(s.marginPct)}, revenue{" "}
                  {formatIls(s.revenue90d)}
                </title>
              </circle>
            );
          })}
      </svg>

      {/* Hover tooltip — HTML card positioned over the chart. */}
      {tip ? (
        <div
          className="pointer-events-none absolute z-10 w-56 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-bg-raised p-2.5 shadow-raised"
          style={{
            left: `${tip.leftPct}%`,
            top: `calc(${tip.topPct}% - 12px)`,
          }}
        >
          <div className="text-xs font-semibold text-fg-strong" dir="auto">
            {tip.sku.row.item_name}
          </div>
          <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-3xs">
            <dt className="text-fg-subtle">Margin</dt>
            <dd
              className={`text-right tabular-nums ${
                (tip.sku.marginUnit ?? 0) < 0 ? "text-danger-fg" : "text-fg-strong"
              }`}
            >
              {formatPct(tip.sku.marginPct)}
            </dd>
            <dt className="text-fg-subtle">Revenue 90d</dt>
            <dd className="text-right tabular-nums text-fg-strong">
              {formatIls(tip.sku.revenue90d)}
            </dd>
            <dt className="text-fg-subtle">Contribution 90d</dt>
            <dd
              className={`text-right tabular-nums ${
                (tip.sku.contribution90d ?? 0) < 0
                  ? "text-danger-fg"
                  : "text-fg-strong"
              }`}
            >
              {formatIls(tip.sku.contribution90d)}
            </dd>
            <dt className="text-fg-subtle">Sold 90d</dt>
            <dd className="text-right tabular-nums text-fg-strong">
              {formatQtyInt(tip.sku.qty90d)}
            </dd>
          </dl>
          <div className="mt-1.5 text-3xs text-accent">Click to model →</div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ContributionPareto — SKUs ranked by trailing-90-day contribution, with a
// running cumulative %. The 80%-of-contribution line is called out so the
// operator sees how concentrated the gross profit is.
// ---------------------------------------------------------------------------

function ContributionPareto({
  skus,
  totalContribution,
  onSelect,
}: {
  skus: SkuEconomics[];
  totalContribution: number;
  onSelect: (itemId: string) => void;
}): JSX.Element {
  const ranked = useMemo(
    () =>
      [...skus].sort(
        (a, b) => (b.contribution90d ?? 0) - (a.contribution90d ?? 0),
      ),
    [skus],
  );
  const maxAbs = Math.max(
    1,
    ...ranked.map((s) => Math.abs(s.contribution90d ?? 0)),
  );

  // Cumulative share of the (positive) contribution pool, and the index where
  // we first cross 80%.
  let cum = 0;
  const denom = totalContribution > 0 ? totalContribution : 1;
  let crossed80 = false;

  return (
    <div className="divide-y divide-border/40">
      {ranked.map((s, i) => {
        const c = s.contribution90d ?? 0;
        cum += Math.max(0, c);
        const cumPct = (cum / denom) * 100;
        const isEightyMarker = !crossed80 && cumPct >= 80 && c > 0;
        if (isEightyMarker) crossed80 = true;
        const widthPct = (Math.abs(c) / maxAbs) * 100;
        const negative = c < 0;
        return (
          <button
            type="button"
            key={s.row.item_id}
            onClick={() => onSelect(s.row.item_id)}
            className="flex w-full items-center gap-3 px-1 py-2 text-left transition-colors hover:bg-bg-subtle/50"
          >
            <span className="w-6 shrink-0 text-right text-3xs tabular-nums text-fg-subtle">
              {i + 1}
            </span>
            <span className="w-44 shrink-0 truncate text-sm text-fg-strong" dir="auto">
              {s.row.item_name}
            </span>
            <span className="relative h-4 flex-1 overflow-hidden rounded bg-bg-subtle/60">
              <span
                className={`absolute inset-y-0 left-0 rounded ${
                  negative ? "bg-danger/70" : "bg-success/70"
                }`}
                style={{ width: `${Math.max(2, widthPct)}%` }}
              />
            </span>
            <span
              className={`w-24 shrink-0 text-right text-sm tabular-nums ${
                negative ? "text-danger-fg" : "text-fg-strong"
              }`}
            >
              {formatIls(c)}
            </span>
            <span
              className={`w-16 shrink-0 text-right text-3xs tabular-nums ${
                isEightyMarker ? "font-semibold text-accent" : "text-fg-subtle"
              }`}
              title="Cumulative share of total contribution"
            >
              {c > 0 ? `${cumPct.toFixed(0)}%` : "—"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WhatIfSimulator — model a price / cost / volume change for one SKU and see
// the new margin + contribution before committing. Can apply a modelled price
// to the live avg sale price via the existing sale-price endpoint.
// ---------------------------------------------------------------------------

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}): JSX.Element {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-medium text-fg-muted">{label}</span>
        <span className="text-sm font-semibold tabular-nums text-fg-strong">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-bg-subtle accent-accent"
        aria-label={label}
      />
    </div>
  );
}

function DeltaRow({
  label,
  base,
  next,
  format,
  goodWhenUp = true,
}: {
  label: string;
  base: number | null;
  next: number;
  format: (v: number | null) => string;
  goodWhenUp?: boolean;
}): JSX.Element {
  const delta = base != null ? next - base : null;
  const up = (delta ?? 0) > 0.0001;
  const down = (delta ?? 0) < -0.0001;
  const good = goodWhenUp ? up : down;
  const bad = goodWhenUp ? down : up;
  const tone = good ? "text-success-fg" : bad ? "text-danger-fg" : "text-fg-subtle";
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-fg-muted">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold tabular-nums text-fg-strong">
          {format(next)}
        </span>
        {delta != null && (up || down) ? (
          <span className={`inline-flex items-center gap-0.5 text-3xs tabular-nums ${tone}`}>
            {up ? (
              <TrendingUp className="h-3 w-3" strokeWidth={2.5} />
            ) : (
              <TrendingDown className="h-3 w-3" strokeWidth={2.5} />
            )}
            {format(Math.abs(delta))}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function WhatIfSimulator({
  sku,
  canEdit,
  onClose,
  onApplied,
}: {
  sku: SkuEconomics | null;
  canEdit: boolean;
  onClose: () => void;
  onApplied: () => void;
}): JSX.Element {
  const open = sku != null;
  const basePrice = sku?.price ?? 0;
  const baseCogs = sku?.cogs ?? 0;
  const baseQty = sku?.qty90d ?? 0;

  // Model inputs, keyed by item so switching SKUs resets cleanly.
  const [price, setPrice] = useState(basePrice);
  const [cogsPct, setCogsPct] = useState(0); // % change to COGS
  const [volPct, setVolPct] = useState(0); // % change to 90d volume
  const [keyId, setKeyId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);

  // Re-seed inputs when a different SKU is opened.
  if (sku && keyId !== sku.row.item_id) {
    setKeyId(sku.row.item_id);
    setPrice(sku.price ?? 0);
    setCogsPct(0);
    setVolPct(0);
    setApplyMsg(null);
  }

  const modelCogs = baseCogs * (1 + cogsPct / 100);
  const modelQty = baseQty * (1 + volPct / 100);
  const modelMarginUnit = price - modelCogs;
  const modelMarginPct = price > 0 ? (modelMarginUnit / price) * 100 : 0;
  const modelContribution = modelMarginUnit * modelQty;

  const baseMarginUnit = sku?.marginUnit ?? null;
  const baseMarginPct = sku?.marginPct ?? null;
  const baseContribution = sku?.contribution90d ?? null;

  // Break-even price = modelled COGS. Price for the standard 20% target:
  //   price = cogs / (1 - target).
  const breakEven = modelCogs;
  const priceForTarget = (target: number) =>
    modelCogs > 0 ? modelCogs / (1 - target / 100) : 0;

  const dirty = sku != null && Math.abs(price - basePrice) > 0.001;

  async function applyPrice(): Promise<void> {
    if (!sku || applying) return;
    setApplying(true);
    setApplyMsg(null);
    try {
      const res = await fetch(
        `/api/economics/sale-price/${encodeURIComponent(sku.row.item_id)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            manual_avg_sale_price_ils: Number(price.toFixed(2)),
          }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(body?.message ?? `Save failed (HTTP ${res.status}).`);
      }
      setApplyMsg("Applied — the new sale price is now live.");
      onApplied();
    } catch (err) {
      setApplyMsg(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={sku ? `What-if — ${sku.row.item_name}` : "What-if"}
      description="Model a price, cost, or volume move and see the new margin and contribution before you commit."
      width="lg"
    >
      {sku ? (
        <div className="space-y-5">
          {/* Current snapshot. */}
          <div className="grid grid-cols-3 gap-3 rounded-md border border-border/60 bg-bg-subtle/50 p-3 text-center">
            <div>
              <div className="text-3xs uppercase tracking-sops text-fg-subtle">
                Price
              </div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums text-fg-strong">
                {formatIls(basePrice)}
              </div>
            </div>
            <div>
              <div className="text-3xs uppercase tracking-sops text-fg-subtle">
                COGS
              </div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums text-fg-strong">
                {formatIls(baseCogs)}
              </div>
            </div>
            <div>
              <div className="text-3xs uppercase tracking-sops text-fg-subtle">
                Margin
              </div>
              <div
                className={`mt-0.5 text-sm font-semibold tabular-nums ${
                  (baseMarginUnit ?? 0) < 0 ? "text-danger-fg" : "text-fg-strong"
                }`}
              >
                {formatPct(baseMarginPct)}
              </div>
            </div>
          </div>

          {/* Levers. */}
          <div className="space-y-4">
            <Slider
              label="Sale price"
              value={price}
              min={0}
              max={Math.max(basePrice * 2.5, baseCogs * 2.5, 10)}
              step={0.5}
              format={(v) => formatIls(v)}
              onChange={setPrice}
            />
            <Slider
              label="COGS change"
              value={cogsPct}
              min={-50}
              max={50}
              step={1}
              format={(v) => `${v > 0 ? "+" : ""}${v}%`}
              onChange={setCogsPct}
            />
            <Slider
              label="Volume change (90d)"
              value={volPct}
              min={-50}
              max={100}
              step={1}
              format={(v) => `${v > 0 ? "+" : ""}${v}%`}
              onChange={setVolPct}
            />
            <button
              type="button"
              onClick={() => {
                setPrice(basePrice);
                setCogsPct(0);
                setVolPct(0);
              }}
              className="inline-flex items-center gap-1.5 text-3xs font-medium text-fg-subtle hover:text-accent"
            >
              <RotateCcw className="h-3 w-3" strokeWidth={2.5} />
              Reset to current
            </button>
          </div>

          {/* Modelled result. */}
          <div className="rounded-md border border-accent/30 bg-accent-soft/30 p-3">
            <div className="mb-1 text-3xs font-semibold uppercase tracking-sops text-accent">
              Modelled result
            </div>
            <div className="divide-y divide-border/40">
              <DeltaRow
                label="Margin / unit"
                base={baseMarginUnit}
                next={modelMarginUnit}
                format={(v) => formatIls(v)}
              />
              <DeltaRow
                label="Margin %"
                base={baseMarginPct}
                next={modelMarginPct}
                format={(v) => formatPct(v)}
              />
              <DeltaRow
                label="Contribution (90d)"
                base={baseContribution}
                next={modelContribution}
                format={(v) => formatIls(v)}
              />
              <DeltaRow
                label="Contribution (annualised)"
                base={baseContribution != null ? baseContribution * ANNUALISE : null}
                next={modelContribution * ANNUALISE}
                format={(v) => formatIls(v)}
              />
            </div>
          </div>

          {/* Reference prices. */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border/60 bg-bg-subtle/40 p-3">
              <div className="text-3xs uppercase tracking-sops text-fg-subtle">
                Break-even price
              </div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums text-fg-strong">
                {formatIls(breakEven)}
              </div>
              <div className="mt-0.5 text-3xs text-fg-subtle">
                covers modelled COGS exactly
              </div>
            </div>
            <div className="rounded-md border border-border/60 bg-bg-subtle/40 p-3">
              <div className="text-3xs uppercase tracking-sops text-fg-subtle">
                Price for 30% margin
              </div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums text-fg-strong">
                {formatIls(priceForTarget(30))}
              </div>
              <button
                type="button"
                onClick={() =>
                  setPrice(Number(priceForTarget(30).toFixed(2)))
                }
                className="mt-0.5 text-3xs font-medium text-accent hover:underline"
              >
                use this price
              </button>
            </div>
          </div>

          {modelMarginUnit < 0 ? (
            <div className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger-softer/60 p-2.5 text-xs text-danger-fg">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
              <span>
                At this price the unit still sells below cost. Raise the price
                above the break-even of {formatIls(breakEven)} to stop the bleed.
              </span>
            </div>
          ) : null}

          {/* Commit. */}
          <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
            <div className="text-3xs text-fg-subtle">
              {applyMsg ? (
                <span
                  className={
                    applyMsg.startsWith("Applied")
                      ? "text-success-fg"
                      : "text-danger-fg"
                  }
                >
                  {applyMsg}
                </span>
              ) : dirty ? (
                "Applies the modelled price to the live avg sale price."
              ) : (
                "Move the price slider to model a change."
              )}
            </div>
            {canEdit ? (
              <button
                type="button"
                onClick={() => void applyPrice()}
                disabled={!dirty || applying}
                className="btn-primary inline-flex shrink-0 items-center gap-1.5"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                {applying ? "Applying…" : "Apply price"}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div />
      )}
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// SegmentLegend — quadrant key with live counts + contribution per segment.
// ---------------------------------------------------------------------------

function SegmentLegend({
  counts,
  contribution,
}: {
  counts: Record<Segment, number>;
  contribution: Record<Segment, number>;
}): JSX.Element {
  const order: Segment[] = ["star", "cash", "niche", "review", "loss"];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {order.map((seg) => {
        const meta = SEGMENT_META[seg];
        return (
          <div
            key={seg}
            className="rounded-md border border-border/60 bg-bg-subtle/40 p-2.5"
            title={meta.blurb}
          >
            <div className="flex items-center gap-1.5">
              <span className={`dot ${TONE_BAR[meta.tone]}`} aria-hidden />
              <span className={`text-xs font-semibold ${TONE_TEXT[meta.tone]}`}>
                {meta.label}
              </span>
            </div>
            <div className="mt-1 text-sm font-bold tabular-nums text-fg-strong">
              {counts[seg]}{" "}
              <span className="text-3xs font-normal text-fg-subtle">SKUs</span>
            </div>
            <div className="text-3xs tabular-nums text-fg-subtle">
              {formatIls(contribution[seg])} / 90d
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProfitabilityTab — top-level view. Owns the target-margin threshold and the
// selected SKU (for the simulator).
// ---------------------------------------------------------------------------

export function ProfitabilityTab({
  rows,
  canEdit,
  loading,
  isError,
  errorMessage,
  onRetry,
  onPriceApplied,
}: {
  rows: ProfitRow[];
  canEdit: boolean;
  loading: boolean;
  isError: boolean;
  errorMessage?: string;
  onRetry: () => void;
  onPriceApplied: () => void;
}): JSX.Element {
  const [targetMargin, setTargetMargin] = useState(30);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const all = useMemo(() => rows.map(deriveSku), [rows]);
  const analysable = useMemo(() => all.filter((s) => s.analysable), [all]);
  const excludedCount = all.length - analysable.length;

  const medianRevenue = useMemo(() => {
    const vals = analysable
      .map((s) => s.revenue90d ?? 0)
      .sort((a, b) => a - b);
    if (vals.length === 0) return 0;
    const mid = Math.floor(vals.length / 2);
    return vals.length % 2 === 0
      ? (vals[mid - 1] + vals[mid]) / 2
      : vals[mid];
  }, [analysable]);

  // Portfolio aggregates.
  const agg = useMemo(() => {
    let totalContribution = 0;
    let totalRevenue = 0;
    let profitable = 0;
    let loss = 0;
    const contribs: number[] = [];
    for (const s of analysable) {
      const c = s.contribution90d ?? 0;
      totalContribution += c;
      totalRevenue += s.revenue90d ?? 0;
      contribs.push(c);
      if ((s.marginUnit ?? 0) < 0) loss += 1;
      else if (c > 0) profitable += 1;
    }
    const blendedMarginPct =
      totalRevenue > 0 ? (totalContribution / totalRevenue) * 100 : null;
    // Top-N concentration: share of positive contribution from the top 5 SKUs.
    const positives = contribs.filter((c) => c > 0).sort((a, b) => b - a);
    const positiveTotal = positives.reduce((a, b) => a + b, 0);
    const top5 = positives.slice(0, 5).reduce((a, b) => a + b, 0);
    const concentration =
      positiveTotal > 0 ? (top5 / positiveTotal) * 100 : null;
    return {
      totalContribution,
      totalRevenue,
      blendedMarginPct,
      profitable,
      loss,
      concentration,
    };
  }, [analysable]);

  const segmentStats = useMemo(() => {
    const counts: Record<Segment, number> = {
      star: 0,
      cash: 0,
      niche: 0,
      review: 0,
      loss: 0,
    };
    const contribution: Record<Segment, number> = {
      star: 0,
      cash: 0,
      niche: 0,
      review: 0,
      loss: 0,
    };
    for (const s of analysable) {
      const seg = classifySegment(s, targetMargin, medianRevenue);
      counts[seg] += 1;
      contribution[seg] += s.contribution90d ?? 0;
    }
    return { counts, contribution };
  }, [analysable, targetMargin, medianRevenue]);

  const selectedSku = useMemo(() => {
    if (!selectedId) return null;
    return all.find((s) => s.row.item_id === selectedId) ?? null;
  }, [selectedId, all]);

  if (isError) {
    return (
      <SectionCard title="Profitability">
        <div className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg">
          <div className="font-semibold">Could not load data</div>
          {errorMessage ? (
            <div className="mt-1 text-xs">{errorMessage}</div>
          ) : null}
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      </SectionCard>
    );
  }

  if (!loading && analysable.length === 0) {
    return (
      <SectionCard
        eyebrow="Profitability"
        title="Nothing to analyse yet"
        description="Profitability analysis needs SKUs that sold in the last 90 days and have both a COGS and an average sale price. Fix the measurement gaps on the Overview tab, then come back."
      >
        <div className="rounded-lg border border-dashed border-border bg-bg-subtle/40 p-6 text-center text-xs text-fg-subtle">
          {excludedCount > 0
            ? `${excludedCount} SKU${excludedCount === 1 ? "" : "s"} can't be placed on a profitability axis yet (missing COGS, sale price, or recent sales).`
            : "No products in the current dataset."}
        </div>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* Portfolio KPIs. */}
      <SectionCard
        eyebrow="Profitability"
        title="Portfolio profit health"
        description="Trailing 90 days, measured SKUs only. Contribution = (sale price − COGS) × units sold — the gross profit each product actually threw off."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KpiStat
            label="Blended margin"
            value={loading ? "…" : formatPct(agg.blendedMarginPct)}
            hint="Revenue-weighted gross margin across all measured SKUs: total contribution ÷ total revenue. This is the portfolio's true average, not the average of per-SKU percentages."
            tone={
              agg.blendedMarginPct != null && agg.blendedMarginPct < 0
                ? "danger"
                : "default"
            }
            icon={<Target className="h-3 w-3" strokeWidth={2.25} />}
          />
          <KpiStat
            label="Contribution 90d"
            value={loading ? "…" : formatIls(agg.totalContribution)}
            sub={
              loading
                ? undefined
                : `≈ ${formatIls(agg.totalContribution * ANNUALISE)} / yr run-rate`
            }
            hint="Sum of every measured SKU's trailing-90-day gross contribution. The annualised figure is this × 365/90."
            tone={agg.totalContribution < 0 ? "danger" : "success"}
          />
          <KpiStat
            label="Profitable SKUs"
            value={loading ? "…" : String(agg.profitable)}
            sub={loading ? undefined : `of ${analysable.length} measured`}
            hint="Measured SKUs whose 90-day contribution is positive."
            tone="success"
          />
          <KpiStat
            label="Loss-making"
            value={loading ? "…" : String(agg.loss)}
            sub={loading ? undefined : "selling below cost"}
            hint="Measured SKUs whose sale price is below COGS — every unit shipped loses money."
            tone={agg.loss > 0 ? "danger" : "default"}
          />
          <KpiStat
            label="Top-5 concentration"
            value={loading ? "…" : formatPct(agg.concentration)}
            sub={loading ? undefined : "of gross profit"}
            hint="Share of total positive contribution generated by the five biggest contributors. High concentration = the P&L leans on a few SKUs (a risk worth watching)."
            tone={
              agg.concentration != null && agg.concentration >= 80
                ? "warning"
                : "default"
            }
          />
        </div>
        {excludedCount > 0 ? (
          <div className="mt-3 text-3xs text-fg-subtle">
            {excludedCount} SKU{excludedCount === 1 ? "" : "s"} excluded from
            this analysis (no recent sales, or COGS/price not measured). Fix on
            the Overview tab.
          </div>
        ) : null}
      </SectionCard>

      {/* Viability matrix. */}
      <SectionCard
        eyebrow="Viability matrix"
        title="Where does each product sit?"
        description="Each bubble is a SKU. Up = healthier margin, right = more revenue, bigger = more gross profit. Drag the target-margin line to re-segment the portfolio. Click a bubble to model a change."
        actions={
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" strokeWidth={2} />
          </div>
        }
      >
        <div className="space-y-4">
          {/* Target-margin slider. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <label className="flex items-center gap-2 text-xs font-medium text-fg-muted">
              <Target className="h-3.5 w-3.5 text-accent" strokeWidth={2.25} />
              Target margin
            </label>
            <input
              type="range"
              min={0}
              max={80}
              step={1}
              value={targetMargin}
              onChange={(e) => setTargetMargin(Number(e.target.value))}
              className="h-1.5 max-w-xs flex-1 cursor-pointer appearance-none rounded-full bg-bg-subtle accent-accent"
              aria-label="Target margin percent"
            />
            <span className="text-sm font-bold tabular-nums text-accent">
              {targetMargin}%
            </span>
            <span className="text-3xs text-fg-subtle">
              SKUs above the line clear your margin bar; below it need a re-price
              or re-cost.
            </span>
          </div>

          {loading ? (
            <div className="h-72 animate-pulse rounded-lg bg-bg-subtle/50" />
          ) : (
            <ViabilityMatrix
              skus={analysable}
              targetMarginPct={targetMargin}
              medianRevenue={medianRevenue}
              onSelect={setSelectedId}
            />
          )}

          {!loading ? (
            <SegmentLegend
              counts={segmentStats.counts}
              contribution={segmentStats.contribution}
            />
          ) : null}
        </div>
      </SectionCard>

      {/* Contribution Pareto. */}
      <SectionCard
        eyebrow="Contribution ranking"
        title="Who carries the gross profit?"
        description="SKUs ranked by trailing-90-day contribution. The right-hand % is the running cumulative share — the bold row is where the top SKUs first cover 80% of the gross profit. Loss-makers sink to the bottom in red. Click any row to model it."
        contentClassName="p-0"
      >
        {loading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-6 animate-pulse rounded bg-bg-subtle/60"
              />
            ))}
          </div>
        ) : (
          <div className="px-4 py-2 sm:px-5">
            <ContributionPareto
              skus={analysable}
              totalContribution={agg.totalContribution}
              onSelect={setSelectedId}
            />
          </div>
        )}
      </SectionCard>

      <WhatIfSimulator
        sku={selectedSku}
        canEdit={canEdit}
        onClose={() => setSelectedId(null)}
        onApplied={onPriceApplied}
      />
    </div>
  );
}
