"use client";

// ---------------------------------------------------------------------------
// Product Decision Board — Tranche 080 (2026-06-16).
//
// Access: planner + admin (the (economics) route group gates on
// planning:execute).
//
// Mission: one screen that answers a single question — for each finished
// product, should we PROTECT it, PROMOTE it, FIX ITS PRICE, or REVIEW IT FOR
// DROP — and shows the "why" transparently.
//
// This is a decision surface, not a measurement-completeness surface. It is
// deliberately distinct from /admin/economics (which is the analyst table for
// closing the books). The reframe matters: the demand-weighted P&L-coverage
// view (migration 0210 / tranche 026) was reverted in 0211 for being "more
// complexity than insight." The data was never the problem — the accounting
// framing was. Here the same numbers drive a Star / Gem / Workhorse / Drag
// quadrant.
//
// Zero backend change. The board joins two EXISTING, live read endpoints in
// the browser:
//   GET /api/economics                      → COGS, margin, price, confidence,
//                                              inventory value (v_fg_economics).
//   GET /api/orders/by-item-and-period       → units sold per item per month
//                                              (LionWheel mirror, resolved
//                                              lines). This is the velocity
//                                              axis /economics cannot supply.
//
// Revenue and contribution are derived in-browser:
//   contribution_90d = material_margin_ils × units_sold_90d
//   revenue_90d      = avg_sale_price_ils  × units_sold_90d
// avg_sale_price_ils is the manual interim price (migration 0207); when it is
// unset the product is classed "Needs data" and excluded from the quadrant —
// we never plot a decision we cannot ground.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
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
} from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { formatIls, formatPct, formatQtyInt } from "@/lib/utils/format-money";

// ---------------------------------------------------------------------------
// Decision rules — TRANSPARENT and tunable. Surfaced in the UI via the rules
// popover so a decision is never a black box.
// ---------------------------------------------------------------------------

// Margin at or above this %, on price, is "healthy" (the quadrant's Y split).
const MARGIN_HEALTHY_PCT = 25;
// Margin below this % (but ≥0) is "thin" — a reprice candidate.
const MARGIN_THIN_PCT = 10;
// Trailing window for velocity + contribution.
const WINDOW_DAYS = 90;

type DecisionKey =
  | "star"
  | "gem"
  | "workhorse"
  | "drag"
  | "loss"
  | "dormant"
  | "needs_data";

interface DecisionMeta {
  key: DecisionKey;
  label: string;
  action: string;
  tone: BadgeTone;
  fill: string; // SVG bubble fill (Badge tones don't reach into raw SVG)
  blurb: string;
}

const DECISION: Record<DecisionKey, DecisionMeta> = {
  star: {
    key: "star",
    label: "Star",
    action: "Protect",
    tone: "success",
    fill: "#16a34a",
    blurb: "Healthy margin and selling well. Protect supply and shelf space.",
  },
  gem: {
    key: "gem",
    label: "Hidden gem",
    action: "Promote",
    tone: "info",
    fill: "#2563eb",
    blurb: "Healthy margin but low volume. Push marketing / distribution.",
  },
  workhorse: {
    key: "workhorse",
    label: "Workhorse",
    action: "Fix price",
    tone: "warning",
    fill: "#d97706",
    blurb: "Sells well but margin is thin. Reprice or cut cost.",
  },
  drag: {
    key: "drag",
    label: "Drag",
    action: "Review for drop",
    tone: "warning",
    fill: "#b45309",
    blurb: "Thin margin and low volume. Candidate to drop or relaunch.",
  },
  loss: {
    key: "loss",
    label: "Losing money",
    action: "Act now",
    tone: "danger",
    fill: "#dc2626",
    blurb: "Sells below cost. Reprice immediately or drop.",
  },
  dormant: {
    key: "dormant",
    label: "Not selling",
    action: "Review",
    tone: "muted",
    fill: "#94a3b8",
    blurb: `No units sold in ${WINDOW_DAYS} days. Review whether to keep listing.`,
  },
  needs_data: {
    key: "needs_data",
    label: "Needs data",
    action: "Set cost & price",
    tone: "muted",
    fill: "#cbd5e1",
    blurb: "Cost or sale price missing — cannot judge yet. Complete the data.",
  },
};

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
}
interface EconomicsResponse {
  rows: EconomicsRow[];
  count: number;
}

interface VelocityRow {
  item_id: string;
  period_bucket_key: string; // YYYY-MM-DD bucket start
  qty_total: string;
  order_count: number;
}
interface VelocityResponse {
  rows: VelocityRow[];
  bucket_cadence: string;
}

// ---------------------------------------------------------------------------
// Derived shape — one per finished product after the join
// ---------------------------------------------------------------------------

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
  units90: number;
  orders90: number;
  contribution90: number | null;
  revenue90: number | null;
  trend: Trend;
  decision: DecisionKey;
}

function toNum(v: string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(
      `Could not load data (HTTP ${res.status}). Check your connection and try refreshing.`,
    );
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DecisionBoardPage(): JSX.Element {
  const { from, to } = useMemo(() => {
    const now = new Date();
    const fromDate = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);
    return { from: fromDate.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
  }, []);

  const econQuery = useQuery<EconomicsResponse>({
    queryKey: ["decision-board", "economics"],
    queryFn: () => fetchJson<EconomicsResponse>("/api/economics"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const velQuery = useQuery<VelocityResponse>({
    queryKey: ["decision-board", "velocity", from, to],
    queryFn: () =>
      fetchJson<VelocityResponse>(
        `/api/orders/by-item-and-period?from=${from}&to=${to}&cadence=monthly`,
      ),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // -- Build the velocity index: item_id → { total units, orders, monthly buckets }.
  const velocityByItem = useMemo(() => {
    const map = new Map<string, { units: number; orders: number; buckets: { key: string; qty: number }[] }>();
    for (const r of velQuery.data?.rows ?? []) {
      const qty = toNum(r.qty_total) ?? 0;
      const cur = map.get(r.item_id) ?? { units: 0, orders: 0, buckets: [] };
      cur.units += qty;
      cur.orders += r.order_count ?? 0;
      cur.buckets.push({ key: r.period_bucket_key, qty });
      map.set(r.item_id, cur);
    }
    return map;
  }, [velQuery.data]);

  // -- Join + classify.
  const items = useMemo<DecisionItem[]>(() => {
    const rows = econQuery.data?.rows ?? [];
    // First pass to learn the velocity median among selling products, so the
    // X-axis split adapts to this factory's scale instead of a guessed constant.
    const sellingUnits: number[] = [];
    for (const r of rows) {
      const v = velocityByItem.get(r.item_id);
      if (v && v.units > 0) sellingUnits.push(v.units);
    }
    const velMedian = median(sellingUnits);

    return rows.map((r) => {
      const cogs = toNum(r.cogs_per_unit_ils);
      const price = toNum(r.avg_sale_price_ils);
      const marginIls = toNum(r.material_margin_ils);
      const marginPct = toNum(r.material_margin_pct);
      const v = velocityByItem.get(r.item_id);
      const units90 = v?.units ?? 0;
      const orders90 = v?.orders ?? 0;

      const needsData = !r.cogs_complete || cogs == null || price == null || marginPct == null;
      const contribution90 = marginIls != null ? marginIls * units90 : null;
      const revenue90 = price != null ? price * units90 : null;

      // Trend: last monthly bucket vs the previous one.
      let trend: Trend = "none";
      if (v && v.buckets.length >= 2) {
        const sorted = [...v.buckets].sort((a, b) => a.key.localeCompare(b.key));
        const last = sorted[sorted.length - 1].qty;
        const prev = sorted[sorted.length - 2].qty;
        trend = last > prev * 1.1 ? "up" : last < prev * 0.9 ? "down" : "flat";
      }

      let decision: DecisionKey;
      if (needsData) {
        decision = "needs_data";
      } else if (marginPct! < 0) {
        decision = "loss";
      } else if (units90 === 0) {
        decision = "dormant";
      } else {
        const highMargin = marginPct! >= MARGIN_HEALTHY_PCT;
        const highVel = units90 >= velMedian;
        decision = highMargin
          ? highVel
            ? "star"
            : "gem"
          : highVel
            ? "workhorse"
            : "drag";
      }

      return {
        id: r.item_id,
        name: r.item_name,
        cogs,
        price,
        marginIls,
        marginPct,
        qtyOnHand: toNum(r.qty_on_hand) ?? 0,
        invAtCost: toNum(r.fg_inventory_value_at_cost),
        units90,
        orders90,
        contribution90,
        revenue90,
        trend,
        decision,
      };
    });
  }, [econQuery.data, velocityByItem]);

  const velMedian = useMemo(() => {
    const selling = items.filter((i) => i.units90 > 0).map((i) => i.units90);
    return median(selling);
  }, [items]);

  // -- KPIs.
  const kpis = useMemo(() => {
    const measurable = items.filter((i) => i.contribution90 != null);
    const profitPool = measurable.reduce((s, i) => s + (i.contribution90 ?? 0), 0);
    const lossCount = items.filter((i) => i.marginPct != null && i.marginPct < 0).length;
    const needsData = items.filter((i) => i.decision === "needs_data").length;
    const sortedContrib = measurable
      .map((i) => i.contribution90 ?? 0)
      .filter((c) => c > 0)
      .sort((a, b) => b - a);
    const top3 = sortedContrib.slice(0, 3).reduce((s, c) => s + c, 0);
    const concentration = profitPool > 0 ? (top3 / profitPool) * 100 : null;
    return { profitPool, lossCount, needsData, concentration, measurableCount: measurable.length };
  }, [items]);

  // -- Interaction + table state.
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<DecisionKey>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("contribution90");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleFilter = (k: DecisionKey) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const counts = useMemo(() => {
    const c = {} as Record<DecisionKey, number>;
    (Object.keys(DECISION) as DecisionKey[]).forEach((k) => (c[k] = 0));
    items.forEach((i) => (c[i.decision] += 1));
    return c;
  }, [items]);

  const tableRows = useMemo(() => {
    const filtered =
      activeFilters.size === 0 ? items : items.filter((i) => activeFilters.has(i.decision));
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [items, activeFilters, sortKey, sortDir]);

  const onSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "name" ? "asc" : "desc");
    }
  };

  const active = items.find((i) => i.id === activeId) ?? null;
  const isLoading = econQuery.isLoading || velQuery.isLoading;
  const velUnavailable = velQuery.isError;

  return (
    <div className="space-y-6">
      <WorkflowHeader
        eyebrow="Economics"
        title="Product Decision Board"
        description={`Which products to protect, promote, reprice, or drop — margin × velocity over the last ${WINDOW_DAYS} days.`}
        actions={<RulesPopover velMedian={velMedian} />}
      />

      {velUnavailable ? (
        <SectionCard tone="warning" density="compact">
          <p className="text-sm text-fg">
            Sales velocity is temporarily unavailable, so products can&apos;t be ranked by what
            sells. Margin and inventory figures below are still accurate.
          </p>
        </SectionCard>
      ) : null}

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label={`Profit pool (${WINDOW_DAYS}d)`}
          value={formatIls(kpis.profitPool)}
          hint={`Sum of margin × units sold across ${kpis.measurableCount} priced, costed products.`}
          loading={isLoading}
        />
        <KpiTile
          label="Losing money"
          value={String(kpis.lossCount)}
          tone={kpis.lossCount > 0 ? "danger" : "default"}
          hint="Products whose sale price is below cost. Reprice or drop."
          loading={isLoading}
        />
        <KpiTile
          label="Can't decide yet"
          value={String(kpis.needsData)}
          tone={kpis.needsData > 0 ? "warning" : "default"}
          hint="Products missing cost or price. Complete the data before judging."
          loading={isLoading}
        />
        <KpiTile
          label="Top-3 concentration"
          value={kpis.concentration != null ? formatPct(kpis.concentration, 0) : "—"}
          hint="Share of the profit pool from your 3 biggest contributors. High = fragile."
          loading={isLoading}
        />
      </div>

      {/* Quadrant + inspector */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <SectionCard
          title="Decision quadrant"
          description="Each bubble is a product. Right = sells more. Up = higher margin. Bubble size = contribution. Hover or tap to inspect."
        >
          {isLoading ? (
            <div className="flex h-[460px] items-center justify-center text-sm text-fg-subtle">
              Loading…
            </div>
          ) : (
            <Quadrant
              items={items}
              velMedian={velMedian}
              activeId={activeId}
              onHover={setActiveId}
            />
          )}
        </SectionCard>

        <SectionCard title="Inspector" density="compact">
          <Inspector item={active} />
        </SectionCard>
      </div>

      {/* Decision table */}
      <SectionCard
        title="All products"
        description="Sorted by contribution. Filter by decision."
        actions={
          <FilterChips counts={counts} active={activeFilters} onToggle={toggleFilter} />
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-3xs uppercase tracking-sops text-fg-subtle">
                <SortTh label="Product" k="name" sortKey={sortKey} dir={sortDir} onSort={onSort} />
                <th className="px-2 py-2 font-semibold">Decision</th>
                <SortTh label="Margin %" k="marginPct" sortKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
                <SortTh label={`Contribution ${WINDOW_DAYS}d`} k="contribution90" sortKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
                <SortTh label={`Units ${WINDOW_DAYS}d`} k="units90" sortKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
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
                    className={`border-b border-border/30 transition-colors hover:bg-bg-subtle/50 ${
                      activeId === i.id ? "bg-bg-subtle/60" : ""
                    }`}
                  >
                    <td className="px-2 py-2 font-medium text-fg-strong">{i.name}</td>
                    <td className="px-2 py-2">
                      <Badge tone={d.tone}>{d.label}</Badge>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {i.marginPct != null ? (
                        <span className={i.marginPct < 0 ? "text-danger-fg" : ""}>
                          {formatPct(i.marginPct, 1)}
                        </span>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {i.contribution90 != null ? formatIls(i.contribution90) : <span className="text-fg-subtle">—</span>}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {i.units90 > 0 ? formatQtyInt(i.units90) : <span className="text-fg-subtle">0</span>}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <TrendIcon trend={i.trend} />
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-fg-subtle">
                      {i.invAtCost != null ? formatIls(i.invAtCost) : "—"}
                    </td>
                  </tr>
                );
              })}
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-2 py-8 text-center text-sm text-fg-subtle">
                    No products match the selected filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sorting helpers
// ---------------------------------------------------------------------------

type SortKey = "name" | "marginPct" | "contribution90" | "units90" | "invAtCost";

function sortValue(i: DecisionItem, k: SortKey): number | string | null {
  switch (k) {
    case "name":
      return i.name;
    case "marginPct":
      return i.marginPct;
    case "contribution90":
      return i.contribution90;
    case "units90":
      return i.units90;
    case "invAtCost":
      return i.invAtCost;
  }
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiTile({
  label,
  value,
  hint,
  tone = "default",
  loading,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "danger" | "warning";
  loading?: boolean;
}): JSX.Element {
  const valueColor =
    tone === "danger" ? "text-danger-fg" : tone === "warning" ? "text-warning-fg" : "text-fg-strong";
  return (
    <div className="rounded-lg border border-border/60 bg-bg-subtle/40 p-3">
      <div className="flex items-center gap-1 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
        {label}
        <span title={hint} className="cursor-help">
          <Info className="h-3 w-3 opacity-60" />
        </span>
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueColor}`}>
        {loading ? "…" : value}
      </div>
    </div>
  );
}

function TrendIcon({ trend }: { trend: Trend }): JSX.Element {
  if (trend === "up") return <ArrowUpRight className="mx-auto h-4 w-4 text-success-fg" aria-label="rising" />;
  if (trend === "down") return <ArrowDownRight className="mx-auto h-4 w-4 text-danger-fg" aria-label="falling" />;
  if (trend === "flat") return <Minus className="mx-auto h-4 w-4 text-fg-subtle" aria-label="flat" />;
  return <span className="text-fg-subtle">—</span>;
}

function SortTh({
  label,
  k,
  sortKey,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}): JSX.Element {
  const activeCol = sortKey === k;
  return (
    <th className={`px-2 py-2 font-semibold ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 hover:text-fg ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        {label}
        {activeCol ? (
          dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

function FilterChips({
  counts,
  active,
  onToggle,
}: {
  counts: Record<DecisionKey, number>;
  active: Set<DecisionKey>;
  onToggle: (k: DecisionKey) => void;
}): JSX.Element {
  const order: DecisionKey[] = ["star", "gem", "workhorse", "drag", "loss", "dormant", "needs_data"];
  return (
    <div className="flex flex-wrap gap-1.5">
      {order.map((k) => {
        const d = DECISION[k];
        const on = active.has(k);
        return (
          <button
            key={k}
            type="button"
            onClick={() => onToggle(k)}
            className={`rounded-full border px-2 py-0.5 text-2xs font-medium transition-colors ${
              on
                ? "border-fg/40 bg-fg/10 text-fg-strong"
                : "border-border/60 text-fg-subtle hover:bg-bg-subtle/60"
            }`}
          >
            {d.label} <span className="tabular-nums opacity-70">{counts[k]}</span>
          </button>
        );
      })}
    </div>
  );
}

function Inspector({ item }: { item: DecisionItem | null }): JSX.Element {
  if (!item) {
    return (
      <p className="py-6 text-center text-sm text-fg-subtle">
        Hover a bubble or a row to inspect a product.
      </p>
    );
  }
  const d = DECISION[item.decision];
  return (
    <div className="space-y-3">
      <div>
        <div className="text-base font-semibold text-fg-strong">{item.name}</div>
        <div className="mt-1 flex items-center gap-2">
          <Badge tone={d.tone}>{d.label}</Badge>
          <span className="text-xs font-medium text-fg">→ {d.action}</span>
        </div>
      </div>
      <p className="text-xs text-fg-subtle">{d.blurb}</p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <Stat label="Margin" value={item.marginPct != null ? formatPct(item.marginPct, 1) : "—"} danger={item.marginPct != null && item.marginPct < 0} />
        <Stat label="Margin / unit" value={item.marginIls != null ? formatIls(item.marginIls) : "—"} />
        <Stat label={`Units ${WINDOW_DAYS}d`} value={item.units90 > 0 ? formatQtyInt(item.units90) : "0"} />
        <Stat label={`Orders ${WINDOW_DAYS}d`} value={String(item.orders90)} />
        <Stat label={`Contribution ${WINDOW_DAYS}d`} value={item.contribution90 != null ? formatIls(item.contribution90) : "—"} strong />
        <Stat label={`Revenue ${WINDOW_DAYS}d`} value={item.revenue90 != null ? formatIls(item.revenue90) : "—"} />
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
      <dd className={`tabular-nums ${danger ? "text-danger-fg" : strong ? "font-semibold text-fg-strong" : "text-fg"}`}>
        {value}
      </dd>
    </div>
  );
}

function RulesPopover({ velMedian }: { velMedian: number }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-2.5 py-1.5 text-xs font-medium text-fg-subtle hover:bg-bg-subtle/60"
      >
        <Scale className="h-3.5 w-3.5" /> How decisions are made
      </button>
      {open ? (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-lg border border-border/60 bg-bg p-3 text-xs shadow-lg">
          <p className="mb-2 font-semibold text-fg-strong">Transparent rules</p>
          <ul className="space-y-1.5 text-fg-subtle">
            <li>• <b className="text-fg">Healthy</b> margin = ≥ {MARGIN_HEALTHY_PCT}% · <b className="text-fg">thin</b> &lt; {MARGIN_THIN_PCT}%.</li>
            <li>• <b className="text-fg">High velocity</b> = units sold ≥ this factory&apos;s median of selling products ({formatQtyInt(velMedian)}).</li>
            <li>• <b className="text-success-fg">Star</b>: healthy margin + high velocity → protect.</li>
            <li>• <b className="text-info-fg">Hidden gem</b>: healthy margin + low velocity → promote.</li>
            <li>• <b className="text-warning-fg">Workhorse</b>: thin margin + high velocity → reprice.</li>
            <li>• <b className="text-warning-fg">Drag</b>: thin margin + low velocity → review for drop.</li>
            <li>• <b className="text-danger-fg">Losing money</b>: sells below cost → act now.</li>
            <li>• <b>Needs data</b>: cost or price missing → excluded from the quadrant.</li>
          </ul>
          <p className="mt-2 border-t border-border/40 pt-2 text-3xs text-fg-subtle">
            Velocity from delivered orders (LionWheel). Revenue uses the manual average sale price
            until automated price snapshots land.
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quadrant — zero-dependency interactive SVG scatter
// ---------------------------------------------------------------------------

function Quadrant({
  items,
  velMedian,
  activeId,
  onHover,
}: {
  items: DecisionItem[];
  velMedian: number;
  activeId: string | null;
  onHover: (id: string | null) => void;
}): JSX.Element {
  // Only plot products we can place: a margin% and at least the velocity axis.
  const plotted = items.filter((i) => i.decision !== "needs_data" && i.marginPct != null);

  const W = 800;
  const H = 460;
  const padL = 56;
  const padR = 24;
  const padT = 24;
  const padB = 48;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const maxUnits = Math.max(velMedian * 2, ...plotted.map((i) => i.units90), 10);
  const margins = plotted.map((i) => i.marginPct ?? 0);
  const maxMargin = Math.max(40, ...margins);
  const minMargin = Math.min(0, ...margins);

  const xOf = (u: number) => padL + (u / maxUnits) * plotW;
  const yOf = (m: number) => padT + (1 - (m - minMargin) / (maxMargin - minMargin || 1)) * plotH;

  const maxContrib = Math.max(1, ...plotted.map((i) => Math.abs(i.contribution90 ?? 0)));
  const rOf = (c: number | null) => {
    const v = Math.abs(c ?? 0);
    return 5 + Math.sqrt(v / maxContrib) * 22;
  };

  const xSplit = xOf(velMedian);
  const ySplit = yOf(MARGIN_HEALTHY_PCT);
  const yZero = yOf(0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Margin versus velocity decision quadrant">
      {/* quadrant background tints */}
      <rect x={xSplit} y={padT} width={padL + plotW - xSplit} height={ySplit - padT} fill="#16a34a" opacity={0.04} />
      <rect x={padL} y={padT} width={xSplit - padL} height={ySplit - padT} fill="#2563eb" opacity={0.04} />
      <rect x={xSplit} y={ySplit} width={padL + plotW - xSplit} height={padT + plotH - ySplit} fill="#d97706" opacity={0.05} />
      <rect x={padL} y={ySplit} width={xSplit - padL} height={padT + plotH - ySplit} fill="#b45309" opacity={0.05} />

      {/* axes frame */}
      <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="currentColor" strokeOpacity={0.2} />
      <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="currentColor" strokeOpacity={0.2} />

      {/* split lines */}
      <line x1={xSplit} y1={padT} x2={xSplit} y2={padT + plotH} stroke="currentColor" strokeOpacity={0.25} strokeDasharray="4 4" />
      <line x1={padL} y1={ySplit} x2={padL + plotW} y2={ySplit} stroke="currentColor" strokeOpacity={0.25} strokeDasharray="4 4" />
      {/* zero-margin reference (only if visible) */}
      {minMargin < 0 ? (
        <line x1={padL} y1={yZero} x2={padL + plotW} y2={yZero} stroke="#dc2626" strokeOpacity={0.4} />
      ) : null}

      {/* quadrant captions */}
      <text x={padL + plotW - 4} y={padT + 14} textAnchor="end" className="fill-current" fontSize="11" opacity={0.45}>★ Stars · protect</text>
      <text x={padL + 4} y={padT + 14} textAnchor="start" className="fill-current" fontSize="11" opacity={0.45}>◆ Gems · promote</text>
      <text x={padL + plotW - 4} y={padT + plotH - 6} textAnchor="end" className="fill-current" fontSize="11" opacity={0.45}>⚙ Workhorses · reprice</text>
      <text x={padL + 4} y={padT + plotH - 6} textAnchor="start" className="fill-current" fontSize="11" opacity={0.45}>▽ Drag · review</text>

      {/* axis labels */}
      <text x={padL + plotW / 2} y={H - 10} textAnchor="middle" className="fill-current" fontSize="11" opacity={0.6}>
        Units sold (last {WINDOW_DAYS}d) →
      </text>
      <text x={16} y={padT + plotH / 2} textAnchor="middle" className="fill-current" fontSize="11" opacity={0.6} transform={`rotate(-90 16 ${padT + plotH / 2})`}>
        Margin % →
      </text>

      {/* bubbles */}
      {plotted.map((i) => {
        const cx = xOf(i.units90);
        const cy = yOf(i.marginPct ?? 0);
        const r = rOf(i.contribution90);
        const isActive = activeId === i.id;
        const d = DECISION[i.decision];
        return (
          <circle
            key={i.id}
            cx={cx}
            cy={cy}
            r={r}
            fill={d.fill}
            fillOpacity={isActive ? 0.85 : 0.5}
            stroke={d.fill}
            strokeWidth={isActive ? 2.5 : 1}
            className="cursor-pointer transition-opacity"
            onMouseEnter={() => onHover(i.id)}
            onMouseLeave={() => onHover(null)}
          >
            <title>
              {i.name} · margin {i.marginPct != null ? `${i.marginPct.toFixed(1)}%` : "—"} · {formatQtyInt(i.units90)} units · contribution {i.contribution90 != null ? formatIls(i.contribution90) : "—"}
            </title>
          </circle>
        );
      })}
    </svg>
  );
}
