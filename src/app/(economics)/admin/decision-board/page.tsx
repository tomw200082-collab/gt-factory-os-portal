"use client";

// ---------------------------------------------------------------------------
// Product Decision Board — Tranche 080 (created) · Tranche 081 (premium rebuild).
//
// Access: planner + admin (the (economics) route group gates on
// planning:execute).
//
// Mission: one screen that answers, per finished product, the only question
// that matters for a small factory — should we PROTECT it, PROMOTE it, FIX ITS
// PRICE, or DROP it — framed around money at stake, and shown transparently.
//
// Single read endpoint in the browser:
//   GET /api/economics  → COGS, margin, price, inventory value, AND the
//                         Shopify-sourced 90d sales (qty_sold_90d,
//                         order_count_90d, revenue_90d_ils, units_prev_90d)
//                         from v_fg_economics (gt-factory-os migrations 0261/0262).
// Velocity is the Shopify 90d window — the SAME numbers as the Economics page,
// so the two surfaces always agree (previously /api/orders/by-item-and-period
// from the LionWheel mirror, which left these columns empty).
// Derived in-browser:
//   units 90d    = qty_sold_90d
//   contribution = material_margin_ils × units_sold
//   revenue      = avg_sale_price_ils  × units_sold
//   trend        = last-90d vs prev-90d (units_prev_90d)
//   annualised   = window value × (365 / window_days)
// Products missing cost/price are "Needs data" and never plotted — we do not
// ground a recommendation on a number we don't have.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
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

type DecisionKey = "star" | "gem" | "workhorse" | "drag" | "loss" | "dormant" | "needs_data";

interface DecisionMeta {
  key: DecisionKey;
  label: string;
  action: string;
  tone: BadgeTone;
  fill: string;
  icon: LucideIcon;
  blurb: string;
}

const DECISION: Record<DecisionKey, DecisionMeta> = {
  star: { key: "star", label: "Star", action: "Protect", tone: "success", fill: "#16a34a", icon: ShieldCheck, blurb: "Healthy margin, sells well. Protect supply and shelf space." },
  gem: { key: "gem", label: "Hidden gem", action: "Promote", tone: "info", fill: "#2563eb", icon: Rocket, blurb: "Healthy margin, low volume. Push marketing / distribution." },
  workhorse: { key: "workhorse", label: "Workhorse", action: "Fix price", tone: "warning", fill: "#d97706", icon: Tag, blurb: "Sells well but margin is thin. Reprice or cut cost." },
  drag: { key: "drag", label: "Drag", action: "Review for drop", tone: "warning", fill: "#b45309", icon: TrendingDown, blurb: "Thin margin and low volume. Candidate to drop or relaunch." },
  loss: { key: "loss", label: "Losing money", action: "Act now", tone: "danger", fill: "#dc2626", icon: AlertTriangle, blurb: "Sells below cost. Reprice immediately or drop." },
  dormant: { key: "dormant", label: "Not selling", action: "Review", tone: "muted", fill: "#94a3b8", icon: Moon, blurb: "No sales in the window. Review whether to keep listing." },
  needs_data: { key: "needs_data", label: "Needs data", action: "Set cost & price", tone: "muted", fill: "#cbd5e1", icon: HelpCircle, blurb: "Cost or price missing — cannot judge yet. Complete the data." },
};

// Quadrant cards, in reading order.
const SEGMENT_ORDER: DecisionKey[] = ["star", "gem", "workhorse", "drag", "loss", "dormant", "needs_data"];

// Locked to 90d: velocity is sourced from the Shopify 90d read model
// (v_fg_economics). A 30/180 toggle would mislabel that fixed window.
const WINDOWS = [
  { days: 90, label: "90d" },
] as const;

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
  // Shopify-sourced 90d sales (v_fg_economics, migrations 0261/0262).
  qty_sold_90d: string;
  order_count_90d: number;
  revenue_90d_ils: string | null;
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
  series: number[]; // monthly units, oldest→newest
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
// Page
// ---------------------------------------------------------------------------
export default function DecisionBoardPage(): JSX.Element {
  const [windowDays, setWindowDays] = useState<number>(90);

  const econQuery = useQuery<EconomicsResponse>({
    queryKey: ["decision-board", "economics"],
    queryFn: () => fetchJson<EconomicsResponse>("/api/economics"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // Fixed 90-day Shopify window (the economics read model's window), so
  // annualise on the nominal window length.
  const annualise = 365 / windowDays;

  // Velocity comes from the Economics read model (Shopify-sourced 90d sales,
  // gt-factory-os migrations 0261/0262) — the SAME numbers the Economics page
  // shows, so the two surfaces always agree. buckets = [prev-90d, last-90d]
  // drive a this-quarter-vs-last-quarter trend + sparkline.
  const velocityByItem = useMemo(() => {
    const map = new Map<string, { units: number; orders: number; buckets: { key: string; qty: number }[] }>();
    for (const r of econQuery.data?.rows ?? []) {
      const units = toNum(r.qty_sold_90d) ?? 0;
      const prev = toNum(r.units_prev_90d) ?? 0;
      map.set(r.item_id, {
        units,
        orders: r.order_count_90d ?? 0,
        buckets: [{ key: "1_prev", qty: prev }, { key: "2_cur", qty: units }],
      });
    }
    return map;
  }, [econQuery.data]);

  const items = useMemo<DecisionItem[]>(() => {
    const rows = econQuery.data?.rows ?? [];
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

  const onSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "name" ? "asc" : "desc"); }
  };

  const active = items.find((i) => i.id === activeId) ?? null;
  const isLoading = econQuery.isLoading;
  const velUnavailable = econQuery.isError;
  const verdict = buildVerdict(kpis, items.length);

  return (
    <div className="space-y-5" data-testid="decision-board">
      <WorkflowHeader
        eyebrow="Economics"
        title="Product Decision Board"
        description="Protect · promote · reprice · drop — every product on margin × velocity."
        actions={
          <div className="flex items-center gap-2">
            <WindowToggle value={windowDays} onChange={setWindowDays} />
            <RulesPopover velMedian={velMedian} windowDays={windowDays} />
          </div>
        }
      />

      {/* Verdict band — the single most important thing right now */}
      <VerdictBand verdict={verdict} loading={isLoading} onAct={() => verdict.filter && setFilter(verdict.filter)} />

      {velUnavailable ? (
        <SectionCard tone="warning" density="compact">
          <p className="text-sm text-fg">
            Sales velocity is temporarily unavailable, so products can&apos;t be ranked by what sells.
            Margin and inventory figures remain accurate.
          </p>
        </SectionCard>
      ) : !isLoading ? (
        <p className="-mt-2 px-1 text-xs text-fg-subtle">
          Velocity = units sold on Shopify in the last {windowDays} days; trend
          compares to the prior {windowDays} days.
        </p>
      ) : null}

      {/* Decision segments — clickable filters with money attached */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6" data-testid="segments">
        {(["star", "gem", "workhorse", "drag", "loss", "dormant"] as DecisionKey[]).map((k) => (
          <SegmentCard
            key={k}
            meta={DECISION[k]}
            count={segments.get(k)?.count ?? 0}
            contribution={segments.get(k)?.contribution ?? 0}
            active={filter === k}
            onClick={() => setFilter((f) => (f === k ? null : k))}
            loading={isLoading}
          />
        ))}
      </div>

      {/* Quadrant + inspector */}
      <div className="grid gap-4 lg:grid-cols-[1.9fr_1fr]">
        <SectionCard
          title="Decision quadrant"
          description="Right = sells more · Up = higher margin · bubble = contribution. Hover to inspect."
        >
          {isLoading ? (
            <div className="flex h-[520px] items-center justify-center text-sm text-fg-subtle">Loading…</div>
          ) : (
            <Quadrant items={items} velMedian={velMedian} activeId={activeId} onHover={setActiveId} windowDays={windowDays} />
          )}
        </SectionCard>
        <SectionCard title="Inspector" density="compact">
          <Inspector item={active} windowDays={windowDays} annualise={annualise} />
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
              {tableRows.map((i) => {
                const d = DECISION[i.decision];
                return (
                  <tr
                    key={i.id}
                    onMouseEnter={() => setActiveId(i.id)}
                    className={`border-b border-border/30 transition-colors hover:bg-bg-subtle/50 ${activeId === i.id ? "bg-bg-subtle/60" : ""}`}
                  >
                    <td className="px-2 py-2 font-medium text-fg-strong">{i.name}</td>
                    <td className="px-2 py-2"><Badge tone={d.tone}>{d.label}</Badge></td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {i.marginPct != null ? <span className={i.marginPct < 0 ? "text-danger-fg" : ""}>{formatPct(i.marginPct, 1)}</span> : <span className="text-fg-subtle">—</span>}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {i.contribution != null ? formatIls(i.contribution) : <span className="text-fg-subtle">—</span>}
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
              })}
              {tableRows.length === 0 ? (
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
    danger: "border-danger/40 bg-danger/5",
    warning: "border-warning/40 bg-warning/5",
    success: "border-success/40 bg-success/5",
  };
  const dot: Record<Verdict["tone"], string> = { danger: "bg-danger", warning: "bg-warning", success: "bg-success" };
  const Icon = verdict.tone === "danger" ? AlertTriangle : verdict.tone === "warning" ? HelpCircle : ShieldCheck;
  return (
    <div data-testid="verdict-band" className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${toneRing[verdict.tone]}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${dot[verdict.tone]}/15`}>
          <Icon className={`h-5 w-5 ${verdict.tone === "danger" ? "text-danger-fg" : verdict.tone === "warning" ? "text-warning-fg" : "text-success-fg"}`} />
        </span>
        <div>
          <div className="text-base font-semibold text-fg-strong">{loading ? "Reading the numbers…" : verdict.headline}</div>
          <div className="mt-0.5 text-sm text-fg-subtle">{loading ? " " : verdict.sub}</div>
        </div>
      </div>
      {!loading && verdict.cta ? (
        <button
          type="button"
          onClick={onAct}
          className="shrink-0 self-start rounded-lg border border-fg/15 bg-bg px-3 py-2 text-sm font-medium text-fg-strong shadow-sm transition-colors hover:bg-bg-subtle/70 sm:self-auto"
        >
          {verdict.cta}
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Window toggle
// ---------------------------------------------------------------------------
function WindowToggle({ value, onChange }: { value: number; onChange: (d: number) => void }): JSX.Element {
  return (
    <div className="inline-flex items-center rounded-lg border border-border/60 p-0.5">
      {WINDOWS.map((w) => (
        <button
          key={w.days}
          type="button"
          onClick={() => onChange(w.days)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${value === w.days ? "bg-fg/10 text-fg-strong" : "text-fg-subtle hover:text-fg"}`}
        >
          {w.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Segment card
// ---------------------------------------------------------------------------
function SegmentCard({
  meta, count, contribution, active, onClick, loading,
}: {
  meta: DecisionMeta; count: number; contribution: number; active: boolean; onClick: () => void; loading?: boolean;
}): JSX.Element {
  const Icon = meta.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`segment-${meta.key}`}
      className={`group flex flex-col gap-1 rounded-xl border p-3 text-left transition-all ${
        active ? "border-fg/40 bg-bg-subtle/70 shadow-sm" : "border-border/60 hover:border-fg/25 hover:bg-bg-subtle/40"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-md" style={{ backgroundColor: `${meta.fill}1a` }}>
          <Icon className="h-3.5 w-3.5" style={{ color: meta.fill }} />
        </span>
        <span className="text-2xs font-semibold uppercase tracking-sops text-fg-subtle">{meta.label}</span>
      </div>
      <div className="text-2xl font-semibold tabular-nums text-fg-strong">{loading ? "·" : count}</div>
      <div className="text-2xs text-fg-subtle">
        {meta.key === "loss" || meta.key === "drag"
          ? contribution < 0 ? `${formatIls(contribution)} drain` : meta.action
          : count > 0 && contribution > 0 ? formatIls(contribution) : meta.action}
      </div>
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
  const stroke = trend === "up" ? "#16a34a" : trend === "down" ? "#dc2626" : "#94a3b8";
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
      <button type="button" onClick={() => onSort(k)} className={`inline-flex items-center gap-1 hover:text-fg ${align === "right" ? "flex-row-reverse" : ""}`}>
        {label}
        {activeCol ? (dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Inspector
// ---------------------------------------------------------------------------
function Inspector({ item, windowDays, annualise }: { item: DecisionItem | null; windowDays: number; annualise: number }): JSX.Element {
  if (!item) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center">
        <Scale className="h-7 w-7 text-fg-subtle/50" />
        <p className="text-sm text-fg-subtle">Hover a bubble or row to inspect a product.</p>
      </div>
    );
  }
  const d = DECISION[item.decision];
  const Icon = d.icon;
  const annualContribution = item.contribution != null ? item.contribution * annualise : null;
  return (
    <div className="space-y-3">
      <div>
        <div className="text-base font-semibold text-fg-strong">{item.name}</div>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: `${d.fill}1a`, color: d.fill }}>
            <Icon className="h-3.5 w-3.5" /> {d.label}
          </span>
          <span className="text-xs font-medium text-fg">→ {d.action}</span>
        </div>
      </div>
      <p className="text-xs text-fg-subtle">{d.blurb}</p>
      {item.series.length >= 2 ? (
        <div className="flex items-center justify-between rounded-lg border border-border/50 bg-bg-subtle/40 px-3 py-2">
          <span className="text-2xs uppercase tracking-sops text-fg-subtle">Monthly units</span>
          <Sparkline values={item.series} trend={item.trend} />
        </div>
      ) : null}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <Stat label="Margin" value={item.marginPct != null ? formatPct(item.marginPct, 1) : "—"} danger={item.marginPct != null && item.marginPct < 0} />
        <Stat label="Margin / unit" value={item.marginIls != null ? formatIls(item.marginIls) : "—"} />
        <Stat label={`Units ${windowDays}d`} value={item.units > 0 ? formatQtyInt(item.units) : "0"} />
        <Stat label={`Orders ${windowDays}d`} value={String(item.orders)} />
        <Stat label={`Contribution ${windowDays}d`} value={item.contribution != null ? formatIls(item.contribution) : "—"} strong />
        <Stat label="Annualised" value={annualContribution != null ? formatIls(annualContribution) : "—"} strong danger={annualContribution != null && annualContribution < 0} />
        <Stat label="Sale price" value={item.price != null ? formatIls(item.price) : "—"} />
        <Stat label="Unit cost" value={item.cogs != null ? formatIls(item.cogs) : "—"} />
        <Stat label="On hand" value={formatQtyInt(item.qtyOnHand)} />
        <Stat label="Stock @ cost" value={item.invAtCost != null ? formatIls(item.invAtCost) : "—"} />
      </dl>
    </div>
  );
}
function Stat({ label, value, strong, danger }: { label: string; value: string; strong?: boolean; danger?: boolean }): JSX.Element {
  return (
    <div>
      <dt className="text-3xs uppercase tracking-sops text-fg-subtle">{label}</dt>
      <dd className={`tabular-nums ${danger ? "text-danger-fg" : strong ? "font-semibold text-fg-strong" : "text-fg"}`}>{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rules popover
// ---------------------------------------------------------------------------
function RulesPopover({ velMedian, windowDays }: { velMedian: number; windowDays: number }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs font-medium text-fg-subtle hover:bg-bg-subtle/60"
      >
        <Info className="h-3.5 w-3.5" /> How it decides
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-border/60 bg-bg p-3 text-xs shadow-lg">
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
            Velocity from delivered orders (LionWheel). Revenue uses the manual average sale price until automated price snapshots land.
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quadrant — zero-dependency interactive SVG scatter (upgraded)
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

  // top contributors get a name label
  const labelled = new Set([...plotted].sort((a, b) => Math.abs(b.contribution ?? 0) - Math.abs(a.contribution ?? 0)).slice(0, 5).map((i) => i.id));
  const active = plotted.find((i) => i.id === activeId) ?? null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Margin versus velocity decision quadrant" data-testid="quadrant">
      <defs>
        <clipPath id="db-plot"><rect x={padL} y={padT} width={plotW} height={plotH} /></clipPath>
      </defs>

      {/* quadrant tints */}
      <g clipPath="url(#db-plot)">
        <rect x={xSplit} y={padT} width={padL + plotW - xSplit} height={ySplit - padT} fill="#16a34a" opacity={0.05} />
        <rect x={padL} y={padT} width={xSplit - padL} height={ySplit - padT} fill="#2563eb" opacity={0.05} />
        <rect x={xSplit} y={ySplit} width={padL + plotW - xSplit} height={padT + plotH - ySplit} fill="#d97706" opacity={0.06} />
        <rect x={padL} y={ySplit} width={xSplit - padL} height={padT + plotH - ySplit} fill="#b45309" opacity={0.06} />
        {minMargin < 0 ? <rect x={padL} y={yZero} width={plotW} height={padT + plotH - yZero} fill="#dc2626" opacity={0.06} /> : null}
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

      {/* hover crosshair */}
      {active ? (
        <g>
          <line x1={xOf(active.units)} y1={padT} x2={xOf(active.units)} y2={padT + plotH} stroke={DECISION[active.decision].fill} strokeOpacity={0.35} strokeDasharray="3 3" />
          <line x1={padL} y1={yOf(active.marginPct ?? 0)} x2={padL + plotW} y2={yOf(active.marginPct ?? 0)} stroke={DECISION[active.decision].fill} strokeOpacity={0.35} strokeDasharray="3 3" />
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
              fill={d.fill} fillOpacity={isActive ? 0.9 : 0.5}
              stroke={d.fill} strokeWidth={isActive ? 2.5 : 1}
              className="cursor-pointer"
              style={{ transition: `r 600ms cubic-bezier(.22,1,.36,1) ${idx * 25}ms, fill-opacity 150ms, stroke-width 150ms` }}
              onMouseEnter={() => onHover(i.id)}
              onMouseLeave={() => onHover(null)}
            >
              <title>{i.name} · margin {i.marginPct != null ? `${i.marginPct.toFixed(1)}%` : "—"} · {formatQtyInt(i.units)} units · contribution {i.contribution != null ? formatIls(i.contribution) : "—"}</title>
            </circle>
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
