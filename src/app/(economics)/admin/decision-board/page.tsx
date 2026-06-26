"use client";

// ---------------------------------------------------------------------------
// Product Decision Board — Tranche 080 (created) · 081 (premium rebuild) ·
// 091 (UI amplify → signature "decision cockpit").
//
// Access: planner + admin (the (economics) route group gates on
// planning:execute).
//
// Mission: one screen that answers, per finished product, the only question
// that matters for a small factory — should we PROTECT it, PROMOTE it, FIX ITS
// PRICE, or DROP it — framed around money at stake, and shown transparently.
//
// Single live read endpoint in the browser:
//   GET /api/economics  → COGS, margin, price, inventory value AND the
//                         Shopify-sourced trailing-90-day sales
//                         (qty_sold_90d, order_count_90d, units_prev_90d)
//                         from private_core.v_fg_economics (migrations 0261/0262,
//                         shipped by backend PRs #101 + #102).
// Velocity is the Shopify 90-day sell-through — the factory's complete demand
// signal across every channel.
// Derived in-browser:
//   units 90d    = qty_sold_90d
//   contribution = material_margin_ils × units_sold
//   revenue      = avg_sale_price_ils  × units_sold
//   trend        = last-90d vs prior-90d (units_prev_90d) — 2-point sparkline
//   annualised   = window value × (365 / 90)
// Products missing cost/price are "Needs data" and never plotted — we do not
// ground a recommendation on a number we don't have.
//
// Tranche 091 is presentation-only: same data contract, same testids
// (decision-board / verdict-band / segments / quadrant). The visual language is
// the "Operational Precision" system taken to its peak — a control-tower
// cockpit whose signature is the margin × velocity portfolio map.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Info,
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Scale,
  ShieldCheck,
  Rocket,
  Tag,
  TrendingDown,
  AlertTriangle,
  Moon,
  HelpCircle,
  Coins,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { formatIls, formatPct, formatQtyInt } from "@/lib/utils/format-money";

// ---------------------------------------------------------------------------
// Decision rules — transparent + tunable. Surfaced in the rules popover.
// ---------------------------------------------------------------------------
const MARGIN_HEALTHY_PCT = 25; // ≥ this on price = healthy margin (quadrant Y split)
const MARGIN_THIN_PCT = 10; // < this = thin

// The Shopify read model is a fixed trailing-90-day window.
const WINDOW_DAYS = 90;

type DecisionKey = "star" | "gem" | "workhorse" | "drag" | "loss" | "dormant" | "needs_data";

interface DecisionMeta {
  key: DecisionKey;
  label: string;
  action: string;
  tone: BadgeTone;
  fill: string; // saturated edge color (legend, bubble stroke, accents)
  light: string; // lighter center color, for the bubble's radial body
  icon: LucideIcon;
  blurb: string;
}

// Category palette — moss / petrol-slate / amber / oxide / oxidized-red / slate,
// chosen to sit inside the warm-bone "Operational Precision" world rather than
// generic chart primaries. `light` gives each bubble a lit, dimensional body.
const DECISION: Record<DecisionKey, DecisionMeta> = {
  star: { key: "star", label: "Star", action: "Protect", tone: "success", fill: "#15803d", light: "#4ade80", icon: ShieldCheck, blurb: "Healthy margin, sells well. Protect supply and shelf space." },
  gem: { key: "gem", label: "Hidden gem", action: "Promote", tone: "info", fill: "#1d4ed8", light: "#60a5fa", icon: Rocket, blurb: "Healthy margin, low volume. Push marketing / distribution." },
  workhorse: { key: "workhorse", label: "Workhorse", action: "Fix price", tone: "warning", fill: "#c2620a", light: "#fbbf24", icon: Tag, blurb: "Sells well but margin is thin. Reprice or cut cost." },
  drag: { key: "drag", label: "Drag", action: "Review for drop", tone: "warning", fill: "#9a4209", light: "#f59e0b", icon: TrendingDown, blurb: "Thin margin and low volume. Candidate to drop or relaunch." },
  loss: { key: "loss", label: "Losing money", action: "Act now", tone: "danger", fill: "#c0241f", light: "#f87171", icon: AlertTriangle, blurb: "Sells below cost. Reprice immediately or drop." },
  dormant: { key: "dormant", label: "Not selling", action: "Review", tone: "muted", fill: "#64748b", light: "#cbd5e1", icon: Moon, blurb: "No sales in the window. Review whether to keep listing." },
  needs_data: { key: "needs_data", label: "Needs data", action: "Set cost & price", tone: "muted", fill: "#94a3b8", light: "#e2e8f0", icon: HelpCircle, blurb: "Cost or price missing — cannot judge yet. Complete the data." },
};

// Quadrant cards, in reading order.
const SEGMENT_ORDER: DecisionKey[] = ["star", "gem", "workhorse", "drag", "loss", "dormant", "needs_data"];

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------
interface EconomicsRow {
  item_id: string;
  item_name: string;
  cogs_per_unit_ils: string | null;
  cogs_complete: boolean;
  qty_on_hand: string;
  fg_inventory_value_at_cost: string | null;
  avg_sale_price_ils: string | null;
  material_margin_ils: string | null;
  material_margin_pct: string | null;
  // Shopify-sourced trailing-90-day sales (v_fg_economics, migrations
  // 0261/0262). The view coalesces absent SKUs to 0, so these are non-null.
  qty_sold_90d: string;
  order_count_90d: number;
  units_prev_90d: string;
}
interface EconomicsResponse { rows: EconomicsRow[]; count: number }

type Trend = "up" | "down" | "flat" | "none";

interface DecisionItem {
  id: string;
  name: string;
  cogs: number | null;
  price: number | null;
  marginIls: number | null;
  marginPct: number | null;
  qtyOnHand: number;
  invAtCost: number | null;
  units: number;
  orders: number;
  series: number[]; // [prior-90d units, last-90d units] — oldest→newest
  contribution: number | null;
  revenue: number | null;
  trend: Trend;
  decision: DecisionKey;
}

function toNum(v: string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// The economics read model also carries non-sellables: production intermediates
// (the "*-BASE-*" 23L base liquids — costed but never priced or sold) and a
// non-stock placeholder row. They are not finished products, so they only
// inflated the "needs data" bucket. Exclude them from this finished-product
// decision board. (Authorized by Tom, 2026-06-26.)
function isSellableProduct(itemId: string): boolean {
  return itemId !== "EXCLUDED-NONSTOCK" && !itemId.includes("-BASE-");
}
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Could not load data (HTTP ${res.status}). Try refreshing.`);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Motion primitives — count-ups + skeletons, all reduced-motion safe.
// ---------------------------------------------------------------------------
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function useCountUp(target: number, durationMs = 850): number {
  const reduced = useReducedMotion();
  const [val, setVal] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    if (reduced) { setVal(target); return; }
    const from = fromRef.current;
    let raf = 0;
    let startTs = 0;
    const tick = (ts: number) => {
      if (!startTs) startTs = ts;
      const p = Math.min(1, (ts - startTs) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setVal(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, reduced]);
  return val;
}

function AnimatedNumber({
  value, format, className,
}: { value: number; format: (n: number) => string; className?: string }): JSX.Element {
  const shown = useCountUp(value);
  return <span className={className}>{format(shown)}</span>;
}

function Skeleton({ className }: { className?: string }): JSX.Element {
  return <div className={`animate-pulse-soft rounded-md bg-bg-muted/70 ${className ?? ""}`} aria-hidden />;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function DecisionBoardPage(): JSX.Element {
  const windowDays = WINDOW_DAYS;
  // The Shopify window is a true trailing-90-day span, so annualisation is the
  // honest 365/90 — no variable-span correction needed.
  const annualise = 365 / windowDays;

  const econQuery = useQuery<EconomicsResponse>({
    queryKey: ["decision-board", "economics"],
    queryFn: () => fetchJson<EconomicsResponse>("/api/economics"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // Velocity comes from the Economics read model (Shopify-sourced 90-day
  // sales). buckets = [prior-90d, last-90d] drive a quarter-over-quarter trend
  // plus the 2-point sparkline.
  const velocityByItem = useMemo(() => {
    const map = new Map<string, { units: number; orders: number; buckets: { key: string; qty: number }[] }>();
    for (const r of econQuery.data?.rows ?? []) {
      const units = toNum(r.qty_sold_90d) ?? 0;
      const prev = toNum(r.units_prev_90d) ?? 0;
      map.set(r.item_id, {
        units,
        orders: r.order_count_90d ?? 0,
        buckets: [{ key: "1_prior", qty: prev }, { key: "2_current", qty: units }],
      });
    }
    return map;
  }, [econQuery.data]);

  const items = useMemo<DecisionItem[]>(() => {
    const rows = (econQuery.data?.rows ?? []).filter((r) => isSellableProduct(r.item_id));
    const selling: number[] = [];
    for (const r of rows) {
      const v = velocityByItem.get(r.item_id);
      if (v && v.units > 0) selling.push(v.units);
    }
    const velMedian = median(selling);

    return rows.map((r) => {
      const cogs = toNum(r.cogs_per_unit_ils);
      const price = toNum(r.avg_sale_price_ils);
      const marginIls = toNum(r.material_margin_ils);
      const marginPct = toNum(r.material_margin_pct);
      const v = velocityByItem.get(r.item_id);
      const units = v?.units ?? 0;
      const orders = v?.orders ?? 0;
      const series = v ? [...v.buckets].sort((a, b) => a.key.localeCompare(b.key)).map((b) => b.qty) : [];

      const needsData = !r.cogs_complete || cogs == null || price == null || marginPct == null;
      const contribution = marginIls != null ? marginIls * units : null;
      const revenue = price != null ? price * units : null;

      let trend: Trend = "none";
      if (series.length >= 2) {
        const last = series[series.length - 1];
        const prev = series[series.length - 2];
        trend = last > prev * 1.1 ? "up" : last < prev * 0.9 ? "down" : "flat";
      }

      let decision: DecisionKey;
      if (needsData) decision = "needs_data";
      else if (marginPct! < 0) decision = "loss";
      else if (units === 0) decision = "dormant";
      else {
        const hiM = marginPct! >= MARGIN_HEALTHY_PCT;
        const hiV = units >= velMedian;
        decision = hiM ? (hiV ? "star" : "gem") : hiV ? "workhorse" : "drag";
      }

      return {
        id: r.item_id, name: r.item_name, cogs, price, marginIls, marginPct,
        qtyOnHand: toNum(r.qty_on_hand) ?? 0, invAtCost: toNum(r.fg_inventory_value_at_cost),
        units, orders, series, contribution, revenue, trend, decision,
      };
    });
  }, [econQuery.data, velocityByItem]);

  const velMedian = useMemo(() => median(items.filter((i) => i.units > 0).map((i) => i.units)), [items]);

  const kpis = useMemo(() => {
    const measurable = items.filter((i) => i.contribution != null);
    const profitPool = measurable.reduce((s, i) => s + (i.contribution ?? 0), 0);
    const lossItems = items.filter((i) => i.marginPct != null && i.marginPct < 0 && i.units > 0);
    const riskPerWindow = lossItems.reduce((s, i) => s + Math.abs(i.contribution ?? 0), 0);
    const needsData = items.filter((i) => i.decision === "needs_data").length;
    const contribDesc = measurable.map((i) => i.contribution ?? 0).filter((c) => c > 0).sort((a, b) => b - a);
    const top3 = contribDesc.slice(0, 3).reduce((s, c) => s + c, 0);
    const concentration = profitPool > 0 ? (top3 / profitPool) * 100 : null;
    return {
      profitPool, profitPoolAnnual: profitPool * annualise,
      lossCount: lossItems.length, riskAnnual: riskPerWindow * annualise,
      needsData, concentration, measurableCount: measurable.length,
    };
  }, [items, annualise]);

  const segments = useMemo(() => {
    const out = new Map<DecisionKey, { count: number; contribution: number }>();
    SEGMENT_ORDER.forEach((k) => out.set(k, { count: 0, contribution: 0 }));
    for (const i of items) {
      const s = out.get(i.decision)!;
      s.count += 1;
      s.contribution += i.contribution ?? 0;
    }
    return out;
  }, [items]);

  const maxSegmentCount = useMemo(
    () => Math.max(1, ...SEGMENT_ORDER.map((k) => segments.get(k)?.count ?? 0)),
    [segments],
  );

  // -- interaction + table state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<DecisionKey | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("contribution");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const tableRows = useMemo(() => {
    const base = filter ? items.filter((i) => i.decision === filter) : items;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      const av = sortValue(a, sortKey), bv = sortValue(b, sortKey);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [items, filter, sortKey, sortDir]);

  const maxRowContribution = useMemo(
    () => Math.max(1, ...tableRows.map((i) => Math.abs(i.contribution ?? 0))),
    [tableRows],
  );

  const onSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "name" ? "asc" : "desc"); }
  };

  const active = items.find((i) => i.id === activeId) ?? null;
  const isLoading = econQuery.isLoading;
  const isError = econQuery.isError;
  const verdict = buildVerdict(kpis, items.length);

  // Full read failure: show one honest error state with a retry — never a
  // zero-data "all products priced above cost" verdict that reads as success.
  if (isError) {
    return (
      <div className="space-y-5" data-testid="decision-board">
        <WorkflowHeader
          eyebrow="Economics"
          title="Product Decision Board"
          description="Every finished product placed on margin × velocity — so the next move is obvious: protect, promote, reprice, or drop."
          actions={<SourcePill />}
        />
        <SectionCard tone="danger" density="compact">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-danger/15">
                <AlertTriangle className="h-5 w-5 text-danger-fg" />
              </span>
              <div>
                <div className="text-base font-semibold text-fg-strong">We couldn&apos;t load the product portfolio</div>
                <div className="mt-0.5 text-sm text-fg-muted">Try again in a moment. If it keeps failing, contact the system administrator.</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => econQuery.refetch()}
              className="shrink-0 self-start rounded-lg border border-fg/15 bg-bg px-3.5 py-2 text-sm font-semibold text-fg-strong shadow-sm transition-all hover:-translate-y-px hover:border-fg/25 hover:shadow-pop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:self-auto"
            >
              Try again
            </button>
          </div>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="decision-board">
      <WorkflowHeader
        eyebrow="Economics"
        title="Product Decision Board"
        description="Every finished product placed on margin × velocity — so the next move is obvious: protect, promote, reprice, or drop."
        actions={
          <div className="flex items-center gap-2">
            <SourcePill />
            <RulesPopover velMedian={velMedian} windowDays={windowDays} />
          </div>
        }
      />

      {/* Verdict band — the single most important thing right now */}
      <VerdictBand verdict={verdict} loading={isLoading} onAct={() => verdict.filter && setFilter(verdict.filter)} />

      {/* Vitals — the cockpit readout strip */}
      <VitalsRow kpis={kpis} total={items.length} loading={isLoading} />

      {/* Decision segments — the portfolio strip: clickable filters with money attached */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7" data-testid="segments">
        {(["star", "gem", "workhorse", "drag", "loss", "dormant", "needs_data"] as DecisionKey[]).map((k) => (
          <SegmentCard
            key={k}
            meta={DECISION[k]}
            count={segments.get(k)?.count ?? 0}
            contribution={segments.get(k)?.contribution ?? 0}
            maxCount={maxSegmentCount}
            active={filter === k}
            onClick={() => setFilter((f) => (f === k ? null : k))}
            loading={isLoading}
          />
        ))}
      </div>

      {/* Portfolio map + readout inspector */}
      <div className="grid gap-4 lg:grid-cols-[1.9fr_1fr]">
        <SectionCard
          eyebrow="The signature view"
          title="Portfolio map"
          description="Right = sells more · Up = higher margin · bubble = money it contributes. Select any product to read it."
        >
          {isLoading ? (
            <QuadrantSkeleton />
          ) : (
            <Quadrant items={items} velMedian={velMedian} activeId={activeId} onHover={setActiveId} windowDays={windowDays} />
          )}
        </SectionCard>
        <SectionCard eyebrow="Readout" title="Inspector" density="compact">
          <Inspector item={active} windowDays={windowDays} annualise={annualise} velMedian={velMedian} />
        </SectionCard>
      </div>

      {/* Table */}
      <SectionCard
        title="All products"
        description={filter ? `Filtered: ${DECISION[filter].label}. Click the chip again to clear.` : "Sorted by contribution. Click a segment above to filter."}
        actions={filter ? (
          <button type="button" onClick={() => setFilter(null)} className="text-xs font-medium text-fg-subtle underline-offset-2 hover:underline">
            Clear filter
          </button>
        ) : null}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-3xs uppercase tracking-sops text-fg-subtle">
                <SortTh label="Product" k="name" sortKey={sortKey} dir={sortDir} onSort={onSort} />
                <th className="px-2 py-2 font-semibold">Decision</th>
                <SortTh label="Margin %" k="marginPct" sortKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
                <SortTh label={`Contribution ${windowDays}d`} k="contribution" sortKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
                <SortTh label={`Units ${windowDays}d`} k="units" sortKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
                <th className="px-2 py-2 text-center font-semibold">Trend</th>
                <SortTh label="Stock @ cost" k="invAtCost" sortKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, idx) => (
                  <tr key={`sk-${idx}`} className="border-b border-border/30">
                    <td className="px-2 py-2.5" colSpan={7}><Skeleton className="h-5 w-full" /></td>
                  </tr>
                ))
              ) : (
                tableRows.map((i) => {
                  const d = DECISION[i.decision];
                  const isActive = activeId === i.id;
                  const contribShare = i.contribution != null ? Math.abs(i.contribution) / maxRowContribution : 0;
                  return (
                    <tr
                      key={i.id}
                      tabIndex={0}
                      aria-label={`Inspect ${i.name}`}
                      onMouseEnter={() => setActiveId(i.id)}
                      onClick={() => setActiveId(i.id)}
                      onFocus={() => setActiveId(i.id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActiveId(i.id); } }}
                      className={`group cursor-pointer border-b border-border/30 transition-colors hover:bg-bg-subtle/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 ${isActive ? "bg-bg-subtle/60" : ""}`}
                    >
                      <td className="px-2 py-2 font-medium text-fg-strong">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 shrink-0 rounded-full ring-2 ring-inset ring-bg" style={{ backgroundColor: d.fill }} aria-hidden />
                          <span className="truncate">{i.name}</span>
                        </span>
                      </td>
                      <td className="px-2 py-2"><Badge tone={d.tone}>{d.label}</Badge></td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {i.marginPct != null ? <span className={i.marginPct < 0 ? "font-semibold text-danger-fg" : ""}>{formatPct(i.marginPct, 1)}</span> : <span className="text-fg-subtle">—</span>}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {i.contribution != null ? (
                          <span className="inline-flex flex-col items-end gap-1">
                            <span className={i.contribution < 0 ? "text-danger-fg" : "text-fg-strong"}>{formatIls(i.contribution)}</span>
                            <span className="h-1 w-16 overflow-hidden rounded-full bg-bg-muted/70" aria-hidden>
                              <span
                                className="block h-full rounded-full transition-[width] duration-500"
                                style={{ width: `${Math.max(4, contribShare * 100)}%`, backgroundColor: i.contribution < 0 ? DECISION.loss.fill : d.fill, opacity: 0.85 }}
                              />
                            </span>
                          </span>
                        ) : <span className="text-fg-subtle">—</span>}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {i.units > 0 ? formatQtyInt(i.units) : <span className="text-fg-subtle">0</span>}
                      </td>
                      <td className="px-1 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <Sparkline values={i.series} trend={i.trend} />
                          <TrendIcon trend={i.trend} />
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-fg-subtle">
                        {i.invAtCost != null ? formatIls(i.invAtCost) : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
              {!isLoading && tableRows.length === 0 ? (
                <tr><td colSpan={7} className="px-2 py-8 text-center text-sm text-fg-subtle">No products match this filter.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------
type SortKey = "name" | "marginPct" | "contribution" | "units" | "invAtCost";
function sortValue(i: DecisionItem, k: SortKey): number | string | null {
  switch (k) {
    case "name": return i.name;
    case "marginPct": return i.marginPct;
    case "contribution": return i.contribution;
    case "units": return i.units;
    case "invAtCost": return i.invAtCost;
  }
}

// ---------------------------------------------------------------------------
// Source pill — replaces the old single-option window toggle (a toggle with one
// choice is a fake control). States the honest data window instead.
// ---------------------------------------------------------------------------
function SourcePill(): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-bg-subtle/50 px-2.5 py-1.5 text-2xs font-medium text-fg-subtle">
      <span className="dot bg-accent animate-pulse-soft" aria-hidden />
      Last 90 days · Shopify sell-through
    </span>
  );
}

// ---------------------------------------------------------------------------
// Verdict band
// ---------------------------------------------------------------------------
interface Verdict {
  tone: "danger" | "warning" | "success";
  headline: string;
  sub: string;
  cta: string | null;
  filter: DecisionKey | null;
}
function buildVerdict(
  k: { lossCount: number; riskAnnual: number; needsData: number; concentration: number | null; profitPoolAnnual: number },
  total: number,
): Verdict {
  if (k.lossCount > 0) {
    return {
      tone: "danger",
      headline: `${k.lossCount} product${k.lossCount > 1 ? "s" : ""} sell below cost`,
      sub: `Leaking about ${formatIls(k.riskAnnual)}/yr at the current pace. Reprice or drop them first.`,
      cta: "Show losing products", filter: "loss",
    };
  }
  if (k.needsData > 0) {
    return {
      tone: "warning",
      headline: `${k.needsData} product${k.needsData > 1 ? "s" : ""} can't be judged yet`,
      sub: "Set a cost and a sale price so they enter the decision quadrant.",
      cta: "Show what's missing", filter: "needs_data",
    };
  }
  return {
    tone: "success",
    headline: `All ${total} products are priced above cost`,
    sub: k.concentration != null
      ? `Annual profit pool ≈ ${formatIls(k.profitPoolAnnual)}. Top 3 products drive ${formatPct(k.concentration, 0)} of it — protect them.`
      : `Annual profit pool ≈ ${formatIls(k.profitPoolAnnual)}.`,
    cta: null, filter: null,
  };
}

function VerdictBand({ verdict, loading, onAct }: { verdict: Verdict; loading?: boolean; onAct: () => void }): JSX.Element {
  const toneRing: Record<Verdict["tone"], string> = {
    danger: "border-danger/40 bg-gradient-to-br from-danger/[0.07] to-transparent",
    warning: "border-warning/40 bg-gradient-to-br from-warning/[0.07] to-transparent",
    success: "border-success/40 bg-gradient-to-br from-success/[0.07] to-transparent",
  };
  // Full literal classes (not runtime-concatenated) so the Tailwind JIT emits them.
  const badgeBg: Record<Verdict["tone"], string> = { danger: "bg-danger/15", warning: "bg-warning/15", success: "bg-success/15" };
  const badgePulse: Record<Verdict["tone"], string> = { danger: "bg-danger/25", warning: "bg-warning/25", success: "bg-success/25" };
  const fg: Record<Verdict["tone"], string> = { danger: "text-danger-fg", warning: "text-warning-fg", success: "text-success-fg" };
  const Icon = verdict.tone === "danger" ? AlertTriangle : verdict.tone === "warning" ? HelpCircle : ShieldCheck;
  return (
    <div
      data-testid="verdict-band"
      className={`reveal flex flex-col gap-3 rounded-xl border p-4 shadow-raised sm:flex-row sm:items-center sm:justify-between sm:p-5 ${toneRing[verdict.tone]}`}
    >
      <div className="flex items-start gap-3.5">
        <span className={`relative mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${badgeBg[verdict.tone]}`}>
          {!loading && verdict.tone === "danger" ? (
            <span className={`absolute inset-0 rounded-xl ${badgePulse[verdict.tone]} animate-pulse-soft`} aria-hidden />
          ) : null}
          <Icon className={`relative h-5.5 w-5.5 ${fg[verdict.tone]}`} />
        </span>
        <div className="min-w-0">
          <div className="text-2xs font-semibold uppercase tracking-sops text-fg-subtle">The call right now</div>
          <div className="mt-0.5 text-lg font-bold tracking-tight text-fg-strong">{loading ? "Reading the numbers…" : verdict.headline}</div>
          <div className="mt-0.5 text-sm leading-relaxed text-fg-muted">{loading ? " " : verdict.sub}</div>
        </div>
      </div>
      {!loading && verdict.cta ? (
        <button
          type="button"
          onClick={onAct}
          className="group shrink-0 self-start rounded-lg border border-fg/15 bg-bg px-3.5 py-2 text-sm font-semibold text-fg-strong shadow-sm transition-all hover:-translate-y-px hover:border-fg/25 hover:shadow-pop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:self-auto"
        >
          <span className="inline-flex items-center gap-1.5">
            {verdict.cta}
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vitals — the cockpit readout strip (animated, meaning-bar backed)
// ---------------------------------------------------------------------------
function VitalsRow({
  kpis, total, loading,
}: {
  kpis: { profitPoolAnnual: number; riskAnnual: number; concentration: number | null; needsData: number; measurableCount: number; lossCount: number };
  total: number; loading?: boolean;
}): JSX.Element {
  const coverage = total > 0 ? kpis.measurableCount / total : 0;
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
      <VitalTile
        icon={Coins}
        tone="accent"
        label="Annual profit pool"
        loading={loading}
        value={<AnimatedNumber value={kpis.profitPoolAnnual} format={(n) => formatIls(n)} />}
        sub={kpis.concentration != null ? `Top 3 drive ${formatPct(kpis.concentration, 0)}` : "At the current 90-day pace"}
        meter={kpis.concentration != null ? Math.min(1, kpis.concentration / 100) : null}
      />
      <VitalTile
        icon={AlertTriangle}
        tone={kpis.lossCount > 0 ? "danger" : "success"}
        label="Profit at risk"
        loading={loading}
        value={kpis.lossCount > 0
          ? <AnimatedNumber value={kpis.riskAnnual} format={(n) => formatIls(n)} />
          : <span>None</span>}
        sub={kpis.lossCount > 0 ? `${kpis.lossCount} sold below cost · per year` : "Nothing selling below cost"}
        meter={null}
      />
      <VitalTile
        icon={HelpCircle}
        tone={kpis.needsData > 0 ? "warning" : "success"}
        label="Data coverage"
        loading={loading}
        value={<span><AnimatedNumber value={kpis.measurableCount} format={(n) => formatQtyInt(Math.round(n))} /><span className="text-fg-subtle">/{total}</span></span>}
        sub={kpis.needsData > 0 ? `${kpis.needsData} need cost or price` : "Every product can be judged"}
        meter={coverage}
      />
    </div>
  );
}

function VitalTile({
  icon: Icon, tone, label, value, sub, meter, loading,
}: {
  icon: LucideIcon;
  tone: "accent" | "danger" | "warning" | "success";
  label: string;
  value: JSX.Element;
  sub: string;
  meter: number | null;
  loading?: boolean;
}): JSX.Element {
  const toneText: Record<string, string> = { accent: "text-accent", danger: "text-danger-fg", warning: "text-warning-fg", success: "text-success-fg" };
  const toneBar: Record<string, string> = { accent: "bg-accent", danger: "bg-danger", warning: "bg-warning", success: "bg-success" };
  const toneChip: Record<string, string> = {
    accent: "bg-accent-soft text-accent", danger: "bg-danger-softer text-danger-fg",
    warning: "bg-warning-softer text-warning-fg", success: "bg-success-softer text-success-fg",
  };
  return (
    <div className="card flex flex-col gap-2.5 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xs font-semibold uppercase tracking-sops text-fg-subtle">{label}</span>
        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${toneChip[tone]}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      {loading ? (
        <Skeleton className="h-7 w-28" />
      ) : (
        <div className={`text-2xl font-bold tabular-nums tracking-tight ${toneText[tone]}`}>{value}</div>
      )}
      <div className="text-2xs text-fg-subtle">{loading ? " " : sub}</div>
      {meter != null && !loading ? (
        <div className="h-1 w-full overflow-hidden rounded-full bg-bg-muted/70" aria-hidden>
          <div className={`h-full rounded-full ${toneBar[tone]} transition-[width] duration-700 ease-out-quart`} style={{ width: `${Math.max(3, meter * 100)}%`, opacity: 0.85 }} />
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Segment card — the portfolio strip tile
// ---------------------------------------------------------------------------
function SegmentCard({
  meta, count, contribution, maxCount, active, onClick, loading,
}: {
  meta: DecisionMeta; count: number; contribution: number; maxCount: number; active: boolean; onClick: () => void; loading?: boolean;
}): JSX.Element {
  const Icon = meta.icon;
  const share = maxCount > 0 ? count / maxCount : 0;
  const moneyLine = meta.key === "loss" || meta.key === "drag"
    ? contribution < 0 ? `${formatIls(contribution)} drain` : meta.action
    : count > 0 && contribution > 0 ? formatIls(contribution) : meta.action;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={`segment-${meta.key}`}
      className={`group relative flex cursor-pointer flex-col gap-2 overflow-hidden rounded-xl border p-3 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
        active
          ? "border-fg/30 bg-bg-subtle/70 shadow-pop -translate-y-px"
          : "border-border/60 hover:-translate-y-px hover:border-fg/20 hover:bg-bg-subtle/40 hover:shadow-raised"
      }`}
    >
      {/* category accent edge */}
      <span className="absolute inset-x-0 top-0 h-0.5" style={{ backgroundColor: meta.fill, opacity: active ? 0.9 : 0.5 }} aria-hidden />
      <div className="flex items-center gap-1.5">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-md" style={{ backgroundColor: `${meta.fill}1f` }}>
          <Icon className="h-3.5 w-3.5" style={{ color: meta.fill }} />
        </span>
        <span className="text-2xs font-semibold uppercase tracking-sops text-fg-subtle">{meta.label}</span>
      </div>
      <div className="text-2xl font-bold tabular-nums tracking-tight text-fg-strong">{loading ? <span className="text-fg-faint">·</span> : count}</div>
      {/* share-of-portfolio micro-bar */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-bg-muted/60" aria-hidden>
        <div className="h-full rounded-full transition-[width] duration-500 ease-out-quart" style={{ width: loading ? "0%" : `${Math.max(count > 0 ? 8 : 0, share * 100)}%`, backgroundColor: meta.fill, opacity: 0.8 }} />
      </div>
      <div className="text-2xs text-fg-subtle">{loading ? " " : moneyLine}</div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Sparkline (zero-dependency)
// ---------------------------------------------------------------------------
function Sparkline({ values, trend }: { values: number[]; trend: Trend }): JSX.Element {
  const w = 52, h = 18, pad = 2;
  if (values.length < 2) return <span className="inline-block" style={{ width: w }} />;
  const max = Math.max(...values), min = Math.min(...values);
  const span = max - min || 1;
  const stroke = trend === "up" ? DECISION.star.fill : trend === "down" ? DECISION.loss.fill : "#94a3b8";
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - min) / span) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const lastX = pad + (w - pad * 2), lastY = pad + (1 - (values[values.length - 1] - min) / span) * (h - pad * 2);
  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden>
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r={1.8} fill={stroke} />
    </svg>
  );
}

function TrendIcon({ trend }: { trend: Trend }): JSX.Element {
  if (trend === "up") return <ArrowUpRight className="h-4 w-4 text-success-fg" aria-label="rising" />;
  if (trend === "down") return <ArrowDownRight className="h-4 w-4 text-danger-fg" aria-label="falling" />;
  if (trend === "flat") return <Minus className="h-4 w-4 text-fg-subtle" aria-label="flat" />;
  return <span className="text-fg-subtle">—</span>;
}

function SortTh({
  label, k, sortKey, dir, onSort, align = "left",
}: {
  label: string; k: SortKey; sortKey: SortKey; dir: "asc" | "desc"; onSort: (k: SortKey) => void; align?: "left" | "right";
}): JSX.Element {
  const activeCol = sortKey === k;
  return (
    <th className={`px-2 py-2 font-semibold ${align === "right" ? "text-right" : "text-left"}`}>
      <button type="button" onClick={() => onSort(k)} className={`inline-flex items-center gap-1 hover:text-fg ${align === "right" ? "flex-row-reverse" : ""} ${activeCol ? "text-fg" : ""}`}>
        {label}
        {activeCol ? (dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Inspector — the readout panel
// ---------------------------------------------------------------------------
function Inspector({
  item, windowDays, annualise, velMedian,
}: { item: DecisionItem | null; windowDays: number; annualise: number; velMedian: number }): JSX.Element {
  if (!item) {
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 py-8 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-bg-subtle/70 ring-1 ring-border/60">
          <Scale className="h-6 w-6 text-fg-subtle/60" />
        </span>
        <p className="max-w-[14rem] text-sm text-fg-subtle">Select a product — tap a bubble on the map or a row in the table — to read its full breakdown.</p>
      </div>
    );
  }
  const d = DECISION[item.decision];
  const Icon = d.icon;
  const annualContribution = item.contribution != null ? item.contribution * annualise : null;
  return (
    <div className="space-y-3.5" data-testid="inspector">
      <div>
        <div className="text-base font-bold tracking-tight text-fg-strong">{item.name}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: `${d.fill}1f`, color: d.fill }}>
            <Icon className="h-3.5 w-3.5" /> {d.label}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-fg">
            <ArrowUpRight className="h-3.5 w-3.5 text-fg-subtle" /> {d.action}
          </span>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-fg-subtle">{d.blurb}</p>

      {/* calibrated gauges */}
      {item.marginPct != null ? (
        <GaugeBar
          label="Margin"
          valueLabel={formatPct(item.marginPct, 1)}
          fraction={clamp01((item.marginPct) / 50)}
          markerFraction={clamp01(MARGIN_HEALTHY_PCT / 50)}
          markerLabel="healthy"
          color={item.marginPct < 0 ? DECISION.loss.fill : d.fill}
          negative={item.marginPct < 0}
        />
      ) : null}
      {item.units > 0 || velMedian > 0 ? (
        <GaugeBar
          label="Velocity"
          valueLabel={`${formatQtyInt(item.units)} u`}
          fraction={clamp01(velMedian > 0 ? item.units / (velMedian * 2) : 0)}
          markerFraction={0.5}
          markerLabel="median"
          color={d.fill}
        />
      ) : null}

      {item.series.length >= 2 ? (
        <div className="flex items-center justify-between rounded-lg border border-border/50 bg-bg-subtle/40 px-3 py-2">
          <span className="text-2xs uppercase tracking-sops text-fg-subtle">90d vs prior 90d</span>
          <span className="flex items-center gap-1.5"><Sparkline values={item.series} trend={item.trend} /><TrendIcon trend={item.trend} /></span>
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-border/50 pt-3 text-sm">
        <Stat label="Margin / unit" value={item.marginIls != null ? formatIls(item.marginIls) : "—"} />
        <Stat label={`Orders ${windowDays}d`} value={String(item.orders)} />
        <Stat label={`Contribution ${windowDays}d`} value={item.contribution != null ? formatIls(item.contribution) : "—"} strong danger={item.contribution != null && item.contribution < 0} />
        <Stat label="Annualised" value={annualContribution != null ? formatIls(annualContribution) : "—"} strong danger={annualContribution != null && annualContribution < 0} />
        <Stat label="Sale price" value={item.price != null ? formatIls(item.price) : "—"} />
        <Stat label="Unit cost" value={item.cogs != null ? formatIls(item.cogs) : "—"} />
        <Stat label="On hand" value={formatQtyInt(item.qtyOnHand)} />
        <Stat label="Stock @ cost" value={item.invAtCost != null ? formatIls(item.invAtCost) : "—"} />
      </dl>
    </div>
  );
}

function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }

function GaugeBar({
  label, valueLabel, fraction, markerFraction, markerLabel, color, negative,
}: {
  label: string; valueLabel: string; fraction: number; markerFraction?: number; markerLabel?: string; color: string; negative?: boolean;
}): JSX.Element {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-2xs">
        <span className="font-semibold uppercase tracking-sops text-fg-subtle">{label}</span>
        <span className={`tabular-nums font-semibold ${negative ? "text-danger-fg" : "text-fg"}`}>{valueLabel}</span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-bg-muted/70">
        <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out-quart" style={{ width: `${Math.max(2, fraction * 100)}%`, backgroundColor: color, opacity: 0.85 }} />
        {markerFraction != null ? (
          <div className="absolute inset-y-0 w-px bg-fg/40" style={{ left: `${markerFraction * 100}%` }} aria-label={markerLabel} />
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value, strong, danger }: { label: string; value: string; strong?: boolean; danger?: boolean }): JSX.Element {
  return (
    <div>
      <dt className="text-3xs uppercase tracking-sops text-fg-subtle">{label}</dt>
      <dd className={`tabular-nums ${danger ? "font-semibold text-danger-fg" : strong ? "font-semibold text-fg-strong" : "text-fg"}`}>{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rules popover
// ---------------------------------------------------------------------------
function RulesPopover({ velMedian, windowDays }: { velMedian: number; windowDays: number }): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs font-medium text-fg-subtle transition-colors hover:bg-bg-subtle/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <Info className="h-3.5 w-3.5" /> How it decides
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-border/60 bg-bg-raised p-3 text-xs shadow-pop">
          <p className="mb-2 font-semibold text-fg-strong">Transparent rules</p>
          <ul className="space-y-1.5 text-fg-subtle">
            <li>• <b className="text-fg">Healthy</b> margin ≥ {MARGIN_HEALTHY_PCT}% · <b className="text-fg">thin</b> &lt; {MARGIN_THIN_PCT}%.</li>
            <li>• <b className="text-fg">High velocity</b> = units sold ≥ this factory&apos;s median of selling products ({formatQtyInt(velMedian)} in {windowDays}d).</li>
            <li>• <b className="text-success-fg">Star</b>: healthy + high velocity → protect.</li>
            <li>• <b className="text-info-fg">Hidden gem</b>: healthy + low velocity → promote.</li>
            <li>• <b className="text-warning-fg">Workhorse</b>: thin + high velocity → reprice.</li>
            <li>• <b className="text-warning-fg">Drag</b>: thin + low velocity → review for drop.</li>
            <li>• <b className="text-danger-fg">Losing money</b>: sells below cost → act now.</li>
            <li>• <b>Needs data</b>: cost or price missing → excluded from the quadrant.</li>
          </ul>
          <p className="mt-2 border-t border-border/40 pt-2 text-3xs text-fg-subtle">
            Velocity from Shopify sell-through (last 90 days vs the prior 90). Revenue uses the manual average sale price until automated price snapshots land.
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quadrant skeleton
// ---------------------------------------------------------------------------
function QuadrantSkeleton(): JSX.Element {
  return (
    <div className="relative h-[520px] w-full overflow-hidden rounded-lg bg-bg-subtle/30">
      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px opacity-60">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-bg-muted/30" />)}
      </div>
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 text-sm text-fg-subtle">
        <span className="dot bg-accent animate-pulse-soft" /> Plotting the portfolio…
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quadrant — zero-dependency interactive SVG scatter, elevated into the
// signature "portfolio map": radial-bodied bubbles, a calm halo on the
// highest-value products, refined grid + reference chips, hover crosshair.
// ---------------------------------------------------------------------------
function Quadrant({
  items, velMedian, activeId, onHover, windowDays,
}: {
  items: DecisionItem[]; velMedian: number; activeId: string | null; onHover: (id: string | null) => void; windowDays: number;
}): JSX.Element {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 30); return () => clearTimeout(t); }, []);

  const plotted = items.filter((i) => i.decision !== "needs_data" && i.marginPct != null);

  const W = 880, H = 520, padL = 60, padR = 24, padT = 28, padB = 52;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const peakUnits = Math.max(0, ...plotted.map((i) => i.units));
  // Headroom so the largest bubble (and its label) sits inside the frame.
  const maxUnits = Math.max(velMedian * 2, peakUnits * 1.12, 10);
  const margins = plotted.map((i) => i.marginPct ?? 0);
  const maxMargin = Math.max(40, Math.ceil((Math.max(0, ...margins) + 5) / 10) * 10);
  const minMargin = Math.min(0, Math.floor((Math.min(0, ...margins) - 5) / 10) * 10);

  const xOf = (u: number) => padL + (u / maxUnits) * plotW;
  const yOf = (m: number) => padT + (1 - (m - minMargin) / (maxMargin - minMargin || 1)) * plotH;
  const maxContrib = Math.max(1, ...plotted.map((i) => Math.abs(i.contribution ?? 0)));
  const rOf = (c: number | null) => 6 + Math.sqrt(Math.abs(c ?? 0) / maxContrib) * 24;

  const xSplit = xOf(velMedian), ySplit = yOf(MARGIN_HEALTHY_PCT), yZero = yOf(0);

  // y gridline ticks every 10/20% depending on range
  const step = maxMargin - minMargin > 80 ? 20 : 10;
  const yTicks: number[] = [];
  for (let m = minMargin; m <= maxMargin + 0.001; m += step) yTicks.push(m);
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxUnits);

  // top contributors get a name label + a calm halo
  const ranked = [...plotted].sort((a, b) => Math.abs(b.contribution ?? 0) - Math.abs(a.contribution ?? 0));
  const labelled = new Set(ranked.slice(0, 5).map((i) => i.id));
  const haloed = new Set(ranked.slice(0, 3).map((i) => i.id));
  const active = plotted.find((i) => i.id === activeId) ?? null;

  // unique gradient ids per decision key
  const keys: DecisionKey[] = ["star", "gem", "workhorse", "drag", "loss", "dormant"];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="group" aria-label="Margin versus velocity portfolio map. Each product is a selectable point; the table below lists every product." data-testid="quadrant">
      <defs>
        <clipPath id="db-plot"><rect x={padL} y={padT} width={plotW} height={plotH} /></clipPath>
        <filter id="db-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        {keys.map((k) => (
          <radialGradient key={k} id={`db-grad-${k}`} cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor={DECISION[k].light} stopOpacity={0.95} />
            <stop offset="100%" stopColor={DECISION[k].fill} stopOpacity={0.92} />
          </radialGradient>
        ))}
      </defs>

      {/* quadrant tints */}
      <g clipPath="url(#db-plot)">
        <rect x={xSplit} y={padT} width={padL + plotW - xSplit} height={ySplit - padT} fill={DECISION.star.fill} opacity={0.05} />
        <rect x={padL} y={padT} width={xSplit - padL} height={ySplit - padT} fill={DECISION.gem.fill} opacity={0.05} />
        <rect x={xSplit} y={ySplit} width={padL + plotW - xSplit} height={padT + plotH - ySplit} fill={DECISION.workhorse.fill} opacity={0.06} />
        <rect x={padL} y={ySplit} width={xSplit - padL} height={padT + plotH - ySplit} fill={DECISION.drag.fill} opacity={0.06} />
        {minMargin < 0 ? <rect x={padL} y={yZero} width={plotW} height={padT + plotH - yZero} fill={DECISION.loss.fill} opacity={0.07} /> : null}
      </g>

      {/* y gridlines + labels */}
      {yTicks.map((m) => (
        <g key={`y${m}`}>
          <line x1={padL} y1={yOf(m)} x2={padL + plotW} y2={yOf(m)} stroke="currentColor" strokeOpacity={m === 0 ? 0.18 : 0.07} />
          <text x={padL - 8} y={yOf(m) + 3} textAnchor="end" className="fill-current" fontSize="10" opacity={0.5}>{m}%</text>
        </g>
      ))}
      {/* x ticks + labels */}
      {xTicks.map((u, idx) => (
        <text key={`x${idx}`} x={xOf(u)} y={padT + plotH + 16} textAnchor="middle" className="fill-current" fontSize="10" opacity={0.5}>{formatQtyInt(u)}</text>
      ))}

      {/* frame */}
      <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="currentColor" strokeOpacity={0.2} />
      <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="currentColor" strokeOpacity={0.2} />

      {/* split lines */}
      <line x1={xSplit} y1={padT} x2={xSplit} y2={padT + plotH} stroke="currentColor" strokeOpacity={0.28} strokeDasharray="4 4" />
      <line x1={padL} y1={ySplit} x2={padL + plotW} y2={ySplit} stroke="currentColor" strokeOpacity={0.28} strokeDasharray="4 4" />
      <text x={xSplit + 4} y={padT + plotH - 4} className="fill-current" fontSize="9" opacity={0.45}>median {formatQtyInt(velMedian)}</text>
      <text x={padL + 4} y={ySplit - 4} className="fill-current" fontSize="9" opacity={0.45}>{MARGIN_HEALTHY_PCT}% margin</text>

      {/* quadrant captions */}
      <text x={padL + plotW - 6} y={padT + 15} textAnchor="end" className="fill-current" fontSize="11" fontWeight={600} opacity={0.5}>★ Stars · protect</text>
      <text x={padL + 6} y={padT + 15} textAnchor="start" className="fill-current" fontSize="11" fontWeight={600} opacity={0.5}>◆ Gems · promote</text>
      <text x={padL + plotW - 6} y={padT + plotH - 8} textAnchor="end" className="fill-current" fontSize="11" fontWeight={600} opacity={0.5}>⚙ Workhorses · reprice</text>
      <text x={padL + 6} y={padT + plotH - 8} textAnchor="start" className="fill-current" fontSize="11" fontWeight={600} opacity={0.5}>▽ Drag · review</text>

      {/* axis titles */}
      <text x={padL + plotW / 2} y={H - 8} textAnchor="middle" className="fill-current" fontSize="11" opacity={0.6}>Units sold (last {windowDays}d) →</text>
      <text x={16} y={padT + plotH / 2} textAnchor="middle" className="fill-current" fontSize="11" opacity={0.6} transform={`rotate(-90 16 ${padT + plotH / 2})`}>Margin % →</text>

      {/* calm halos behind the highest-value products */}
      <g clipPath="url(#db-plot)">
        {plotted.filter((i) => haloed.has(i.id)).map((i) => (
          <circle
            key={`halo-${i.id}`}
            cx={xOf(i.units)} cy={yOf(i.marginPct ?? 0)} r={mounted ? rOf(i.contribution) + 7 : 0}
            fill={DECISION[i.decision].fill} opacity={activeId === i.id ? 0.3 : 0.16}
            filter="url(#db-glow)"
            style={{ transition: "r 700ms cubic-bezier(.22,1,.36,1), opacity 200ms" }}
          />
        ))}
      </g>

      {/* hover crosshair */}
      {active ? (
        <g>
          <line x1={xOf(active.units)} y1={padT} x2={xOf(active.units)} y2={padT + plotH} stroke={DECISION[active.decision].fill} strokeOpacity={0.4} strokeDasharray="3 3" />
          <line x1={padL} y1={yOf(active.marginPct ?? 0)} x2={padL + plotW} y2={yOf(active.marginPct ?? 0)} stroke={DECISION[active.decision].fill} strokeOpacity={0.4} strokeDasharray="3 3" />
        </g>
      ) : null}

      {/* bubbles */}
      {plotted.map((i, idx) => {
        const cx = xOf(i.units), cy = yOf(i.marginPct ?? 0), r = rOf(i.contribution);
        const isActive = activeId === i.id;
        const d = DECISION[i.decision];
        return (
          <g key={i.id}>
            <circle
              cx={cx} cy={cy} r={mounted ? r : 0}
              fill={`url(#db-grad-${i.decision})`} fillOpacity={isActive ? 1 : 0.82}
              stroke={d.fill} strokeWidth={isActive ? 2.5 : 1} strokeOpacity={isActive ? 1 : 0.7}
              className="cursor-pointer"
              tabIndex={0}
              role="button"
              aria-label={`${i.name}: ${d.label}, ${d.action}. Margin ${i.marginPct != null ? `${i.marginPct.toFixed(1)}%` : "unknown"}, ${formatQtyInt(i.units)} units, contribution ${i.contribution != null ? formatIls(i.contribution) : "unknown"}.`}
              style={{ transition: `r 600ms cubic-bezier(.22,1,.36,1) ${idx * 25}ms, fill-opacity 150ms, stroke-width 150ms`, filter: isActive ? "drop-shadow(0 2px 6px rgba(0,0,0,0.18))" : "none" }}
              onMouseEnter={() => onHover(i.id)}
              onClick={() => onHover(i.id)}
              onFocus={() => onHover(i.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onHover(i.id); } }}
            >
              <title>{i.name} · margin {i.marginPct != null ? `${i.marginPct.toFixed(1)}%` : "—"} · {formatQtyInt(i.units)} units · contribution {i.contribution != null ? formatIls(i.contribution) : "—"}</title>
            </circle>
            {/* lit highlight on active for extra dimension */}
            {isActive && mounted ? (
              <circle cx={cx - r * 0.3} cy={cy - r * 0.35} r={r * 0.28} fill="#fff" opacity={0.35} pointerEvents="none" />
            ) : null}
            {(labelled.has(i.id) || isActive) && mounted ? (
              (() => {
                const nearRight = cx > padL + plotW - 80;
                const nearLeft = cx < padL + 80;
                const anchor = nearRight ? "end" : nearLeft ? "start" : "middle";
                return (
                  <text x={cx} y={cy - r - 4} textAnchor={anchor} className="pointer-events-none fill-current" fontSize="10" fontWeight={isActive ? 700 : 500} opacity={isActive ? 0.95 : 0.65}>
                    {i.name.replace(/\s\d+ml$/, "")}
                  </text>
                );
              })()
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
