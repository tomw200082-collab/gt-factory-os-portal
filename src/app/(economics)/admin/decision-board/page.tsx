"use client";

// ---------------------------------------------------------------------------
// Product Decision Board — Tranche 080 (created) · 081 (premium rebuild) ·
// 091 (UI amplify) · 128 (true gross margin).
//
// Access: planner + admin (the (economics) route group gates on
// planning:execute).
//
// Tranche 128 — the page moves from material-only margin computed in the
// browser to the server's CM2 unit-economics read model:
//
//   GET /api/unit-economics  → one row per product with the FULL waterfall
//     (realized-first unit price → channel fees → CM1 → per-unit opex →
//     per-order allocation → CM2), plus target price, decision classification,
//     contribution, totals, and the operating-cost model rows.
//   PATCH /api/economics/operating-costs ← the in-page Operating-costs drawer.
//
// Corridor SPEC §V.1 (gt-factory-os/SPEC.md): NO money semantic is computed
// here. Every ₪/% on this screen is a named field of the GET response. The
// only client-side work: sorting, filtering, formatting, and Σ/max of
// server-provided columns for display grouping. The old in-browser derivation
// block (velocity map, contribution/revenue formulas, decision thresholds)
// is deleted — the server owns the meaning of a shekel.
//
// Testids are locked (SPEC §V.7): decision-board / verdict-band / segments /
// segment-<key> / quadrant / inspector.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  SlidersHorizontal,
  Clock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { formatIls, formatPct, formatQtyInt } from "@/lib/utils/format-money";
import { OperatingCostsDrawer, type CostModelRow } from "./OperatingCostsDrawer";

// ---------------------------------------------------------------------------
// Decision meta — presentation only. The classification itself is computed
// SERVER-SIDE (decision field on each row; healthy threshold = target_pct,
// velocity split = server median — both echoed in meta).
// ---------------------------------------------------------------------------
type DecisionKey = "star" | "gem" | "workhorse" | "drag" | "loss" | "dormant" | "needs_data";

interface DecisionMeta {
  key: DecisionKey;
  label: string;
  action: string;
  tone: BadgeTone;
  fill: string;
  light: string;
  icon: LucideIcon;
  blurb: string;
}

const DECISION: Record<DecisionKey, DecisionMeta> = {
  star: { key: "star", label: "Star", action: "Protect", tone: "success", fill: "#15803d", light: "#4ade80", icon: ShieldCheck, blurb: "True margin at target, sells well. Protect supply and shelf space." },
  gem: { key: "gem", label: "Hidden gem", action: "Promote", tone: "info", fill: "#1d4ed8", light: "#60a5fa", icon: Rocket, blurb: "True margin at target, low volume. Push marketing / distribution." },
  workhorse: { key: "workhorse", label: "Workhorse", action: "Fix price", tone: "warning", fill: "#c2620a", light: "#fbbf24", icon: Tag, blurb: "Sells well but true margin is under target. Move toward the target price or cut cost." },
  drag: { key: "drag", label: "Drag", action: "Review for drop", tone: "warning", fill: "#9a4209", light: "#f59e0b", icon: TrendingDown, blurb: "Under-target margin and low volume. Candidate to drop or relaunch." },
  loss: { key: "loss", label: "Losing money", action: "Act now", tone: "danger", fill: "#c0241f", light: "#f87171", icon: AlertTriangle, blurb: "Negative true margin — every sale loses money after operating costs. Reprice immediately or drop." },
  dormant: { key: "dormant", label: "Not selling", action: "Review", tone: "muted", fill: "#64748b", light: "#cbd5e1", icon: Moon, blurb: "No sales in the window. Review whether to keep listing." },
  needs_data: { key: "needs_data", label: "Needs data", action: "Complete data", tone: "muted", fill: "#94a3b8", light: "#e2e8f0", icon: HelpCircle, blurb: "The server cannot judge this product yet — see the reason on the row." },
};

const SEGMENT_ORDER: DecisionKey[] = ["star", "gem", "workhorse", "drag", "loss", "dormant", "needs_data"];

const REASON_COPY: Record<string, string> = {
  NO_COGS: "No cost snapshot yet — run a COGS recalculation.",
  COGS_INCOMPLETE: "Cost is missing components — complete component costs.",
  NO_PRICE_BASIS: "No realized revenue and no manual price — set a sale price.",
};

// ---------------------------------------------------------------------------
// Wire types — mirror api/src/economics/unit_economics_route.ts
// ---------------------------------------------------------------------------
interface UERow {
  item_id: string;
  item_name: string;
  price_basis: "REALIZED_90D" | "MANUAL" | "NONE";
  price_anomaly: boolean;
  unit_price_ils: string | null;
  qty_sold_90d: string;
  order_count_90d: number;
  units_prev_90d: string;
  revenue_90d_ils: string | null;
  sales_synced_at: string | null;
  stale: boolean;
  materials_cogs_ils: string | null;
  cogs_complete: boolean;
  missing_cost_components: unknown[];
  opex_per_unit_ils: string;
  fees_pct_total: string;
  per_order_alloc_ils: string;
  fees_per_unit_ils: string | null;
  cm1_ils: string | null;
  cm1_pct: string | null;
  cm2_ils: string | null;
  cm2_pct: string | null;
  judgeable: boolean;
  judge_block_reason: "NO_COGS" | "NO_PRICE_BASIS" | "COGS_INCOMPLETE" | null;
  qty_on_hand: string;
  fg_inventory_value_at_cost: string | null;
  cost_breakdown: unknown;
  target_price_ils: string | null;
  contribution_90d_ils: string | null;
  decision: DecisionKey;
}

interface UETotals {
  profit_pool_90d: number;
  profit_pool_annual: number;
  loss_count: number;
  risk_annual: number;
  needs_data: number;
  concentration_top3_pct: number | null;
  measurable_count: number;
  total_count: number;
}

interface UEResponse {
  rows: UERow[];
  totals: UETotals;
  meta: { target_pct: number; velocity_median: number; window_days: number };
  cost_model: CostModelRow[];
  count: number;
}

type Trend = "up" | "down" | "flat" | "none";

// View model: server numbers parsed for plotting/sorting — no new meanings.
interface ViewItem {
  id: string;
  name: string;
  decision: DecisionKey;
  row: UERow;
  cm2Pct: number | null;
  units: number;
  contribution: number | null;
  targetPrice: number | null;
  invAtCost: number | null;
  series: number[];
  trend: Trend;
}

function toNum(v: string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Could not load data (HTTP ${res.status}). Try refreshing.`);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Motion primitives — unchanged from tranche 091 (reduced-motion safe).
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
      const eased = 1 - Math.pow(1 - p, 3);
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
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const ueQuery = useQuery<UEResponse>({
    queryKey: ["decision-board", "unit-economics"],
    queryFn: () => fetchJson<UEResponse>("/api/unit-economics"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const windowDays = ueQuery.data?.meta.window_days ?? 90;
  const targetPct = ueQuery.data?.meta.target_pct ?? 25;
  const velMedian = ueQuery.data?.meta.velocity_median ?? 0;
  const totals = ueQuery.data?.totals ?? null;
  const costModel = ueQuery.data?.cost_model ?? [];

  // Parse server rows for plotting/sorting. Trend compares the two
  // server-provided unit counts — quantity presentation, not money math.
  const items = useMemo<ViewItem[]>(() => {
    return (ueQuery.data?.rows ?? []).map((r) => {
      const prev = toNum(r.units_prev_90d) ?? 0;
      const units = toNum(r.qty_sold_90d) ?? 0;
      let trend: Trend = "none";
      if (prev > 0 || units > 0) {
        trend = units > prev * 1.1 ? "up" : units < prev * 0.9 ? "down" : "flat";
      }
      return {
        id: r.item_id,
        name: r.item_name,
        decision: r.decision,
        row: r,
        cm2Pct: toNum(r.cm2_pct),
        units,
        contribution: toNum(r.contribution_90d_ils),
        targetPrice: toNum(r.target_price_ils),
        invAtCost: toNum(r.fg_inventory_value_at_cost),
        series: [prev, units],
        trend,
      };
    });
  }, [ueQuery.data]);

  const anyStale = useMemo(() => items.some((i) => i.row.stale), [items]);
  const anyAnomaly = useMemo(() => items.some((i) => i.row.price_anomaly), [items]);

  // Segment cards: count + Σ of the server contribution column per decision
  // (display grouping of a served column — allowed by SPEC §V.1).
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
  const isLoading = ueQuery.isLoading;
  const isError = ueQuery.isError;
  const verdict = totals ? buildVerdict(totals) : null;

  const headerActions = (
    <div className="flex items-center gap-2">
      <SourcePill stale={anyStale} />
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        data-testid="operating-costs-open"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs font-medium text-fg-subtle transition-colors hover:bg-bg-subtle/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" /> Operating costs
      </button>
      <RulesPopover velMedian={velMedian} windowDays={windowDays} targetPct={targetPct} />
    </div>
  );

  if (isError) {
    return (
      <div className="space-y-5" data-testid="decision-board">
        <WorkflowHeader
          eyebrow="Economics"
          title="Product Decision Board"
          description="Every finished product on true margin × velocity — so the next move is obvious: protect, promote, reprice, or drop."
          actions={<SourcePill stale={false} />}
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
              onClick={() => ueQuery.refetch()}
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
        description="Every finished product on true margin × velocity — realized revenue minus materials, labor, overhead, fees and shipping — so the next move is obvious."
        actions={headerActions}
      />

      {/* Freshness / anomaly notices — server flags, rendered only */}
      {anyStale ? (
        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning-softer/50 px-3 py-2 text-xs text-warning-fg" role="status">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          Shopify sales sync is older than 7 days — realized prices may be out of date.
        </div>
      ) : null}

      {/* Verdict band */}
      <VerdictBand verdict={verdict} loading={isLoading} onAct={(f) => setFilter(f)} />

      {/* Vitals */}
      <VitalsRow totals={totals} loading={isLoading} />

      {/* Decision segments */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7" data-testid="segments">
        {SEGMENT_ORDER.map((k) => (
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

      {/* Portfolio map + inspector */}
      <div className="grid gap-4 lg:grid-cols-[1.9fr_1fr]">
        <SectionCard
          eyebrow="The signature view"
          title="Portfolio map"
          description={`Right = sells more · Up = higher true margin (CM2) · bubble = money it contributes. The ${targetPct}% line is the margin target.`}
        >
          {isLoading ? (
            <QuadrantSkeleton />
          ) : (
            <Quadrant items={items} velMedian={velMedian} targetPct={targetPct} activeId={activeId} onHover={setActiveId} windowDays={windowDays} />
          )}
        </SectionCard>
        <SectionCard eyebrow="Readout" title="Inspector" density="compact">
          <Inspector item={active} windowDays={windowDays} />
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
                <SortTh label="True margin %" k="cm2Pct" sortKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
                <SortTh label={`Contribution ${windowDays}d`} k="contribution" sortKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
                <SortTh label={`Units ${windowDays}d`} k="units" sortKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
                <th className="px-2 py-2 text-center font-semibold">Trend</th>
                <SortTh label="Target price" k="targetPrice" sortKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
                <SortTh label="Stock @ cost" k="invAtCost" sortKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, idx) => (
                  <tr key={`sk-${idx}`} className="border-b border-border/30">
                    <td className="px-2 py-2.5" colSpan={8}><Skeleton className="h-5 w-full" /></td>
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
                          {i.row.price_anomaly ? (
                            <span title="Units sold with no revenue in the window (comped/replacement orders) — price falls back to the manual value.">
                              <AlertTriangle className="h-3 w-3 shrink-0 text-warning-fg" aria-label="price anomaly" />
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-2 py-2"><Badge tone={d.tone}>{d.label}</Badge></td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {i.cm2Pct != null ? <span className={i.cm2Pct < 0 ? "font-semibold text-danger-fg" : ""}>{formatPct(i.cm2Pct, 1)}</span> : <span className="text-fg-subtle">—</span>}
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
                      <td className="px-2 py-2 text-right tabular-nums">
                        {i.targetPrice != null
                          ? <span className={i.decision === "workhorse" || i.decision === "loss" ? "font-semibold text-fg-strong" : "text-fg-subtle"}>{formatIls(i.targetPrice)}</span>
                          : <span className="text-fg-subtle">—</span>}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-fg-subtle">
                        {i.invAtCost != null ? formatIls(i.invAtCost) : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
              {!isLoading && tableRows.length === 0 ? (
                <tr><td colSpan={8} className="px-2 py-8 text-center text-sm text-fg-subtle">No products match this filter.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {anyAnomaly ? (
        <p className="text-2xs text-fg-subtle">
          <AlertTriangle className="mr-1 inline h-3 w-3 text-warning-fg" aria-hidden />
          Products marked with a warning sold units without revenue in the window (replacements / comps). Their price uses the manual value so they are never misread as selling below cost.
        </p>
      ) : null}

      <OperatingCostsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        costModel={costModel}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["decision-board", "unit-economics"] })}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------
type SortKey = "name" | "cm2Pct" | "contribution" | "units" | "targetPrice" | "invAtCost";
function sortValue(i: ViewItem, k: SortKey): number | string | null {
  switch (k) {
    case "name": return i.name;
    case "cm2Pct": return i.cm2Pct;
    case "contribution": return i.contribution;
    case "units": return i.units;
    case "targetPrice": return i.targetPrice;
    case "invAtCost": return i.invAtCost;
  }
}

// ---------------------------------------------------------------------------
// Source pill — states the price basis honestly; flags a stale sync.
// ---------------------------------------------------------------------------
function SourcePill({ stale }: { stale: boolean }): JSX.Element {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-2xs font-medium ${stale ? "border-warning/50 bg-warning-softer/40 text-warning-fg" : "border-border/60 bg-bg-subtle/50 text-fg-subtle"}`}>
      <span className={`dot ${stale ? "bg-warning" : "bg-accent"} animate-pulse-soft`} aria-hidden />
      {stale ? "Sales sync stale" : "Realized Shopify revenue · last 90 days"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Verdict band — rendered from server totals only.
// ---------------------------------------------------------------------------
interface Verdict {
  tone: "danger" | "warning" | "success";
  headline: string;
  sub: string;
  cta: string | null;
  filter: DecisionKey | null;
}
function buildVerdict(t: UETotals): Verdict {
  if (t.loss_count > 0) {
    return {
      tone: "danger",
      headline: `${t.loss_count} product${t.loss_count > 1 ? "s" : ""} lose money after operating costs`,
      sub: `Leaking about ${formatIls(t.risk_annual)}/yr at the current pace. Reprice toward the target price or drop them first.`,
      cta: "Show losing products", filter: "loss",
    };
  }
  if (t.needs_data > 0) {
    return {
      tone: "warning",
      headline: `${t.needs_data} product${t.needs_data > 1 ? "s" : ""} can't be judged yet`,
      sub: "Each row's reason says what's missing — cost snapshot, component costs, or a price.",
      cta: "Show what's missing", filter: "needs_data",
    };
  }
  return {
    tone: "success",
    headline: `All ${t.total_count} products earn a positive true margin`,
    sub: t.concentration_top3_pct != null
      ? `Annual profit pool ≈ ${formatIls(t.profit_pool_annual)}. Top 3 products drive ${formatPct(t.concentration_top3_pct, 0)} of it — protect them.`
      : `Annual profit pool ≈ ${formatIls(t.profit_pool_annual)}.`,
    cta: null, filter: null,
  };
}

function VerdictBand({ verdict, loading, onAct }: { verdict: Verdict | null; loading?: boolean; onAct: (f: DecisionKey) => void }): JSX.Element {
  const v: Verdict = verdict ?? { tone: "success", headline: "", sub: "", cta: null, filter: null };
  const toneRing: Record<Verdict["tone"], string> = {
    danger: "border-danger/40 bg-gradient-to-br from-danger/[0.07] to-transparent",
    warning: "border-warning/40 bg-gradient-to-br from-warning/[0.07] to-transparent",
    success: "border-success/40 bg-gradient-to-br from-success/[0.07] to-transparent",
  };
  const badgeBg: Record<Verdict["tone"], string> = { danger: "bg-danger/15", warning: "bg-warning/15", success: "bg-success/15" };
  const badgePulse: Record<Verdict["tone"], string> = { danger: "bg-danger/25", warning: "bg-warning/25", success: "bg-success/25" };
  const fg: Record<Verdict["tone"], string> = { danger: "text-danger-fg", warning: "text-warning-fg", success: "text-success-fg" };
  const Icon = v.tone === "danger" ? AlertTriangle : v.tone === "warning" ? HelpCircle : ShieldCheck;
  return (
    <div
      data-testid="verdict-band"
      className={`reveal flex flex-col gap-3 rounded-xl border p-4 shadow-raised sm:flex-row sm:items-center sm:justify-between sm:p-5 ${toneRing[v.tone]}`}
    >
      <div className="flex items-start gap-3.5">
        <span className={`relative mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${badgeBg[v.tone]}`}>
          {!loading && v.tone === "danger" ? (
            <span className={`absolute inset-0 rounded-xl ${badgePulse[v.tone]} animate-pulse-soft`} aria-hidden />
          ) : null}
          <Icon className={`relative h-5.5 w-5.5 ${fg[v.tone]}`} />
        </span>
        <div className="min-w-0">
          <div className="text-2xs font-semibold uppercase tracking-sops text-fg-subtle">The call right now</div>
          <div className="mt-0.5 text-lg font-bold tracking-tight text-fg-strong">{loading || !verdict ? "Reading the numbers…" : v.headline}</div>
          <div className="mt-0.5 text-sm leading-relaxed text-fg-muted">{loading || !verdict ? " " : v.sub}</div>
        </div>
      </div>
      {!loading && verdict && v.cta && v.filter ? (
        <button
          type="button"
          onClick={() => onAct(v.filter!)}
          className="group shrink-0 self-start rounded-lg border border-fg/15 bg-bg px-3.5 py-2 text-sm font-semibold text-fg-strong shadow-sm transition-all hover:-translate-y-px hover:border-fg/25 hover:shadow-pop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:self-auto"
        >
          <span className="inline-flex items-center gap-1.5">
            {v.cta}
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vitals — rendered from server totals only.
// ---------------------------------------------------------------------------
function VitalsRow({ totals, loading }: { totals: UETotals | null; loading?: boolean }): JSX.Element {
  const coverage = totals && totals.total_count > 0 ? totals.measurable_count / totals.total_count : 0;
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
      <VitalTile
        icon={Coins}
        tone="accent"
        label="Annual profit pool (true margin)"
        loading={loading}
        value={<AnimatedNumber value={totals?.profit_pool_annual ?? 0} format={(n) => formatIls(n)} />}
        sub={totals?.concentration_top3_pct != null ? `Top 3 drive ${formatPct(totals.concentration_top3_pct, 0)}` : "At the current 90-day pace"}
        meter={totals?.concentration_top3_pct != null ? Math.min(1, totals.concentration_top3_pct / 100) : null}
      />
      <VitalTile
        icon={AlertTriangle}
        tone={totals && totals.loss_count > 0 ? "danger" : "success"}
        label="Profit at risk"
        loading={loading}
        value={totals && totals.loss_count > 0
          ? <AnimatedNumber value={totals.risk_annual} format={(n) => formatIls(n)} />
          : <span>None</span>}
        sub={totals && totals.loss_count > 0 ? `${totals.loss_count} below water after costs · per year` : "Nothing loses money after costs"}
        meter={null}
      />
      <VitalTile
        icon={HelpCircle}
        tone={totals && totals.needs_data > 0 ? "warning" : "success"}
        label="Data coverage"
        loading={loading}
        value={<span><AnimatedNumber value={totals?.measurable_count ?? 0} format={(n) => formatQtyInt(Math.round(n))} /><span className="text-fg-subtle">/{totals?.total_count ?? 0}</span></span>}
        sub={totals && totals.needs_data > 0 ? `${totals.needs_data} blocked — see row reasons` : "Every product can be judged"}
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
      <div className="text-2xs text-fg-subtle">{loading ? " " : sub}</div>
      {meter != null && !loading ? (
        <div className="h-1 w-full overflow-hidden rounded-full bg-bg-muted/70" aria-hidden>
          <div className={`h-full rounded-full ${toneBar[tone]} transition-[width] duration-700 ease-out-quart`} style={{ width: `${Math.max(3, meter * 100)}%`, opacity: 0.85 }} />
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Segment card
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
      <span className="absolute inset-x-0 top-0 h-0.5" style={{ backgroundColor: meta.fill, opacity: active ? 0.9 : 0.5 }} aria-hidden />
      <div className="flex items-center gap-1.5">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-md" style={{ backgroundColor: `${meta.fill}1f` }}>
          <Icon className="h-3.5 w-3.5" style={{ color: meta.fill }} />
        </span>
        <span className="text-2xs font-semibold uppercase tracking-sops text-fg-subtle">{meta.label}</span>
      </div>
      <div className="text-2xl font-bold tabular-nums tracking-tight text-fg-strong">{loading ? <span className="text-fg-faint">·</span> : count}</div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-bg-muted/60" aria-hidden>
        <div className="h-full rounded-full transition-[width] duration-500 ease-out-quart" style={{ width: loading ? "0%" : `${Math.max(count > 0 ? 8 : 0, share * 100)}%`, backgroundColor: meta.fill, opacity: 0.8 }} />
      </div>
      <div className="text-2xs text-fg-subtle">{loading ? " " : moneyLine}</div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Sparkline + trend icon (presentational)
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
// Inspector — the readout panel. Every number is a served field; the
// waterfall lists the server's own decomposition of CM2.
// ---------------------------------------------------------------------------
function Inspector({ item, windowDays }: { item: ViewItem | null; windowDays: number }): JSX.Element {
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
  const r = item.row;
  const basisLabel = r.price_basis === "REALIZED_90D" ? "Realized (Shopify 90d)" : r.price_basis === "MANUAL" ? "Manual price" : "No price";
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
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-2xs">
          <span className="rounded-full border border-border/60 bg-bg-subtle/50 px-2 py-0.5 text-fg-subtle">{basisLabel}</span>
          {r.price_anomaly ? <span className="rounded-full border border-warning/50 bg-warning-softer/50 px-2 py-0.5 text-warning-fg">Units sold, no revenue — manual price used</span> : null}
          {r.stale ? <span className="rounded-full border border-warning/50 bg-warning-softer/50 px-2 py-0.5 text-warning-fg">Sales sync stale</span> : null}
        </div>
      </div>

      {item.decision === "needs_data" && r.judge_block_reason ? (
        <p className="rounded-lg border border-border/50 bg-bg-subtle/40 px-3 py-2 text-xs leading-relaxed text-fg-muted">
          {REASON_COPY[r.judge_block_reason] ?? d.blurb}
        </p>
      ) : (
        <p className="text-xs leading-relaxed text-fg-subtle">{d.blurb}</p>
      )}

      {/* CM2 waterfall — the server's decomposition, rendered as-is */}
      {r.unit_price_ils != null ? (
        <div className="space-y-1 rounded-lg border border-border/50 bg-bg-subtle/30 px-3 py-2.5">
          <div className="mb-1 text-2xs font-semibold uppercase tracking-sops text-fg-subtle">Unit waterfall</div>
          <WaterfallLine label="Unit price" value={r.unit_price_ils} strong />
          <WaterfallLine label={`Channel fees (${formatPct(toNum(r.fees_pct_total) ?? 0, 1)})`} value={r.fees_per_unit_ils} negative />
          <WaterfallLine label="Materials" value={r.materials_cogs_ils} negative />
          <WaterfallLine label="Margin after materials (CM1)" value={r.cm1_ils} strong divider />
          <WaterfallLine label="Operating cost / unit" value={r.opex_per_unit_ils} negative />
          <WaterfallLine label="Shipping / order share" value={r.per_order_alloc_ils} negative />
          <WaterfallLine label="True margin (CM2)" value={r.cm2_ils} strong divider danger={(toNum(r.cm2_ils) ?? 0) < 0} />
        </div>
      ) : null}

      {/* Target price callout */}
      {item.targetPrice != null ? (
        <div className="flex items-center justify-between rounded-lg border border-accent/30 bg-accent-soft/40 px-3 py-2">
          <span className="text-xs font-medium text-fg">Target price for a healthy margin</span>
          <span className="text-sm font-bold tabular-nums text-fg-strong">{formatIls(item.targetPrice)}</span>
        </div>
      ) : null}

      {item.series.length >= 2 ? (
        <div className="flex items-center justify-between rounded-lg border border-border/50 bg-bg-subtle/40 px-3 py-2">
          <span className="text-2xs uppercase tracking-sops text-fg-subtle">{windowDays}d vs prior {windowDays}d</span>
          <span className="flex items-center gap-1.5"><Sparkline values={item.series} trend={item.trend} /><TrendIcon trend={item.trend} /></span>
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-border/50 pt-3 text-sm">
        <Stat label="True margin %" value={item.cm2Pct != null ? formatPct(item.cm2Pct, 1) : "—"} strong danger={item.cm2Pct != null && item.cm2Pct < 0} />
        <Stat label={`Orders ${windowDays}d`} value={String(r.order_count_90d)} />
        <Stat label={`Contribution ${windowDays}d`} value={item.contribution != null ? formatIls(item.contribution) : "—"} strong danger={item.contribution != null && item.contribution < 0} />
        <Stat label={`Units ${windowDays}d`} value={formatQtyInt(item.units)} />
        <Stat label="On hand" value={formatQtyInt(toNum(r.qty_on_hand) ?? 0)} />
        <Stat label="Stock @ cost" value={item.invAtCost != null ? formatIls(item.invAtCost) : "—"} />
      </dl>
    </div>
  );
}

function WaterfallLine({
  label, value, negative, strong, divider, danger,
}: { label: string; value: string | null; negative?: boolean; strong?: boolean; divider?: boolean; danger?: boolean }): JSX.Element {
  const n = toNum(value);
  return (
    <div className={`flex items-center justify-between gap-2 text-xs ${divider ? "border-t border-border/50 pt-1" : ""}`}>
      <span className={strong ? "font-semibold text-fg" : "text-fg-subtle"}>{label}</span>
      <span className={`tabular-nums ${danger ? "font-bold text-danger-fg" : strong ? "font-semibold text-fg-strong" : "text-fg"}`}>
        {n == null ? "—" : `${negative && n > 0 ? "−" : ""}${formatIls(negative ? Math.abs(n) : n)}`}
      </span>
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
// Rules popover — thresholds come from the server meta (one knob).
// ---------------------------------------------------------------------------
function RulesPopover({ velMedian, windowDays, targetPct }: { velMedian: number; windowDays: number; targetPct: number }): JSX.Element {
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
          <p className="mb-2 font-semibold text-fg-strong">Transparent rules — computed on the server</p>
          <ul className="space-y-1.5 text-fg-subtle">
            <li>• <b className="text-fg">True margin (CM2)</b> = realized price − materials − labor/overhead − shipping share − channel fees. All ex-VAT.</li>
            <li>• Price = actual Shopify revenue ÷ units ({windowDays}d). Manual price only when there are no sales — always labeled.</li>
            <li>• <b className="text-fg">Healthy</b> = CM2 ≥ {targetPct}% (the same target that prices the Target-price column).</li>
            <li>• <b className="text-fg">High velocity</b> = units ≥ this factory&apos;s median of selling products ({formatQtyInt(velMedian)} in {windowDays}d).</li>
            <li>• <b className="text-success-fg">Star</b> protect · <b className="text-info-fg">Gem</b> promote · <b className="text-warning-fg">Workhorse</b> reprice · <b className="text-warning-fg">Drag</b> review · <b className="text-danger-fg">Losing money</b> act now.</li>
            <li>• <b>Needs data</b>: the row says exactly what&apos;s missing.</li>
          </ul>
          <p className="mt-2 border-t border-border/40 pt-2 text-3xs text-fg-subtle">
            Operating costs are yours to set — the &quot;Operating costs&quot; button on this page. Every change is audit-logged and recalculates the whole board.
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
// Quadrant — zero-dependency interactive SVG scatter. Y is now TRUE margin
// (cm2_pct); the healthy split is the server's target_pct.
// ---------------------------------------------------------------------------
function Quadrant({
  items, velMedian, targetPct, activeId, onHover, windowDays,
}: {
  items: ViewItem[]; velMedian: number; targetPct: number; activeId: string | null; onHover: (id: string | null) => void; windowDays: number;
}): JSX.Element {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 30); return () => clearTimeout(t); }, []);

  const plotted = items.filter((i) => i.decision !== "needs_data" && i.cm2Pct != null);

  const W = 880, H = 520, padL = 60, padR = 24, padT = 28, padB = 52;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const peakUnits = Math.max(0, ...plotted.map((i) => i.units));
  const maxUnits = Math.max(velMedian * 2, peakUnits * 1.12, 10);
  const margins = plotted.map((i) => i.cm2Pct ?? 0);
  const maxMargin = Math.max(40, Math.ceil((Math.max(0, ...margins) + 5) / 10) * 10);
  const minMargin = Math.min(0, Math.floor((Math.min(0, ...margins) - 5) / 10) * 10);

  const xOf = (u: number) => padL + (u / maxUnits) * plotW;
  const yOf = (m: number) => padT + (1 - (m - minMargin) / (maxMargin - minMargin || 1)) * plotH;
  const maxContrib = Math.max(1, ...plotted.map((i) => Math.abs(i.contribution ?? 0)));
  const rOf = (c: number | null) => 6 + Math.sqrt(Math.abs(c ?? 0) / maxContrib) * 24;

  const xSplit = xOf(velMedian), ySplit = yOf(targetPct), yZero = yOf(0);

  const step = maxMargin - minMargin > 80 ? 20 : 10;
  const yTicks: number[] = [];
  for (let m = minMargin; m <= maxMargin + 0.001; m += step) yTicks.push(m);
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxUnits);

  const ranked = [...plotted].sort((a, b) => Math.abs(b.contribution ?? 0) - Math.abs(a.contribution ?? 0));
  const labelled = new Set(ranked.slice(0, 5).map((i) => i.id));
  const haloed = new Set(ranked.slice(0, 3).map((i) => i.id));
  const active = plotted.find((i) => i.id === activeId) ?? null;

  const keys: DecisionKey[] = ["star", "gem", "workhorse", "drag", "loss", "dormant"];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="group" aria-label="True margin versus velocity portfolio map. Each product is a selectable point; the table below lists every product." data-testid="quadrant">
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
      <text x={padL + 4} y={ySplit - 4} className="fill-current" fontSize="9" opacity={0.45}>{targetPct}% target</text>

      {/* quadrant captions */}
      <text x={padL + plotW - 6} y={padT + 15} textAnchor="end" className="fill-current" fontSize="11" fontWeight={600} opacity={0.5}>★ Stars · protect</text>
      <text x={padL + 6} y={padT + 15} textAnchor="start" className="fill-current" fontSize="11" fontWeight={600} opacity={0.5}>◆ Gems · promote</text>
      <text x={padL + plotW - 6} y={padT + plotH - 8} textAnchor="end" className="fill-current" fontSize="11" fontWeight={600} opacity={0.5}>⚙ Workhorses · reprice</text>
      <text x={padL + 6} y={padT + plotH - 8} textAnchor="start" className="fill-current" fontSize="11" fontWeight={600} opacity={0.5}>▽ Drag · review</text>

      {/* axis titles */}
      <text x={padL + plotW / 2} y={H - 8} textAnchor="middle" className="fill-current" fontSize="11" opacity={0.6}>Units sold (last {windowDays}d) →</text>
      <text x={16} y={padT + plotH / 2} textAnchor="middle" className="fill-current" fontSize="11" opacity={0.6} transform={`rotate(-90 16 ${padT + plotH / 2})`}>True margin % →</text>

      {/* halos */}
      <g clipPath="url(#db-plot)">
        {plotted.filter((i) => haloed.has(i.id)).map((i) => (
          <circle
            key={`halo-${i.id}`}
            cx={xOf(i.units)} cy={yOf(i.cm2Pct ?? 0)} r={mounted ? rOf(i.contribution) + 7 : 0}
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
          <line x1={padL} y1={yOf(active.cm2Pct ?? 0)} x2={padL + plotW} y2={yOf(active.cm2Pct ?? 0)} stroke={DECISION[active.decision].fill} strokeOpacity={0.4} strokeDasharray="3 3" />
        </g>
      ) : null}

      {/* bubbles */}
      {plotted.map((i, idx) => {
        const cx = xOf(i.units), cy = yOf(i.cm2Pct ?? 0), r = rOf(i.contribution);
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
              aria-label={`${i.name}: ${d.label}, ${d.action}. True margin ${i.cm2Pct != null ? `${i.cm2Pct.toFixed(1)}%` : "unknown"}, ${formatQtyInt(i.units)} units, contribution ${i.contribution != null ? formatIls(i.contribution) : "unknown"}.`}
              style={{ transition: `r 600ms cubic-bezier(.22,1,.36,1) ${idx * 25}ms, fill-opacity 150ms, stroke-width 150ms`, filter: isActive ? "drop-shadow(0 2px 6px rgba(0,0,0,0.18))" : "none" }}
              onMouseEnter={() => onHover(i.id)}
              onClick={() => onHover(i.id)}
              onFocus={() => onHover(i.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onHover(i.id); } }}
            >
              <title>{i.name} · true margin {i.cm2Pct != null ? `${i.cm2Pct.toFixed(1)}%` : "—"} · {formatQtyInt(i.units)} units · contribution {i.contribution != null ? formatIls(i.contribution) : "—"}</title>
            </circle>
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
