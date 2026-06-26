"use client";

// ---------------------------------------------------------------------------
// Economics — Profitability tab (economics-interactive-redesign).
//
// A CFO/COO-grade product-profitability workspace built entirely on the data
// /api/economics already returns — no new backend contract. The one write it
// performs reuses PATCH /api/economics/sale-price/:item_id.
//
// FRAME (data-driven): in production every SKU has zero trailing-90-day sales
// (the LionWheel velocity join is empty) but ~69 of 78 have a computable
// margin and ~₪470k of margin is embedded in current stock. So the value lens
// here is MARGIN STRUCTURE + MARGIN LOCKED IN INVENTORY, not sales velocity.
//
// Layout: a sticky faceted "refinery" rail (margin/price/inventory/readiness/
// reliability facets + preset saved-views + search) that LIVE-FILTERS every
// visual to the right:
//   • Hero KPI band       — embedded margin in stock, stock-weighted margin,
//                           measured coverage, margin spread, concentration.
//   • Margin distribution — histogram of margin-% bands (click a bar to filter).
//   • Viability matrix    — margin% × {price|inventory|COGS} scatter, bubble
//                           area ∝ embedded margin, live target-margin line.
//                           Bubbles are keyboard-focusable; the results table
//                           below is the screen-reader text-equivalent.
//   • Embedded-margin Pareto — which SKUs hold the most margin value in stock.
//   • Results table       — the filtered SKUs, sortable, click to model.
//
// The What-if simulator (drawer) models a price/cost/volume move and can apply
// a price to the live avg sale price in one click (with confirmation).
//
// "Measured" = margin computable (COGS complete AND a sale price set). That is
// the only gate — a SKU does NOT need recent sales to be analysable here.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  RotateCcw,
  Check,
  Target,
  Info,
  Crown,
  Gem,
  Boxes,
  Coins,
  Wallet,
  PieChart,
  Search,
  SlidersHorizontal,
  X,
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Drawer } from "@/components/overlays/Drawer";
import { useConfirm } from "@/components/overlays/ConfirmDialog";
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
  qty_on_hand: string;
  fg_inventory_value_at_cost: string | null;
  fg_inventory_value_at_sale_price: string | null;
  embedded_material_margin_in_stock: string | null;
  reliability_flag: string | null;
  cogs_snapshot_at: string | null;
}

function num(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

// Plain-English labels for the price-reliability flag (the API emits raw enum
// values — never show those to an operator). Unknown values fall back to a
// humanised form.
const RELIABILITY_LABELS: Record<string, string> = {
  MANUAL: "Manually set",
  NONE: "No price set",
};
function reliabilityLabel(flag: string): string {
  return RELIABILITY_LABELS[flag] ?? flag.toLowerCase().replace(/_/g, " ");
}

// Compact "how long ago" for the snapshot freshness line.
function relativeAge(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

// ---------------------------------------------------------------------------
// Derived per-SKU economics. A SKU is `measured` when its margin is computable
// (COGS complete AND a sale price set). No sales requirement.
// ---------------------------------------------------------------------------

export interface SkuEconomics {
  row: ProfitRow;
  price: number | null;
  cogs: number | null;
  marginUnit: number | null;
  marginPct: number | null;
  qtyOnHand: number;
  invAtCost: number | null;
  invAtSale: number | null;
  embedded: number | null; // margin locked in current stock
  costed: boolean;
  priced: boolean;
  measured: boolean;
  inStock: boolean;
  reliability: string | null;
}

export function deriveSku(row: ProfitRow): SkuEconomics {
  const price = num(row.avg_sale_price_ils);
  const cogs = num(row.cogs_per_unit_ils);
  const qtyOnHand = num(row.qty_on_hand) ?? 0;
  const marginUnit =
    num(row.material_margin_ils) ??
    (price != null && cogs != null ? price - cogs : null);
  const marginPct =
    num(row.material_margin_pct) ??
    (marginUnit != null && price != null && price > 0
      ? (marginUnit / price) * 100
      : null);
  const invAtCost =
    num(row.fg_inventory_value_at_cost) ??
    (cogs != null ? cogs * qtyOnHand : null);
  const invAtSale =
    num(row.fg_inventory_value_at_sale_price) ??
    (price != null ? price * qtyOnHand : null);
  const embedded =
    num(row.embedded_material_margin_in_stock) ??
    (marginUnit != null ? marginUnit * qtyOnHand : null);
  const costed = row.cogs_complete && cogs != null;
  const priced = price != null;
  const measured = costed && priced && marginUnit != null;
  return {
    row,
    price,
    cogs,
    marginUnit,
    marginPct,
    qtyOnHand,
    invAtCost,
    invAtSale,
    embedded,
    costed,
    priced,
    measured,
    inStock: qtyOnHand > 0,
    reliability: row.reliability_flag,
  };
}

// ---------------------------------------------------------------------------
// Viability segment. Margin band (vs the live target) × margin-value-at-stake
// (does this SKU hold above-median embedded margin in stock?). Loss-makers
// short-circuit. The frame reads in inventory-gold terms, not sales terms.
// ---------------------------------------------------------------------------

export type Segment = "crown" | "risk" | "premium" | "review" | "loss";

const SEGMENT_META: Record<
  Segment,
  { label: string; tone: ChartTone; icon: typeof Crown; blurb: string }
> = {
  crown: {
    label: "Crown jewels",
    tone: "success",
    icon: Crown,
    blurb:
      "Strong margin and a large share of the margin locked in your stock — protect and prioritise these.",
  },
  risk: {
    label: "Margin risk",
    tone: "warning",
    icon: AlertTriangle,
    blurb:
      "A lot of inventory value at a thin margin — a small price or cost move here moves the books the most.",
  },
  premium: {
    label: "Premium",
    tone: "accent",
    icon: Gem,
    blurb:
      "Strong margin but little capital tied up — room to stock and sell more without discounting.",
  },
  review: {
    label: "Review",
    tone: "neutral",
    icon: Info,
    blurb: "Thin margin and little at stake — re-price, re-cost, or retire.",
  },
  loss: {
    label: "Loss-making",
    tone: "danger",
    icon: TrendingDown,
    blurb: "Sells below material cost — every unit shipped destroys margin.",
  },
};

export function classifySegment(
  s: SkuEconomics,
  targetMarginPct: number,
  medianEmbedded: number,
): Segment {
  if (s.marginUnit != null && s.marginUnit < 0) return "loss";
  const highMargin = (s.marginPct ?? 0) >= targetMarginPct;
  const highValue = s.inStock && (s.embedded ?? 0) >= medianEmbedded;
  if (highMargin && highValue) return "crown";
  if (!highMargin && highValue) return "risk";
  if (highMargin && !highValue) return "premium";
  return "review";
}

// ---------------------------------------------------------------------------
// Tone → tailwind tokens.
// ---------------------------------------------------------------------------

type ChartTone = "success" | "info" | "accent" | "warning" | "danger" | "neutral";

const TONE_FILL: Record<ChartTone, string> = {
  success: "fill-success",
  info: "fill-info",
  accent: "fill-accent",
  warning: "fill-warning",
  danger: "fill-danger",
  neutral: "fill-fg-subtle",
};
const TONE_TEXT: Record<ChartTone, string> = {
  success: "text-success-fg",
  info: "text-info-fg",
  accent: "text-accent",
  warning: "text-warning-fg",
  danger: "text-danger-fg",
  neutral: "text-fg-muted",
};
const TONE_BG: Record<ChartTone, string> = {
  success: "bg-success",
  info: "bg-info",
  accent: "bg-accent",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-fg-subtle",
};

// ---------------------------------------------------------------------------
// Classification bands (used by both the facet rail and the histogram so the
// language stays identical across the surface).
// ---------------------------------------------------------------------------

type MarginBandKey = "loss" | "b0_20" | "b20_40" | "b40_60" | "b60_plus";

const MARGIN_BANDS: Array<{
  key: MarginBandKey;
  label: string;
  tone: ChartTone;
  match: (pct: number) => boolean;
}> = [
  { key: "loss", label: "Loss (<0%)", tone: "danger", match: (p) => p < 0 },
  { key: "b0_20", label: "0–20%", tone: "warning", match: (p) => p >= 0 && p < 20 },
  { key: "b20_40", label: "20–40%", tone: "info", match: (p) => p >= 20 && p < 40 },
  { key: "b40_60", label: "40–60%", tone: "accent", match: (p) => p >= 40 && p < 60 },
  { key: "b60_plus", label: "60%+", tone: "success", match: (p) => p >= 60 },
];

type PriceBandKey = "p0_50" | "p50_100" | "p100_200" | "p200_plus";
const PRICE_BANDS: Array<{
  key: PriceBandKey;
  label: string;
  match: (p: number) => boolean;
}> = [
  { key: "p0_50", label: "≤ ₪50", match: (p) => p <= 50 },
  { key: "p50_100", label: "₪50–100", match: (p) => p > 50 && p <= 100 },
  { key: "p100_200", label: "₪100–200", match: (p) => p > 100 && p <= 200 },
  { key: "p200_plus", label: "₪200+", match: (p) => p > 200 },
];

type InventoryKey = "in_stock" | "no_stock";
type ReadinessKey = "measured" | "unpriced" | "cogs_gap";

// Each multi-select facet's key type, pinned in one place. Toggling a key on
// the wrong facet (e.g. an inventory key on the margin facet) is then a compile
// error, not a silent no-op — the mismatch is designed out of existence.
type SetFacet = "margin" | "price" | "inventory" | "readiness" | "reliability";
interface FacetKeyMap {
  margin: MarginBandKey;
  price: PriceBandKey;
  inventory: InventoryKey;
  readiness: ReadinessKey;
  reliability: string;
}

// ---------------------------------------------------------------------------
// Filter state — one object, recomputed against every visual.
// ---------------------------------------------------------------------------

interface Filters {
  q: string;
  margin: Set<MarginBandKey>;
  price: Set<PriceBandKey>;
  inventory: Set<InventoryKey>;
  readiness: Set<ReadinessKey>;
  reliability: Set<string>;
  minMarginPct: number; // continuous floor; -100 = off
}

function emptyFilters(): Filters {
  return {
    q: "",
    margin: new Set(),
    price: new Set(),
    inventory: new Set(),
    readiness: new Set(),
    reliability: new Set(),
    minMarginPct: -100,
  };
}

function filtersActive(f: Filters): boolean {
  return (
    f.q.trim().length > 0 ||
    f.margin.size > 0 ||
    f.price.size > 0 ||
    f.inventory.size > 0 ||
    f.readiness.size > 0 ||
    f.reliability.size > 0 ||
    f.minMarginPct > -100
  );
}

function matchesFilters(s: SkuEconomics, f: Filters): boolean {
  if (f.q) {
    const q = f.q.trim().toLowerCase();
    if (
      !s.row.item_name.toLowerCase().includes(q) &&
      !s.row.item_id.toLowerCase().includes(q)
    )
      return false;
  }
  if (f.margin.size > 0) {
    const pct = s.marginPct;
    const hit =
      pct != null &&
      MARGIN_BANDS.some((b) => f.margin.has(b.key) && b.match(pct));
    if (!hit) return false;
  }
  if (f.price.size > 0) {
    const p = s.price;
    const hit =
      p != null && PRICE_BANDS.some((b) => f.price.has(b.key) && b.match(p));
    if (!hit) return false;
  }
  if (f.inventory.size > 0) {
    const key: InventoryKey = s.inStock ? "in_stock" : "no_stock";
    if (!f.inventory.has(key)) return false;
  }
  if (f.readiness.size > 0) {
    const keys: ReadinessKey[] = [];
    if (s.measured) keys.push("measured");
    if (!s.priced) keys.push("unpriced");
    if (!s.costed) keys.push("cogs_gap");
    if (!keys.some((k) => f.readiness.has(k))) return false;
  }
  if (f.reliability.size > 0) {
    if (!s.reliability || !f.reliability.has(s.reliability)) return false;
  }
  if (f.minMarginPct > -100) {
    if (s.marginPct == null || s.marginPct < f.minMarginPct) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Small presentational primitives.
// ---------------------------------------------------------------------------

// HeroStat — a hairline stat cell for the secondary cluster in the hero. The
// label carries its explanation as a title so the figure stays uncluttered.
function HeroStat({
  label,
  value,
  sub,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  hint?: string;
  tone?: "default" | "success" | "danger" | "warning";
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
    <div className="bg-bg-raised p-4">
      <div
        className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle"
        title={hint}
      >
        {label}
      </div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${valueColor}`}>
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-3xs text-fg-subtle">{sub}</div> : null}
    </div>
  );
}

// MarginRibbon — the signature element. One jewel-toned bar that fingerprints
// the whole portfolio's margin composition: each segment is a margin band,
// width ∝ how many SKUs sit in it, the tooltip carries the margin value held
// there. It is also a filter — click a segment (or its legend) to slice the
// page to that band.
function MarginRibbon({
  skus,
  active,
  onToggle,
}: {
  skus: SkuEconomics[];
  active: Set<MarginBandKey>;
  onToggle: (k: MarginBandKey) => void;
}): JSX.Element {
  const segs = MARGIN_BANDS.map((b) => {
    const inBand = skus.filter((s) => s.marginPct != null && b.match(s.marginPct));
    return {
      b,
      count: inBand.length,
      value: inBand.reduce((a, s) => a + (s.embedded ?? 0), 0),
    };
  });
  const dim = (k: MarginBandKey) => active.size > 0 && !active.has(k);
  return (
    <div>
      <div className="flex h-3.5 w-full gap-px overflow-hidden rounded-full bg-bg-subtle">
        {segs.map(({ b, count, value }) =>
          count === 0 ? null : (
            <button
              key={b.key}
              type="button"
              onClick={() => onToggle(b.key)}
              aria-pressed={active.has(b.key)}
              aria-label={`${b.label} margin: ${count} product${count === 1 ? "" : "s"}, ${formatIls(value)} margin in stock`}
              title={`${b.label}: ${count} product${count === 1 ? "" : "s"} · ${formatIls(value)} margin in stock`}
              style={{ flexGrow: count, flexBasis: 0, minWidth: 6 }}
              className={`${TONE_BG[b.tone]} h-full transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${dim(b.key) ? "opacity-30 hover:opacity-60" : "opacity-90 hover:opacity-100"}`}
            />
          ),
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {segs.map(({ b, count }) => (
          <button
            key={b.key}
            type="button"
            onClick={() => onToggle(b.key)}
            aria-pressed={active.has(b.key)}
            className={`inline-flex items-center gap-1.5 py-1 text-3xs transition-colors ${active.has(b.key) ? TONE_TEXT[b.tone] : "text-fg-subtle hover:text-fg"}`}
          >
            <span className={`h-2 w-2 rounded-sm ${TONE_BG[b.tone]} ${dim(b.key) ? "opacity-40" : ""}`} aria-hidden />
            {b.label}
            <span className="tabular-nums opacity-70">{count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Facet chip + group.
// ---------------------------------------------------------------------------

function FacetChip({
  label,
  count,
  active,
  tone = "neutral",
  onToggle,
}: {
  label: string;
  count: number;
  active: boolean;
  tone?: ChartTone;
  onToggle: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
        active
          ? `border-transparent ${TONE_BG[tone]} text-fg-inverted`
          : "border-border/70 bg-bg-subtle text-fg-muted hover:bg-bg-subtle/70"
      }`}
    >
      <span>{label}</span>
      <span className="tabular-nums opacity-80">{count}</span>
    </button>
  );
}

function FacetGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="space-y-1.5">
      <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
        {title}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Margin-distribution histogram. Click a bar to toggle its margin-band filter.
// ---------------------------------------------------------------------------

function MarginHistogram({
  skus,
  active,
  onToggleBand,
}: {
  skus: SkuEconomics[];
  active: Set<MarginBandKey>;
  onToggleBand: (k: MarginBandKey) => void;
}): JSX.Element {
  const counts = MARGIN_BANDS.map(
    (b) =>
      skus.filter((s) => s.marginPct != null && b.match(s.marginPct)).length,
  );
  const max = Math.max(1, ...counts);
  return (
    <div className="flex items-end gap-2 h-[132px]">
      {MARGIN_BANDS.map((b, i) => {
        const c = counts[i];
        const isActive = active.has(b.key);
        const h = c === 0 ? 2 : Math.max(6, (c / max) * 104);
        return (
          <button
            type="button"
            key={b.key}
            onClick={() => onToggleBand(b.key)}
            aria-pressed={isActive}
            aria-label={`${c} product${c === 1 ? "" : "s"} at ${b.label} margin — activate to filter`}
            title={`${c} product${c === 1 ? "" : "s"} at ${b.label} margin — click to filter`}
            className="group flex flex-1 flex-col items-center justify-end gap-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span className="text-xs font-semibold tabular-nums text-fg-strong">
              {c}
            </span>
            <span
              className={`w-full rounded-t transition-all ${TONE_BG[b.tone]} ${
                isActive ? "opacity-100 ring-2 ring-accent/60" : "opacity-70 group-hover:opacity-100"
              }`}
              style={{ height: h }}
            />
            <span className="text-3xs tabular-nums text-fg-subtle">
              {b.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Margin treemap — the "gold map". Each tile is a SKU, area ∝ margin held in
// its stock, colour = margin band. A binary slice-and-dice layout (alternating
// orientation) keeps it robust and dependency-free. Click a tile to model it.
// ---------------------------------------------------------------------------

export interface TreemapRect {
  sku: SkuEconomics;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function treemapLayout(
  items: SkuEconomics[],
  x: number,
  y: number,
  w: number,
  h: number,
  horizontal: boolean,
  out: TreemapRect[],
): void {
  if (items.length === 0) return;
  if (items.length === 1) {
    out.push({ sku: items[0], x, y, w, h });
    return;
  }
  const val = (s: SkuEconomics) => Math.max(0, s.embedded ?? 0);
  const total = items.reduce((a, s) => a + val(s), 0);
  const half = total / 2;
  let acc = 0;
  let split = 1;
  for (let k = 0; k < items.length; k++) {
    acc += val(items[k]);
    if (acc >= half) {
      split = k + 1;
      break;
    }
  }
  split = Math.max(1, Math.min(items.length - 1, split));
  const first = items.slice(0, split);
  const second = items.slice(split);
  const firstSum = first.reduce((a, s) => a + val(s), 0);
  const ratio = total > 0 ? firstSum / total : first.length / items.length;
  if (horizontal) {
    const wl = w * ratio;
    treemapLayout(first, x, y, wl, h, false, out);
    treemapLayout(second, x + wl, y, w - wl, h, false, out);
  } else {
    const ht = h * ratio;
    treemapLayout(first, x, y, w, ht, true, out);
    treemapLayout(second, x, y + ht, w, h - ht, true, out);
  }
}

function MarginTreemap({
  skus,
  onSelect,
}: {
  skus: SkuEconomics[];
  onSelect: (id: string) => void;
}): JSX.Element {
  const top = useMemo(
    () =>
      skus
        .filter((s) => (s.embedded ?? 0) > 0)
        .sort((a, b) => (b.embedded ?? 0) - (a.embedded ?? 0))
        .slice(0, 28),
    [skus],
  );
  const rects = useMemo(() => {
    const out: TreemapRect[] = [];
    if (top.length) treemapLayout(top, 0, 0, 100, 100, true, out);
    return out;
  }, [top]);

  if (top.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-bg-subtle/40 p-6 text-center text-xs text-fg-subtle">
        No positive margin in stock to map in this view.
      </div>
    );
  }
  return (
    <div
      className="relative w-full overflow-hidden rounded-lg bg-bg-subtle"
      style={{ aspectRatio: "16 / 7" }}
    >
      {rects.map(({ sku, x, y, w, h }) => {
        const band =
          MARGIN_BANDS.find((b) => b.match(sku.marginPct ?? 0)) ??
          MARGIN_BANDS[MARGIN_BANDS.length - 1];
        const big = w > 11 && h > 18;
        return (
          <button
            key={sku.row.item_id}
            type="button"
            onClick={() => onSelect(sku.row.item_id)}
            title={`${sku.row.item_name}: ${formatIls(sku.embedded)} margin in stock · ${formatPct(sku.marginPct)} margin`}
            aria-label={`${sku.row.item_name}: ${formatIls(sku.embedded)} margin in stock, ${formatPct(sku.marginPct)} margin. Activate to model.`}
            style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` }}
            className={`group absolute flex flex-col justify-between overflow-hidden border border-bg-raised p-1.5 text-left opacity-90 transition-opacity hover:z-10 hover:opacity-100 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fg-strong ${TONE_BG[band.tone]}`}
          >
            {big ? (
              <>
                <span
                  className="truncate text-3xs font-semibold leading-tight text-fg-inverted"
                  dir="auto"
                >
                  {sku.row.item_name}
                </span>
                <span className="text-3xs font-bold tabular-nums text-fg-inverted">
                  {formatIls(sku.embedded)}
                </span>
              </>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Viability matrix — margin% (Y) × chosen X metric, bubble ∝ embedded margin.
// Bubbles are keyboard-focusable buttons; the results table is the SR
// text-equivalent.
// ---------------------------------------------------------------------------

type XMetric = "price" | "inv_sale" | "cogs";
const X_METRIC_META: Record<XMetric, { label: string; get: (s: SkuEconomics) => number | null }> = {
  price: { label: "Sale price", get: (s) => s.price },
  inv_sale: { label: "Inventory value", get: (s) => s.invAtSale },
  cogs: { label: "COGS / unit", get: (s) => s.cogs },
};

const VB_W = 1000;
const VB_H = 520;
const PAD = { top: 24, right: 24, bottom: 48, left: 60 };

function ViabilityMatrix({
  skus,
  targetMarginPct,
  xMetric,
  medianEmbedded,
  hoverId,
  onHover,
  onSelect,
}: {
  skus: SkuEconomics[];
  targetMarginPct: number;
  xMetric: XMetric;
  medianEmbedded: number;
  hoverId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}): JSX.Element {
  const plotW = VB_W - PAD.left - PAD.right;
  const plotH = VB_H - PAD.top - PAD.bottom;
  const xget = X_METRIC_META[xMetric].get;

  const marginVals = skus.map((s) => s.marginPct ?? 0);
  const yMax = Math.ceil((Math.max(40, ...marginVals) + 5) / 10) * 10;
  const yMin = Math.floor((Math.min(0, ...marginVals) - 5) / 10) * 10;

  const xVals = skus.map((s) => xget(s) ?? 0);
  const xMax = Math.max(1, ...xVals) * 1.08;
  const xMedian = median(xVals.filter((v) => v > 0));

  const embAbs = skus.map((s) => Math.abs(s.embedded ?? 0));
  const maxEmb = Math.max(1, ...embAbs);

  const xPx = (v: number) => PAD.left + (v / xMax) * plotW;
  const yPx = (m: number) => PAD.top + (1 - (m - yMin) / (yMax - yMin)) * plotH;
  const rPx = (e: number) => 5 + Math.sqrt(Math.abs(e) / maxEmb) * 28;

  const yZero = yPx(0);
  const yTarget = yPx(targetMarginPct);
  const xMed = xPx(xMedian);

  const yTicks: number[] = [];
  for (let t = yMin; t <= yMax; t += 20) yTicks.push(t);

  const hovered = hoverId ? skus.find((s) => s.row.item_id === hoverId) : null;
  const tip = hovered
    ? {
        leftPct: (xPx(xget(hovered) ?? 0) / VB_W) * 100,
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
        aria-label={`Viability matrix: gross margin percent versus ${X_METRIC_META[xMetric].label}. ${skus.length} measured SKUs.`}
      >
        {/* quadrant washes */}
        <rect x={xMed} y={PAD.top} width={Math.max(0, VB_W - PAD.right - xMed)} height={Math.max(0, yTarget - PAD.top)} className="fill-success/[0.05]" />
        <rect x={PAD.left} y={PAD.top} width={Math.max(0, xMed - PAD.left)} height={Math.max(0, yTarget - PAD.top)} className="fill-accent/[0.04]" />
        <rect x={PAD.left} y={yZero} width={plotW} height={Math.max(0, PAD.top + plotH - yZero)} className="fill-danger/[0.05]" />

        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={VB_W - PAD.right} y1={yPx(t)} y2={yPx(t)} className={t === 0 ? "stroke-border" : "stroke-border/40"} strokeWidth={t === 0 ? 1.5 : 1} />
            <text x={PAD.left - 10} y={yPx(t) + 4} textAnchor="end" className="fill-fg-subtle text-xs tabular-nums">{t}%</text>
          </g>
        ))}

        <line x1={xMed} x2={xMed} y1={PAD.top} y2={PAD.top + plotH} className="stroke-border/50" strokeWidth={1} strokeDasharray="4 4" />
        <text x={xMed} y={PAD.top + plotH + 28} textAnchor="middle" className="fill-fg-subtle text-xs">median</text>

        <line x1={PAD.left} x2={VB_W - PAD.right} y1={yTarget} y2={yTarget} className="stroke-accent" strokeWidth={1.5} strokeDasharray="6 4" />
        <text x={VB_W - PAD.right} y={yTarget - 6} textAnchor="end" className="fill-accent text-xs font-semibold">target {targetMarginPct}%</text>

        <text x={PAD.left + plotW / 2} y={VB_H - 6} textAnchor="middle" className="fill-fg-muted text-sm font-medium">{X_METRIC_META[xMetric].label} →</text>
        <text transform={`translate(15 ${PAD.top + plotH / 2}) rotate(-90)`} textAnchor="middle" className="fill-fg-muted text-sm font-medium">Gross margin %</text>

        {[...skus]
          .sort((a, b) => Math.abs(b.embedded ?? 0) - Math.abs(a.embedded ?? 0))
          .map((s) => {
            const seg = classifySegment(s, targetMarginPct, medianEmbedded);
            const cx = xPx(xget(s) ?? 0);
            const cy = yPx(s.marginPct ?? 0);
            const r = rPx(s.embedded ?? 0);
            const isHover = hoverId === s.row.item_id;
            return (
              <circle
                key={s.row.item_id}
                cx={cx}
                cy={cy}
                r={r}
                tabIndex={0}
                role="button"
                aria-label={`${s.row.item_name}: margin ${formatPct(s.marginPct)}, ${X_METRIC_META[xMetric].label} ${formatIls(xget(s))}, ${formatIls(s.embedded)} margin in stock. Activate to model.`}
                className={`${TONE_FILL[SEGMENT_META[seg].tone]} cursor-pointer outline-none transition-opacity ${isHover ? "stroke-fg-strong" : ""}`}
                fillOpacity={isHover ? 0.95 : 0.55}
                strokeWidth={isHover ? 2 : 0}
                onMouseEnter={() => onHover(s.row.item_id)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(s.row.item_id)}
                onBlur={() => onHover(null)}
                onClick={() => onSelect(s.row.item_id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(s.row.item_id);
                  }
                }}
              />
            );
          })}
      </svg>

      {tip ? (
        <div
          className="pointer-events-none absolute z-10 w-56 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-bg-raised p-2.5 shadow-raised"
          style={{ left: `${tip.leftPct}%`, top: `calc(${tip.topPct}% - 12px)` }}
        >
          <div className="text-xs font-semibold text-fg-strong" dir="auto">{tip.sku.row.item_name}</div>
          <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-3xs">
            <dt className="text-fg-subtle">Margin</dt>
            <dd className={`text-right tabular-nums ${(tip.sku.marginUnit ?? 0) < 0 ? "text-danger-fg" : "text-fg-strong"}`}>{formatPct(tip.sku.marginPct)} · {formatIls(tip.sku.marginUnit)}</dd>
            <dt className="text-fg-subtle">{X_METRIC_META[xMetric].label}</dt>
            <dd className="text-right tabular-nums text-fg-strong">{formatIls(X_METRIC_META[xMetric].get(tip.sku))}</dd>
            <dt className="text-fg-subtle">On hand</dt>
            <dd className="text-right tabular-nums text-fg-strong">{formatQtyInt(tip.sku.qtyOnHand)}</dd>
            <dt className="text-fg-subtle">Margin in stock</dt>
            <dd className={`text-right tabular-nums ${(tip.sku.embedded ?? 0) < 0 ? "text-danger-fg" : "text-fg-strong"}`}>{formatIls(tip.sku.embedded)}</dd>
          </dl>
          <div className="mt-1.5 text-3xs text-accent">Open simulator →</div>
        </div>
      ) : null}
    </div>
  );
}

function SegmentLegend({
  counts,
  embedded,
}: {
  counts: Record<Segment, number>;
  embedded: Record<Segment, number>;
}): JSX.Element {
  const order: Segment[] = ["crown", "risk", "premium", "review", "loss"];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {order.map((seg) => {
        const m = SEGMENT_META[seg];
        const Icon = m.icon;
        return (
          <div key={seg} className="rounded-lg border border-border/60 bg-bg-subtle/40 p-3">
            <div className="flex items-center gap-1.5">
              <Icon className={`h-3.5 w-3.5 ${TONE_TEXT[m.tone]}`} strokeWidth={2.25} aria-hidden />
              <span className={`text-xs font-semibold ${TONE_TEXT[m.tone]}`}>{m.label}</span>
            </div>
            <div className="mt-1 text-base font-semibold tabular-nums text-fg-strong">
              {counts[seg]} <span className="text-3xs font-normal text-fg-subtle">products</span>
            </div>
            <div className="text-3xs tabular-nums text-fg-subtle">{formatIls(embedded[seg])} in stock</div>
            <div className="mt-1.5 text-3xs leading-snug text-fg-subtle">{m.blurb}</div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Embedded-margin Pareto — which SKUs hold the most margin value in stock.
// ---------------------------------------------------------------------------

function EmbeddedPareto({
  skus,
  total,
  onSelect,
}: {
  skus: SkuEconomics[];
  total: number;
  onSelect: (id: string) => void;
}): JSX.Element {
  const ranked = useMemo(
    () => [...skus].sort((a, b) => (b.embedded ?? 0) - (a.embedded ?? 0)).slice(0, 15),
    [skus],
  );
  const maxAbs = Math.max(1, ...ranked.map((s) => Math.abs(s.embedded ?? 0)));
  const denom = total > 0 ? total : 1;
  let cum = 0;
  let crossed = false;
  return (
    <div className="divide-y divide-border/40">
      {ranked.map((s, i) => {
        const e = s.embedded ?? 0;
        cum += Math.max(0, e);
        const cumPct = (cum / denom) * 100;
        const mark = !crossed && cumPct >= 80 && e > 0;
        if (mark) crossed = true;
        const neg = e < 0;
        return (
          <button
            type="button"
            key={s.row.item_id}
            onClick={() => onSelect(s.row.item_id)}
            title={`Model ${s.row.item_name}`}
            className="flex w-full items-center gap-3 px-1 py-2 text-left transition-colors hover:bg-bg-subtle/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span className="w-5 shrink-0 text-right text-3xs tabular-nums text-fg-subtle">{i + 1}</span>
            <span className="w-40 shrink-0 truncate text-sm text-fg-strong" dir="auto">{s.row.item_name}</span>
            <span className="relative h-4 flex-1 overflow-hidden rounded bg-bg-subtle/60">
              <span className={`absolute inset-y-0 left-0 rounded ${neg ? "bg-danger/70" : "bg-success/70"}`} style={{ width: `${Math.max(2, (Math.abs(e) / maxAbs) * 100)}%` }} />
            </span>
            <span className={`w-24 shrink-0 text-right text-sm tabular-nums ${neg ? "text-danger-fg" : "text-fg-strong"}`}>
              {neg ? <span className="sr-only">Loss-making: </span> : null}
              {formatIls(e)}
            </span>
            <span className={`w-12 shrink-0 text-right text-3xs tabular-nums ${mark ? "font-semibold text-accent" : "text-fg-subtle"}`} title="Cumulative share of margin in stock">
              {e > 0 ? `${cumPct.toFixed(0)}%` : "—"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results table — the filtered SKUs, sortable. Also the keyboard / screen-
// reader text-equivalent of the matrix.
// ---------------------------------------------------------------------------

type SortCol = "name" | "price" | "cogs" | "margin" | "margin_pct" | "on_hand" | "inv_cost" | "embedded";

function SortTh({
  col,
  label,
  align = "left",
  sort,
  onSort,
}: {
  col: SortCol;
  label: string;
  align?: "left" | "right";
  sort: { col: SortCol; dir: "asc" | "desc" } | null;
  onSort: (s: { col: SortCol; dir: "asc" | "desc" } | null) => void;
}): JSX.Element {
  const activeCol = sort?.col === col;
  const dir = activeCol ? sort?.dir : null;
  return (
    <th scope="col" aria-sort={activeCol ? (dir === "asc" ? "ascending" : "descending") : "none"} className={`sticky top-0 z-10 bg-bg-subtle/95 px-3 py-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle backdrop-blur ${align === "right" ? "text-right" : "text-left"}`}>
      <button type="button" onClick={() => onSort(!activeCol ? { col, dir: "desc" } : dir === "desc" ? { col, dir: "asc" } : null)} className={`group inline-flex items-center gap-1 ${align === "right" ? "ml-auto" : ""} ${activeCol ? "text-fg-strong" : ""}`}>
        <span>{label}</span>
        {activeCol ? (dir === "asc" ? <ChevronUp className="h-3 w-3" strokeWidth={2.5} /> : <ChevronDown className="h-3 w-3" strokeWidth={2.5} />) : <ChevronsUpDown className="h-3 w-3 opacity-30 group-hover:opacity-70" strokeWidth={2.5} />}
      </button>
    </th>
  );
}

function ResultsTable({
  skus,
  targetMarginPct,
  medianEmbedded,
  sort,
  onSort,
  onSelect,
  onSwitchToOverview,
}: {
  skus: SkuEconomics[];
  targetMarginPct: number;
  medianEmbedded: number;
  sort: { col: SortCol; dir: "asc" | "desc" } | null;
  onSort: (s: { col: SortCol; dir: "asc" | "desc" } | null) => void;
  onSelect: (id: string) => void;
  onSwitchToOverview?: () => void;
}): JSX.Element {
  const sorted = useMemo(() => {
    const arr = [...skus];
    if (!sort) return arr;
    const get = (s: SkuEconomics): number | string | null => {
      switch (sort.col) {
        case "name": return s.row.item_name;
        case "price": return s.price;
        case "cogs": return s.cogs;
        case "margin": return s.marginUnit;
        case "margin_pct": return s.marginPct;
        case "on_hand": return s.qtyOnHand;
        case "inv_cost": return s.invAtCost;
        case "embedded": return s.embedded;
      }
    };
    arr.sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return sort.dir === "asc" ? av - bv : bv - av;
      const c = String(av).localeCompare(String(bv));
      return sort.dir === "asc" ? c : -c;
    });
    return arr;
  }, [skus, sort]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/70">
            <SortTh col="name" label="Product" sort={sort} onSort={onSort} />
            <SortTh col="price" label="Price" align="right" sort={sort} onSort={onSort} />
            <SortTh col="cogs" label="COGS" align="right" sort={sort} onSort={onSort} />
            <SortTh col="margin" label="Margin / unit" align="right" sort={sort} onSort={onSort} />
            <SortTh col="margin_pct" label="Margin %" align="right" sort={sort} onSort={onSort} />
            <SortTh col="on_hand" label="On hand" align="right" sort={sort} onSort={onSort} />
            <SortTh col="inv_cost" label="Stock at cost" align="right" sort={sort} onSort={onSort} />
            <SortTh col="embedded" label="Margin in stock" align="right" sort={sort} onSort={onSort} />
            <th scope="col" className="sticky top-0 z-10 bg-bg-subtle/95 px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle backdrop-blur">Segment</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => {
            const seg = s.measured ? classifySegment(s, targetMarginPct, medianEmbedded) : null;
            const negative = (s.marginUnit ?? 0) < 0;
            return (
              <tr
                key={s.row.item_id}
                role="button"
                tabIndex={0}
                aria-label={`${s.row.item_name} — open the price simulator`}
                onClick={() => onSelect(s.row.item_id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(s.row.item_id); } }}
                className="cursor-pointer border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40 focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent"
              >
                <td className="px-3 py-2">
                  <span className="block text-sm font-medium leading-snug text-fg-strong" dir="auto">{s.row.item_name}</span>
                </td>
                <td className="px-3 py-2 text-right text-sm tabular-nums">{s.priced ? formatIls(s.price) : <span className="text-3xs text-warning-fg">no price</span>}</td>
                <td className="px-3 py-2 text-right text-sm tabular-nums">{s.costed ? formatIls(s.cogs) : <span className="text-3xs text-warning-fg">incomplete</span>}</td>
                <td className={`px-3 py-2 text-right text-sm tabular-nums ${negative ? "text-danger-fg" : "text-fg-strong"}`}>{formatIls(s.marginUnit)}</td>
                <td className={`px-3 py-2 text-right text-sm tabular-nums ${negative ? "text-danger-fg" : "text-fg-strong"}`}>{formatPct(s.marginPct)}</td>
                <td className="px-3 py-2 text-right text-sm tabular-nums text-fg-muted">{s.inStock ? formatQtyInt(s.qtyOnHand) : "—"}</td>
                <td className="px-3 py-2 text-right text-sm tabular-nums text-fg-muted">{formatIls(s.invAtCost)}</td>
                <td className={`px-3 py-2 text-right text-sm tabular-nums ${(s.embedded ?? 0) < 0 ? "text-danger-fg" : "text-fg-strong"}`}>{formatIls(s.embedded)}</td>
                <td className="px-3 py-2">
                  {seg ? (
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${TONE_TEXT[SEGMENT_META[seg].tone]}`}>
                      {(() => { const I = SEGMENT_META[seg].icon; return <I className="h-3 w-3" strokeWidth={2.25} />; })()}
                      {SEGMENT_META[seg].label}
                    </span>
                  ) : !s.priced ? (
                    <span className="text-3xs text-warning-fg">Set a price</span>
                  ) : onSwitchToOverview ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onSwitchToOverview(); }}
                      className="text-3xs font-medium text-accent hover:underline"
                    >
                      Cost data missing — fix on Overview →
                    </button>
                  ) : (
                    <span className="text-3xs text-warning-fg">Cost data missing</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// What-if simulator (drawer). Models a price/cost/volume move; can apply a
// price to the live avg sale price with confirmation.
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
        <span className="text-sm font-semibold tabular-nums text-fg-strong">{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-bg-subtle accent-accent" aria-label={label} />
    </div>
  );
}

function DeltaRow({
  label,
  base,
  next,
  format,
}: {
  label: string;
  base: number | null;
  next: number;
  format: (v: number | null) => string;
}): JSX.Element {
  const delta = base != null ? next - base : null;
  const up = (delta ?? 0) > 0.0001;
  const down = (delta ?? 0) < -0.0001;
  const tone = up ? "text-success-fg" : down ? "text-danger-fg" : "text-fg-subtle";
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-fg-muted">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold tabular-nums text-fg-strong">{format(next)}</span>
        {delta != null && (up || down) ? (
          <span className={`inline-flex items-center gap-0.5 text-3xs tabular-nums ${tone}`}>
            {up ? <TrendingUp className="h-3 w-3" strokeWidth={2.5} aria-hidden /> : <TrendingDown className="h-3 w-3" strokeWidth={2.5} aria-hidden />}
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
  targetMargin,
  onClose,
  onApplied,
}: {
  sku: SkuEconomics | null;
  canEdit: boolean;
  targetMargin: number;
  onClose: () => void;
  onApplied: () => void;
}): JSX.Element {
  const open = sku != null;
  const { confirm, dialog: confirmDialog } = useConfirm();
  const basePrice = sku?.price ?? 0;
  const baseCogs = sku?.cogs ?? 0;
  const baseQty = sku?.qtyOnHand ?? 0;

  const [price, setPrice] = useState(basePrice);
  const [cogsPct, setCogsPct] = useState(0);
  const [keyId, setKeyId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(false);
  // Once a price is applied, the parent query takes a beat to refetch. Track
  // the just-committed value locally so the drawer's "current" strip reflects
  // it immediately instead of showing the stale baseline.
  const [committedPrice, setCommittedPrice] = useState<number | null>(null);

  if (sku && keyId !== sku.row.item_id) {
    setKeyId(sku.row.item_id);
    setPrice(sku.price ?? 0);
    setCogsPct(0);
    setApplyMsg(null);
    setCommittedPrice(null);
  }
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setApplyMsg(null);
      setCommittedPrice(null);
    }
  }

  const currentPrice = committedPrice ?? basePrice;
  const modelCogs = baseCogs * (1 + cogsPct / 100);
  const modelMarginUnit = price - modelCogs;
  const modelMarginPct = price > 0 ? (modelMarginUnit / price) * 100 : 0;
  const modelEmbedded = modelMarginUnit * baseQty;
  const breakEven = modelCogs;
  const priceForTarget = (t: number) => (modelCogs > 0 ? modelCogs / (1 - t / 100) : 0);
  const dirty = sku != null && Math.abs(price - currentPrice) > 0.001;

  async function applyPrice(): Promise<void> {
    if (!sku || applying) return;
    const ok = await confirm({
      title: `Apply ${formatIls(Number(price.toFixed(2)))} as the sale price for ${sku.row.item_name}?`,
      description: "This updates the live average sale price and immediately changes margin and inventory-at-sale figures. You can change it again at any time.",
      confirmLabel: "Apply price",
    });
    if (!ok) return;
    setApplying(true);
    setApplyMsg(null);
    try {
      const res = await fetch(`/api/economics/sale-price/${encodeURIComponent(sku.row.item_id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ manual_avg_sale_price_ils: Number(price.toFixed(2)) }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? `The price could not be saved (HTTP ${res.status}).`);
      }
      setApplyMsg("Applied — the new sale price is now live.");
      setCommittedPrice(Number(price.toFixed(2)));
      onApplied();
    } catch (err) {
      setApplyMsg(err instanceof Error ? err.message : "The price could not be saved.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title={sku ? `What-if — ${sku.row.item_name}` : "What-if"} description="Model a price or cost move and see the new margin before you commit." width="lg">
      {sku ? (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3 rounded-md border border-border/60 bg-bg-subtle/50 p-3 text-center">
            <div><div className="text-3xs uppercase tracking-sops text-fg-subtle">Price</div><div className="mt-0.5 text-sm font-semibold tabular-nums text-fg-strong">{formatIls(currentPrice)}</div></div>
            <div><div className="text-3xs uppercase tracking-sops text-fg-subtle">COGS</div><div className="mt-0.5 text-sm font-semibold tabular-nums text-fg-strong">{formatIls(baseCogs)}</div></div>
            <div><div className="text-3xs uppercase tracking-sops text-fg-subtle">Margin</div><div className={`mt-0.5 text-sm font-semibold tabular-nums ${(sku.marginUnit ?? 0) < 0 ? "text-danger-fg" : "text-fg-strong"}`}>{formatPct(sku.marginPct)}</div></div>
          </div>

          <div className="space-y-4">
            <Slider label="Sale price" value={price} min={0} max={Math.max(basePrice * 2.5, baseCogs * 2.5, 10)} step={0.5} format={(v) => formatIls(v)} onChange={setPrice} />
            <div>
              <Slider label="COGS change" value={cogsPct} min={-50} max={50} step={1} format={(v) => `${v > 0 ? "+" : ""}${v}%`} onChange={setCogsPct} />
              {cogsPct !== 0 ? (
                <div className="mt-1 text-3xs tabular-nums text-fg-subtle">
                  COGS would be {formatIls(modelCogs)}
                </div>
              ) : null}
            </div>
            <button type="button" disabled={applying} onClick={() => { setPrice(currentPrice); setCogsPct(0); }} className="inline-flex items-center gap-1.5 rounded text-3xs font-medium text-fg-subtle hover:text-accent disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <RotateCcw className="h-3 w-3" strokeWidth={2.5} /> Reset to current
            </button>
          </div>

          <div className="rounded-md border border-accent/30 bg-accent-soft/30 p-3">
            <div className="mb-1 text-3xs font-semibold uppercase tracking-sops text-accent">Modelled result</div>
            <div className="divide-y divide-border/40">
              <DeltaRow label="Margin / unit" base={sku.marginUnit} next={modelMarginUnit} format={(v) => formatIls(v)} />
              <DeltaRow label="Margin %" base={sku.marginPct} next={modelMarginPct} format={(v) => formatPct(v)} />
              <DeltaRow label="Margin in stock" base={sku.embedded} next={modelEmbedded} format={(v) => formatIls(v)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border/60 bg-bg-subtle/40 p-3">
              <div className="text-3xs uppercase tracking-sops text-fg-subtle">Break-even price</div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums text-fg-strong">{formatIls(breakEven)}</div>
              <div className="mt-0.5 text-3xs text-fg-subtle">covers modelled COGS exactly</div>
            </div>
            <div className="rounded-md border border-border/60 bg-bg-subtle/40 p-3">
              <div className="text-3xs uppercase tracking-sops text-fg-subtle">Price for {targetMargin}% margin</div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums text-fg-strong">{formatIls(priceForTarget(targetMargin))}</div>
              <button type="button" disabled={applying} onClick={() => setPrice(Number(priceForTarget(targetMargin).toFixed(2)))} title={`Set the price slider to ${formatIls(priceForTarget(targetMargin))}`} className="mt-1 min-h-7 rounded px-2 py-1 text-3xs font-medium text-accent hover:bg-accent-soft/60 hover:underline disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Use this price</button>
            </div>
          </div>

          {modelMarginUnit < 0 ? (
            <div className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger-softer/60 p-2.5 text-xs text-danger-fg">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
              <span>At this price the unit still sells below cost. Raise it above the break-even of {formatIls(breakEven)}.</span>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
            <div className="text-3xs text-fg-subtle" aria-live="polite" aria-atomic="true">
              {applyMsg ? (
                <span className={applyMsg.startsWith("Applied") ? "text-success-fg" : "text-danger-fg"}>{applyMsg}</span>
              ) : !canEdit ? "Modelled values — applying a price needs planner or admin access." : !sku.priced ? "Setting a price also starts measuring this product's margin." : dirty ? "Applies the modelled price to the live average sale price." : "Move the price slider to model a change."}
            </div>
            {canEdit ? (
              <button type="button" onClick={() => void applyPrice()} disabled={!dirty || applying} title={!dirty ? "Move the price slider to model a change first" : applying ? "Applying…" : "Apply the modelled price to the live sale price"} className="btn-primary inline-flex shrink-0 items-center gap-1.5">
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                {applying ? "Applying…" : "Apply price"}
              </button>
            ) : null}
          </div>
          {confirmDialog}
        </div>
      ) : <div />}
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Preset saved-views — one click to distil a slice of the portfolio.
// ---------------------------------------------------------------------------

const PRESETS: Array<{ key: string; label: string; icon: typeof Crown; build: () => Filters }> = [
  {
    key: "crown",
    label: "Crown jewels",
    icon: Crown,
    build: () => ({ ...emptyFilters(), margin: new Set(["b40_60", "b60_plus"]), inventory: new Set(["in_stock"]) }),
  },
  {
    key: "risk",
    label: "Margin risk",
    icon: AlertTriangle,
    build: () => ({ ...emptyFilters(), margin: new Set(["loss", "b0_20"]) }),
  },
  {
    key: "gold",
    label: "Margin in stock",
    icon: Boxes,
    build: () => ({ ...emptyFilters(), inventory: new Set(["in_stock"]) }),
  },
  {
    key: "unpriced",
    label: "Needs a price",
    icon: Target,
    build: () => ({ ...emptyFilters(), readiness: new Set(["unpriced"]) }),
  },
];

// ---------------------------------------------------------------------------
// ProfitabilityTab.
// ---------------------------------------------------------------------------

export function ProfitabilityTab({
  rows,
  canEdit,
  loading,
  isError,
  errorMessage,
  onRetry,
  onPriceApplied,
  onSwitchToOverview,
}: {
  rows: ProfitRow[];
  canEdit: boolean;
  loading: boolean;
  isError: boolean;
  errorMessage?: string;
  onRetry: () => void;
  onPriceApplied: () => void;
  onSwitchToOverview?: () => void;
}): JSX.Element {
  const [targetMargin, setTargetMargin] = useState(40);
  const [xMetric, setXMetric] = useState<XMetric>("price");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(() => emptyFilters());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [sort, setSort] = useState<{ col: SortCol; dir: "asc" | "desc" } | null>({ col: "embedded", dir: "desc" });

  // Newest COGS snapshot across the portfolio — the freshness of the numbers.
  const snapshotAge = useMemo(() => {
    let newest = 0;
    for (const r of rows) {
      const t = r.cogs_snapshot_at ? new Date(r.cogs_snapshot_at).getTime() : 0;
      if (Number.isFinite(t) && t > newest) newest = t;
    }
    return newest > 0 ? relativeAge(new Date(newest).toISOString()) : null;
  }, [rows]);

  const all = useMemo(() => rows.map(deriveSku), [rows]);
  const reliabilityValues = useMemo(() => {
    const set = new Set<string>();
    for (const s of all) if (s.reliability) set.add(s.reliability);
    return Array.from(set).sort();
  }, [all]);

  const filtered = useMemo(() => all.filter((s) => matchesFilters(s, filters)), [all, filters]);
  const filteredMeasured = useMemo(() => filtered.filter((s) => s.measured), [filtered]);

  // Median embedded margin among in-stock measured (the value-at-stake split).
  const medianEmbedded = useMemo(
    () => median(filteredMeasured.filter((s) => s.inStock).map((s) => s.embedded ?? 0)),
    [filteredMeasured],
  );

  // KPI aggregates over the FILTERED set.
  const agg = useMemo(() => {
    let embedded = 0, invCost = 0, invSale = 0, measured = 0, loss = 0, lowMargin = 0;
    const pcts: number[] = [];
    const embs: number[] = [];
    for (const s of filtered) {
      if (s.measured) {
        measured += 1;
        if (s.marginPct != null) pcts.push(s.marginPct);
        if ((s.marginUnit ?? 0) < 0) loss += 1;
        else if ((s.marginPct ?? 0) < 20) lowMargin += 1;
      }
      embedded += s.embedded ?? 0;
      invCost += s.invAtCost ?? 0;
      invSale += s.invAtSale ?? 0;
      embs.push(s.embedded ?? 0);
    }
    const stockMargin = invSale > 0 ? (embedded / invSale) * 100 : null;
    const positives = embs.filter((e) => e > 0).sort((a, b) => b - a);
    const posTotal = positives.reduce((a, b) => a + b, 0);
    const top5 = positives.slice(0, 5).reduce((a, b) => a + b, 0);
    return {
      embedded, invCost, invSale, measured, loss, lowMargin,
      stockMargin,
      avgMargin: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null,
      minMargin: pcts.length ? Math.min(...pcts) : null,
      maxMargin: pcts.length ? Math.max(...pcts) : null,
      concentration: posTotal > 0 ? (top5 / posTotal) * 100 : null,
      total: filtered.length,
      totalAll: all.length,
    };
  }, [filtered, all]);

  // Opportunities — portfolio-wide, money-sized actions. The distillation: what
  // is worth doing, each sized in ₪ at stake. Every card cross-filters the page
  // to exactly the SKUs behind it.
  const opportunities = useMemo(() => {
    let bleedCount = 0;
    let bleedIls = 0;
    let thinCount = 0;
    let thinCapital = 0;
    let unpricedCount = 0;
    let unpricedCapital = 0;
    const embPos: number[] = [];
    let embPosTotal = 0;
    for (const s of all) {
      if (s.measured && (s.marginUnit ?? 0) < 0) {
        bleedCount += 1;
        bleedIls += Math.min(0, s.embedded ?? 0);
      }
      if (
        s.measured &&
        s.inStock &&
        (s.marginPct ?? 0) >= 0 &&
        (s.marginPct ?? 0) < 20
      ) {
        thinCount += 1;
        thinCapital += s.invAtCost ?? 0;
      }
      if (!s.priced && s.inStock) {
        unpricedCount += 1;
        unpricedCapital += s.invAtCost ?? 0;
      }
      const e = s.embedded ?? 0;
      if (e > 0) {
        embPos.push(e);
        embPosTotal += e;
      }
    }
    embPos.sort((a, b) => b - a);
    const top5 = embPos.slice(0, 5).reduce((a, b) => a + b, 0);
    return {
      bleedCount,
      bleedIls: Math.abs(bleedIls),
      thinCount,
      thinCapital,
      unpricedCount,
      unpricedCapital,
      concentrationPct: embPosTotal > 0 ? (top5 / embPosTotal) * 100 : null,
      concentrationIls: top5,
    };
  }, [all]);

  const segmentStats = useMemo(() => {
    const counts: Record<Segment, number> = { crown: 0, risk: 0, premium: 0, review: 0, loss: 0 };
    const embedded: Record<Segment, number> = { crown: 0, risk: 0, premium: 0, review: 0, loss: 0 };
    for (const s of filteredMeasured) {
      const seg = classifySegment(s, targetMargin, medianEmbedded);
      counts[seg] += 1;
      embedded[seg] += s.embedded ?? 0;
    }
    return { counts, embedded };
  }, [filteredMeasured, targetMargin, medianEmbedded]);

  // Facet counts (over the whole set — stable as filters toggle).
  const facetCounts = useMemo(() => {
    const margin: Record<MarginBandKey, number> = { loss: 0, b0_20: 0, b20_40: 0, b40_60: 0, b60_plus: 0 };
    const price: Record<PriceBandKey, number> = { p0_50: 0, p50_100: 0, p100_200: 0, p200_plus: 0 };
    let inStock = 0, noStock = 0, measured = 0, unpriced = 0, cogsGap = 0;
    const reliability: Record<string, number> = {};
    for (const s of all) {
      if (s.marginPct != null) for (const b of MARGIN_BANDS) if (b.match(s.marginPct)) margin[b.key] += 1;
      if (s.price != null) for (const b of PRICE_BANDS) if (b.match(s.price)) price[b.key] += 1;
      if (s.inStock) inStock += 1; else noStock += 1;
      if (s.measured) measured += 1;
      if (!s.priced) unpriced += 1;
      if (!s.costed) cogsGap += 1;
      if (s.reliability) reliability[s.reliability] = (reliability[s.reliability] ?? 0) + 1;
    }
    return { margin, price, inStock, noStock, measured, unpriced, cogsGap, reliability };
  }, [all]);

  const selectedSku = useMemo(() => (selectedId ? all.find((s) => s.row.item_id === selectedId) ?? null : null), [selectedId, all]);

  // --- filter mutators ---------------------------------------------------
  function toggleFacet<F extends SetFacet>(facet: F, key: FacetKeyMap[F]): void {
    setActivePreset(null);
    setFilters((f) => {
      const next = new Set<FacetKeyMap[F]>(f[facet] as Set<FacetKeyMap[F]>);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...f, [facet]: next } as Filters;
    });
  }
  function clearAll(): void {
    setActivePreset(null);
    setFilters(emptyFilters());
  }
  // Apply a fully-specified slice (used by the opportunity cards).
  function setSlice(f: Filters): void {
    setActivePreset(null);
    setFilters(f);
  }
  function applyPreset(p: (typeof PRESETS)[number]): void {
    if (activePreset === p.key) { clearAll(); return; }
    setActivePreset(p.key);
    setFilters(p.build());
  }

  // --- gating ------------------------------------------------------------
  if (isError) {
    return (
      <SectionCard title="Profitability">
        <div className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg">
          <div className="font-semibold">We couldn&apos;t load profitability data</div>
          {errorMessage ? <div className="mt-1 text-xs">{errorMessage}</div> : null}
          <button type="button" onClick={onRetry} className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline">Retry</button>
        </div>
      </SectionCard>
    );
  }
  if (!loading && all.length === 0) {
    return (
      <SectionCard eyebrow="Profitability" title="No products yet" description="Once the economics snapshot has run, every product's margin and inventory value appears here.">
        <div className="rounded-lg border border-dashed border-border bg-bg-subtle/40 p-6 text-center text-xs text-fg-subtle">Run the snapshot from the header to compute COGS and margins.</div>
      </SectionCard>
    );
  }

  const hasFilters = filtersActive(filters);

  // Active-filter pills — one removable pill per active dimension value, shown
  // in a single always-visible bar above the content so the operator can see
  // (and undo) exactly what is driving the view, from any device.
  const activePills: Array<{ key: string; label: string; onRemove: () => void }> = [];
  if (filters.q.trim())
    activePills.push({ key: "q", label: `“${filters.q.trim()}”`, onRemove: () => setFilters((f) => ({ ...f, q: "" })) });
  for (const k of filters.margin)
    activePills.push({ key: `m-${k}`, label: `Margin ${MARGIN_BANDS.find((x) => x.key === k)?.label ?? k}`, onRemove: () => toggleFacet("margin", k) });
  for (const k of filters.price)
    activePills.push({ key: `p-${k}`, label: PRICE_BANDS.find((x) => x.key === k)?.label ?? k, onRemove: () => toggleFacet("price", k) });
  for (const k of filters.inventory)
    activePills.push({ key: `inv-${k}`, label: k === "in_stock" ? "In stock" : "No stock", onRemove: () => toggleFacet("inventory", k) });
  for (const k of filters.readiness)
    activePills.push({ key: `rd-${k}`, label: k === "measured" ? "Measured" : k === "unpriced" ? "Needs price" : "Cost data missing", onRemove: () => toggleFacet("readiness", k) });
  for (const k of filters.reliability)
    activePills.push({ key: `rel-${k}`, label: reliabilityLabel(k), onRemove: () => toggleFacet("reliability", k) });
  if (filters.minMarginPct > -100)
    activePills.push({ key: "minm", label: `Min margin ${filters.minMarginPct}%`, onRemove: () => setFilters((f) => ({ ...f, minMarginPct: -100 })) });

  // Opportunity cards — built from the money-sized signals above. Only the
  // ones that actually have something at stake are shown.
  type Opp = {
    key: string;
    icon: typeof Target;
    tone: ChartTone;
    value: string;
    label: string;
    sub: string;
    onClick: () => void;
  };
  const oppCards: Opp[] = [];
  if (opportunities.bleedCount > 0)
    oppCards.push({
      key: "bleed",
      icon: TrendingDown,
      tone: "danger",
      value: formatIls(opportunities.bleedIls),
      label: `${opportunities.bleedCount} SKU${opportunities.bleedCount === 1 ? "" : "s"} sell below cost`,
      sub: "Margin lost in current stock — re-price above cost.",
      onClick: () => setSlice({ ...emptyFilters(), margin: new Set(["loss"]) }),
    });
  if (opportunities.thinCapital > 0)
    oppCards.push({
      key: "thin",
      icon: Wallet,
      tone: "warning",
      value: formatIls(opportunities.thinCapital),
      label: "Capital in thin-margin stock",
      sub: `${opportunities.thinCount} in-stock SKU${opportunities.thinCount === 1 ? "" : "s"} earn under 20% — lift price or cut cost.`,
      onClick: () =>
        setSlice({
          ...emptyFilters(),
          margin: new Set(["b0_20"]),
          inventory: new Set(["in_stock"]),
        }),
    });
  if (opportunities.unpricedCapital > 0)
    oppCards.push({
      key: "unpriced",
      icon: Target,
      tone: "info",
      value: formatIls(opportunities.unpricedCapital),
      label: `${opportunities.unpricedCount} unpriced in stock`,
      sub: "Set a sale price to start measuring this margin.",
      onClick: () =>
        setSlice({
          ...emptyFilters(),
          readiness: new Set(["unpriced"]),
          inventory: new Set(["in_stock"]),
        }),
    });
  if (opportunities.concentrationPct != null)
    oppCards.push({
      key: "conc",
      icon: PieChart,
      tone: opportunities.concentrationPct >= 80 ? "warning" : "info",
      value: formatPct(opportunities.concentrationPct),
      label: "Margin on the top 5 SKUs",
      sub: `${formatIls(opportunities.concentrationIls)} of in-stock margin rides on five products.`,
      onClick: () => {
        setSlice({ ...emptyFilters(), inventory: new Set(["in_stock"]) });
        setSort({ col: "embedded", dir: "desc" });
      },
    });

  // --- filter rail (shared desktop + mobile) -----------------------------
  const filterRail = (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" strokeWidth={2.25} />
        <input value={filters.q} onChange={(e) => { setActivePreset(null); setFilters((f) => ({ ...f, q: e.target.value })); }} placeholder="Search products…" dir="auto" aria-label="Search products" className="input w-full pl-8" />
      </div>

      <FacetGroup title="Saved views">
        {PRESETS.map((p) => {
          const Icon = p.icon;
          const on = activePreset === p.key;
          return (
            <button key={p.key} type="button" onClick={() => applyPreset(p)} aria-pressed={on} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${on ? "border-accent bg-accent-soft text-accent" : "border-border/70 bg-bg-subtle text-fg-muted hover:bg-bg-subtle/70"}`}>
              <Icon className="h-3 w-3" strokeWidth={2.25} /> {p.label}
            </button>
          );
        })}
      </FacetGroup>

      <FacetGroup title="Margin band">
        {MARGIN_BANDS.map((b) => <FacetChip key={b.key} label={b.label} tone={b.tone} count={facetCounts.margin[b.key]} active={filters.margin.has(b.key)} onToggle={() => toggleFacet("margin", b.key)} />)}
      </FacetGroup>

      <FacetGroup title="Price band">
        {PRICE_BANDS.map((b) => <FacetChip key={b.key} label={b.label} count={facetCounts.price[b.key]} active={filters.price.has(b.key)} onToggle={() => toggleFacet("price", b.key)} />)}
      </FacetGroup>

      <FacetGroup title="Inventory">
        <FacetChip label="In stock" tone="info" count={facetCounts.inStock} active={filters.inventory.has("in_stock")} onToggle={() => toggleFacet("inventory", "in_stock")} />
        <FacetChip label="No stock" count={facetCounts.noStock} active={filters.inventory.has("no_stock")} onToggle={() => toggleFacet("inventory", "no_stock")} />
      </FacetGroup>

      <FacetGroup title="Data readiness">
        <FacetChip label="Measured" tone="success" count={facetCounts.measured} active={filters.readiness.has("measured")} onToggle={() => toggleFacet("readiness", "measured")} />
        <FacetChip label="Needs price" tone="warning" count={facetCounts.unpriced} active={filters.readiness.has("unpriced")} onToggle={() => toggleFacet("readiness", "unpriced")} />
        <FacetChip label="Cost data missing" tone="danger" count={facetCounts.cogsGap} active={filters.readiness.has("cogs_gap")} onToggle={() => toggleFacet("readiness", "cogs_gap")} />
      </FacetGroup>

      {reliabilityValues.length > 0 ? (
        <FacetGroup title="Price reliability">
          {reliabilityValues.map((r) => <FacetChip key={r} label={reliabilityLabel(r)} count={facetCounts.reliability[r] ?? 0} active={filters.reliability.has(r)} onToggle={() => toggleFacet("reliability", r)} />)}
        </FacetGroup>
      ) : null}

      <div>
        <button type="button" aria-expanded={showAdvanced} onClick={() => setShowAdvanced((v) => !v)} className="inline-flex items-center gap-1.5 text-3xs font-semibold uppercase tracking-sops text-fg-subtle hover:text-accent">
          <SlidersHorizontal className="h-3 w-3" strokeWidth={2.25} /> Advanced
          {showAdvanced ? <ChevronUp className="h-3 w-3" aria-hidden /> : <ChevronDown className="h-3 w-3" aria-hidden />}
        </button>
        {showAdvanced ? (
          <div className="mt-2">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-xs font-medium text-fg-muted">Min margin %</span>
              <span className="text-sm font-semibold tabular-nums text-fg-strong">{filters.minMarginPct <= -100 ? "off" : `${filters.minMarginPct}%`}</span>
            </div>
            <input type="range" min={-100} max={100} step={5} value={filters.minMarginPct} onChange={(e) => { setActivePreset(null); setFilters((f) => ({ ...f, minMarginPct: Number(e.target.value) })); }} className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-bg-subtle accent-accent" aria-label="Minimum margin percent" />
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between border-t border-border/60 pt-3 text-3xs">
        <span className="tabular-nums text-fg-subtle" aria-live="polite">Showing <span className="font-semibold text-fg-strong">{agg.total}</span> of {agg.totalAll}</span>
        {hasFilters ? <button type="button" onClick={clearAll} className="font-medium uppercase tracking-sops text-fg-subtle hover:text-accent">Clear all</button> : null}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* mobile filter toggle */}
      <div className="lg:hidden">
        <button type="button" aria-expanded={mobileFilters} onClick={() => setMobileFilters((v) => !v)} className="btn btn-ghost btn-sm inline-flex items-center gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2.25} /> Filters{activePills.length > 0 ? ` · ${activePills.length} active` : ""}
          {mobileFilters ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
        </button>
        {mobileFilters ? <div className="card mt-2 p-4">{filterRail}</div> : null}
      </div>

      <div className="lg:grid lg:grid-cols-[260px_1fr] lg:gap-4">
        {/* desktop rail */}
        <aside className="hidden lg:block">
          <div className="card sticky top-4 p-4">{filterRail}</div>
        </aside>

        <div className="space-y-4">
          {/* Active-filter summary — always visible, every dimension removable */}
          {activePills.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-accent/30 bg-accent-soft/15 px-3 py-2">
              <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Filtered by
              </span>
              {activePills.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={p.onRemove}
                  className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent-soft/50 px-2 py-0.5 text-3xs font-medium text-accent transition-colors hover:bg-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                >
                  {p.label}
                  <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                  <span className="sr-only">Remove filter</span>
                </button>
              ))}
              <button type="button" onClick={clearAll} className="ml-1 text-3xs font-medium uppercase tracking-sops text-fg-subtle hover:text-accent">
                Clear all
              </button>
              <span className="ml-auto text-3xs tabular-nums text-fg-subtle">
                {agg.total} of {agg.totalAll} products
              </span>
            </div>
          ) : null}

          {/* Hero KPI band */}
          <div className="card overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-500">
            <div className="grid gap-px bg-border/50 lg:grid-cols-[1.5fr_1fr]">
              <div className="bg-bg-raised p-5 sm:p-6">
                <div className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-sops text-accent">
                  <Coins className="h-3.5 w-3.5" strokeWidth={2.25} />
                  Margin in your stock
                </div>
                <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
                  <span className={`text-4xl font-bold tabular-nums ${agg.embedded < 0 ? "text-danger-fg" : "text-fg-strong"}`}>
                    {loading ? "…" : formatIls(agg.embedded)}
                  </span>
                  <span className="mb-1.5 text-sm text-fg-subtle">
                    gross margin held in finished goods
                  </span>
                </div>
                <p className="mt-2 max-w-lg text-sm leading-relaxed text-fg-muted">
                  {loading ? (
                    "Computing margins…"
                  ) : (
                    <>
                      Stock worth{" "}
                      <span className="font-medium tabular-nums text-fg-strong">
                        {formatIls(agg.invCost)}
                      </span>{" "}
                      at cost is{" "}
                      <span className="font-medium tabular-nums text-fg-strong">
                        {formatIls(agg.invSale)}
                      </span>{" "}
                      at sale — that gap is the margin waiting in your warehouse.
                    </>
                  )}
                </p>
                {!loading ? (
                  <p className="mt-1.5 text-3xs text-fg-subtle">
                    {snapshotAge
                      ? `Costs from the latest snapshot · ${snapshotAge}`
                      : "Snapshot age unavailable"}
                  </p>
                ) : null}
                <div className="mt-5">
                  <div className="mb-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Margin composition
                  </div>
                  <MarginRibbon
                    skus={filteredMeasured}
                    active={filters.margin}
                    onToggle={(k) => toggleFacet("margin", k)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-px bg-border/50">
                <HeroStat label="Stock-weighted margin" value={loading ? "…" : formatPct(agg.stockMargin)} sub={loading ? undefined : agg.avgMargin != null ? `simple avg ${formatPct(agg.avgMargin)}` : undefined} hint="Margin in stock ÷ inventory at sale price — the true blended margin of what you're holding, weighted by value." />
                <HeroStat label="Measured" value={loading ? "…" : `${agg.measured}`} sub={loading ? undefined : `of ${agg.total} in view`} hint="SKUs with a computable margin: COGS complete AND a sale price set." tone="success" />
                <HeroStat label="Margin spread" value={loading || agg.minMargin == null ? "…" : `${agg.minMargin.toFixed(0)}–${agg.maxMargin?.toFixed(0)}%`} sub={loading ? undefined : agg.avgMargin != null ? `avg ${formatPct(agg.avgMargin)}` : undefined} hint="Lowest to highest gross margin % across measured SKUs in view." tone={agg.loss > 0 ? "warning" : "default"} />
                <HeroStat label="Loss · thin" value={loading ? "…" : `${agg.loss} · ${agg.lowMargin}`} sub="below cost · under 20%" hint="SKUs selling below cost, and SKUs under a 20% margin." tone={agg.loss > 0 ? "danger" : "default"} />
              </div>
            </div>
          </div>

          {loading ? (
            <SectionCard title="Loading…"><div className="h-72 animate-pulse rounded-lg bg-bg-subtle/50" /></SectionCard>
          ) : agg.measured === 0 ? (
            <SectionCard eyebrow="Profitability" title="No products with a full margin in this view" description="Every product in view is missing a sale price or its cost data. Clear a filter, or fix the gaps on the Overview tab.">
              <div className="rounded-lg border border-dashed border-border bg-bg-subtle/40 p-6 text-center text-xs text-fg-subtle">
                <div>{facetCounts.measured} of {all.length} products have enough data to calculate a margin.</div>
                <div className="mt-2 flex items-center justify-center gap-3">
                  {hasFilters ? <button type="button" onClick={clearAll} className="font-medium text-accent hover:underline">Clear filters</button> : null}
                  {onSwitchToOverview ? <button type="button" onClick={onSwitchToOverview} className="font-medium text-accent hover:underline">Go to Overview tab →</button> : null}
                </div>
              </div>
            </SectionCard>
          ) : (
            <>
              {/* Opportunities — what to act on */}
              {oppCards.length > 0 ? (
                <SectionCard
                  eyebrow="Act on this"
                  title="Biggest opportunities"
                  description="Computed from your portfolio and sized in shekels. Click a card to filter the page to exactly those products."
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {oppCards.map((o) => {
                      const Icon = o.icon;
                      return (
                        <button
                          key={o.key}
                          type="button"
                          onClick={o.onClick}
                          className="group relative overflow-hidden rounded-lg border border-border/60 bg-bg-subtle/40 p-3 text-left transition-colors hover:border-border hover:bg-bg-subtle/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                        >
                          <span className={`absolute inset-y-0 left-0 w-1 ${TONE_BG[o.tone]}`} aria-hidden />
                          <div className="flex items-center justify-between gap-2 pl-1.5">
                            <Icon className={`h-4 w-4 ${TONE_TEXT[o.tone]}`} strokeWidth={2.25} />
                            <span className="text-3xs font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                              Filter →
                            </span>
                          </div>
                          <div className={`mt-1.5 pl-1.5 text-xl font-semibold tabular-nums ${TONE_TEXT[o.tone]}`}>
                            {o.value}
                          </div>
                          <div className="mt-0.5 pl-1.5 text-xs font-semibold text-fg-strong">
                            {o.label}
                          </div>
                          <div className="mt-0.5 pl-1.5 text-3xs leading-snug text-fg-muted">
                            {o.sub}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </SectionCard>
              ) : null}

              {/* How to read this — one-line narrative for a first visit */}
              <p className="px-1 text-xs text-fg-muted">
                Pick a card or a filter to focus the view, scan the charts below
                to find a product, then click it to model and apply a new price.
              </p>

              {/* Margin distribution */}
              <SectionCard eyebrow="Distribution" title="Margin shape" description="How many measured products sit in each margin band. Click a bar to filter the whole page to it.">
                <MarginHistogram skus={filteredMeasured} active={filters.margin} onToggleBand={(k) => toggleFacet("margin", k)} />
              </SectionCard>

              {/* Viability matrix */}
              <SectionCard
                eyebrow="Viability matrix"
                title="Margin vs value at stake"
                description="Up = healthier margin; right = more value; bubble = margin locked in stock. Adjust the target below to re-segment. Click any bubble to model it."
                actions={
                  <div role="group" aria-label="Horizontal axis metric" className="flex items-center gap-1 rounded-md border border-border/60 bg-bg-subtle/60 p-0.5">
                    {(Object.keys(X_METRIC_META) as XMetric[]).map((m) => (
                      <button key={m} type="button" aria-pressed={xMetric === m} onClick={() => setXMetric(m)} className={`rounded px-2 py-1.5 text-3xs font-medium transition-colors ${xMetric === m ? "bg-bg-raised text-fg-strong shadow-raised" : "text-fg-subtle hover:text-fg"}`}>{X_METRIC_META[m].label}</button>
                    ))}
                  </div>
                }
              >
                <div className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                    <label className="flex items-center gap-2 text-xs font-medium text-fg-muted"><Target className="h-3.5 w-3.5 text-accent" strokeWidth={2.25} /> Target margin</label>
                    <input type="range" min={0} max={90} step={1} value={targetMargin} onChange={(e) => setTargetMargin(Number(e.target.value))} className="h-1.5 max-w-xs flex-1 cursor-pointer appearance-none rounded-full bg-bg-subtle accent-accent" aria-label="Target margin percent" aria-valuetext={`${targetMargin} percent — ${segmentStats.counts.crown} crown jewels, ${segmentStats.counts.loss} loss-making`} />
                    <span className="text-sm font-bold tabular-nums text-accent">{targetMargin}%</span>
                  </div>
                  <ViabilityMatrix skus={filteredMeasured} targetMarginPct={targetMargin} xMetric={xMetric} medianEmbedded={medianEmbedded} hoverId={hoverId} onHover={setHoverId} onSelect={setSelectedId} />
                  <SegmentLegend counts={segmentStats.counts} embedded={segmentStats.embedded} />
                </div>
              </SectionCard>

              {/* Treemap — the gold map */}
              {filteredMeasured.some((s) => (s.embedded ?? 0) > 0) ? (
                <SectionCard eyebrow="Gold map" title="Where the margin is concentrated" description="Every tile is a product; its area is the gross margin held in its stock, its colour the margin band. The biggest tiles are where your inventory value lives — click a tile to model it.">
                  <MarginTreemap skus={filteredMeasured} onSelect={setSelectedId} />
                </SectionCard>
              ) : null}

              {/* Pareto */}
              {filteredMeasured.some((s) => (s.embedded ?? 0) > 0) ? (
                <SectionCard eyebrow="Margin in stock" title="Where the gold sits" description="SKUs ranked by gross margin locked in current stock. The bold row is where the top SKUs first cover 80% of it. Click to model." contentClassName="px-4 py-2 sm:px-5">
                  <EmbeddedPareto skus={filteredMeasured.filter((s) => (s.embedded ?? 0) !== 0)} total={segmentStats.embedded.crown + segmentStats.embedded.risk + segmentStats.embedded.premium + segmentStats.embedded.review + segmentStats.embedded.loss} onSelect={setSelectedId} />
                </SectionCard>
              ) : null}

              {/* Results table */}
              <SectionCard eyebrow="Products" title={`${agg.total} in view`} description="The filtered set. Sort any column; click a row to model it." contentClassName="p-0">
                <ResultsTable skus={filtered} targetMarginPct={targetMargin} medianEmbedded={medianEmbedded} sort={sort} onSort={setSort} onSelect={setSelectedId} onSwitchToOverview={onSwitchToOverview} />
              </SectionCard>
            </>
          )}
        </div>
      </div>

      <WhatIfSimulator sku={selectedSku} canEdit={canEdit} targetMargin={targetMargin} onClose={() => setSelectedId(null)} onApplied={onPriceApplied} />
    </div>
  );
}
