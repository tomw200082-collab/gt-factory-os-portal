"use client";

// ---------------------------------------------------------------------------
// /dashboard — GRADUATED dashboard (R0-1, 2026-05-08).
//
// Authority: Tom approval 2026-05-08 (decision R0-1) + dashboard-graduation
// handoff packet docs/phase8/ux/dashboard-graduation-handoff-2026-05-08.md.
//
// What graduated:
//   - Break-glass banner (was v2 only — FLOW-DG-002 P0).
//   - QuickActions launcher (was defined but never rendered — FLOW-DG-001 P0).
//     Canonical source: src/features/dashboard/quick-actions.ts (role-filtered).
//   - Critical Today block — full state hygiene (loading/error/empty/loaded),
//     Retry, detail hints, accessible markup. Replaces v1 inline section.
//   - Slipped Plans block — same. Replaces v1 inline section.
//   - WorkflowHeader (eyebrow / title / freshness meta).
//   - SectionCard wrapper.
//
// Design-system upgrade:
//   - All colors now flow through Tailwind tokens (text-accent, bg-accent,
//     border-success, bg-warning-softer, etc). No more inline hex strings.
//   - The previous local C={teal:"#22D3A3"...} token object is gone.
//
// New deep-link affordances (FLOW-DG-005/006/007):
//   - PlanningCard: "Open run" link when a completed run exists.
//   - RecentProduction: footer "View movement log" link.
//   - ExceptionsCard: "Open inbox" link.
//
// /dashboard/v2 is now a permanent redirect to this page.
//
// Dashboard audit pass (2026-05-16):
//   - Open Purchase Orders KPI added to the hero strip (count + open value +
//     late count), sourced from /api/purchase-orders.
//   - Recent Movements panel added — last 3 stock-ledger postings of any kind
//     (/api/stock/ledger), distinct from the production-only Recent actuals.
//   - Hero strip is now the five run-the-factory numbers; Stock Health donut
//     moved beside Planning. KPI tiles gained icons + deep links.
//   - Header carries a greeting, the date, and a combined inventory value.
//   - RM/FG value cards read the API's uncapped `by_type` rollup instead of
//     fields the handler never emitted (which left both cards showing "—").
//
// UX/UI polish — 10 iterations (2026-05-16):
//   1.  Reveal cascade — sections fade-and-rise in a staggered sequence.
//   2.  Personalised greeting — operator first name from the session.
//   3.  Card tactility — KPI tiles lift, shadow and ring on hover/focus.
//   4.  Section count chips — every list section sizes up at a glance.
//   5.  Critical-today escalation — calm when clear, loud when not.
//   6.  Shimmer skeletons — a light sweep replaces the flat opacity pulse.
//   7.  Empty-state iconography — every empty panel carries an icon.
//   8.  Accessibility — aria-live regions, labelled donut, focus rings.
//   9.  Donut draw-in — arcs sweep from zero on mount.
//   10. Live affordance — an "auto-refreshing" pill in the header.
//   All motion is gated behind motion-reduce for vestibular safety.
//
// Urgent Procurement block (Stage 4, 2026-05-17):
//   - New "Live" block between Critical today and Slipped plans, rendered for
//     planner + admin only (gated at the call site so the query never mounts
//     for other roles). Surfaces this week's purchase-session supplier orders
//     that are overdue, due today, or flagged urgent-tier, each deep-linking
//     into /planning/procurement (Tranche 047 — repointed from the
//     superseded purchase-session URL). Calm green when nothing is due.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Coins,
  Flame,
  Inbox,
  LineChart,
  Minus,
  PackageCheck,
  PackageSearch,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { useInventoryFlow } from "@/app/(planning)/planning/inventory-flow/_lib/useInventoryFlow";
import type { FlowItem } from "@/app/(planning)/planning/inventory-flow/_lib/types";
import { SectionCard } from "@/components/workflow/SectionCard";
import { ScrollFade } from "@/components/ui/ScrollFade";
import { SectionHeading } from "@/components/workflow/SectionHeading";
import { Badge } from "@/components/badges/StatusBadge";
import { FreshnessBadge } from "@/components/badges/FreshnessBadge";
import {
  AllClearRibbon,
  EmptyState,
  ErrorAlert,
  Skel,
  SkeletonRow,
} from "@/components/feedback/states";
import { useSession } from "@/lib/auth/session-provider";
import { authorizeCapability } from "@/lib/auth/authorize";
import { cn } from "@/lib/cn";
import { fmtNumStr } from "@/lib/utils/format-quantity";
import { QUICK_ACTIONS } from "@/features/dashboard/quick-actions";
import { useCurrentSession } from "@/app/(planning)/planning/purchase-session/_lib/api";
import type {
  PoTier,
  PurchaseSessionPo,
} from "@/app/(planning)/planning/purchase-session/_lib/types";
import { DashboardHero } from "./_components/DashboardHero";
import { KpiTile, KpiTileBreakdown } from "./_components/KpiTile";
import { StockHealthCard } from "./_components/StockHealthCard";
import { MovementBars, RangeSelector, TrendAreaChart } from "./_components/TrendChart";
import {
  bucketTotal,
  dailyCounts,
  dailyFlow,
  trendDelta,
  type DayBucket,
  type FlowDayBucket,
  type TrendDelta,
} from "./_lib/trends";
import {
  reconstructValueSeries,
  type ValueMovement,
  type ValueTrendResult,
} from "./_lib/value-trend";
import { useNow } from "./_lib/useNow";

// ---------------------------------------------------------------------------
// Cadence — keep low for the morning view; refresh on tab focus is the default.
// ---------------------------------------------------------------------------
const STALE_TIME_MS = 60_000;

// Cache keys — canonical post-graduation namespace under "dashboard".
// Stock value query key is shared with /inventory so React Query
// dedupes — one fetch, one cache, identical numbers on both pages.
// Previously this lived under ["dashboard", "stock", "value"] which made
// the two pages fetch independently and show different numbers when
// master-data costs were edited between the two requests.
const QK_VALUE = ["stock", "value"] as const;
const QK_EXCEPTIONS = ["dashboard", "exceptions", "open"] as const;
const QK_PLANNING_LATEST = ["dashboard", "planning", "runs", "latest"] as const;
const QK_PRODUCTION_PLAN = ["dashboard", "production-plan"] as const;
const QK_PRODUCTION_ACTUALS = ["dashboard", "production-actuals", "recent"] as const;
const QK_CRITICAL_TODAY = ["dashboard", "critical-today"] as const;
const QK_SLIPPED_PLANS = ["dashboard", "slipped-plans"] as const;
const QK_BREAK_GLASS = ["dashboard", "break-glass"] as const;
const QK_PURCHASE_ORDERS = ["dashboard", "purchase-orders", "all"] as const;
const QK_RECENT_MOVEMENTS = ["dashboard", "stock", "ledger", "recent"] as const;
// Trend queries (tranche 039) — separate keys + larger windows than the
// "recent" snapshots above, so the 3-row/5-row panels keep their own cache.
const QK_PROD_TREND = ["dashboard", "production-actuals", "trend"] as const;
const QK_MOVEMENTS_TREND = ["dashboard", "stock", "ledger", "trend"] as const;
const QK_VALUE_COSTS = ["dashboard", "economics", "rm-costs"] as const;

// Trend window — 14 days is the default; the band's RangeSelector lets the
// operator switch between 7 / 14 / 30 days. 14 also gives trendDelta a clean
// 7-vs-prior-7 split.
const TREND_DAYS = 14;
const TREND_RANGES = [7, 14, 30] as const;
// Upper bound on rows pulled for the trend aggregation. Generous enough to
// cover a busy fortnight without unbounded payloads.
const TREND_ROW_LIMIT = 300;

// ---------------------------------------------------------------------------
// API response types.
// ---------------------------------------------------------------------------
// Mirror of api/src/stock/schemas.ts StockValueResponse. `by_type` is the
// authoritative, uncapped per-item_type rollup — the dashboard reads it
// directly rather than re-aggregating the (capped) per-item `rows` array.
interface StockValueTypeBucket {
  item_type: string;
  value_ils: string;
  priced_sku_count: number;
  unpriced_sku_count: number;
  total_sku_count: number;
}
interface StockValueResponse {
  as_of?: string | null;
  total_value_ils?: string | null;
  items_with_cost?: number | null;
  items_without_cost?: number | null;
  by_type?: StockValueTypeBucket[] | null;
}

// Minimal mirror of the economics raw-materials response — used only to build
// an item_id → current unit-cost map for the (indicative) inventory-value
// reconstruction. Components are keyed by component_id upstream.
interface RawMaterialCostRow {
  component_id: string;
  item_type?: string | null;
  effective_cost_ils?: string | null;
}
interface RawMaterialCostResponse {
  rows?: RawMaterialCostRow[];
  data?: RawMaterialCostRow[];
}

interface ExceptionRow {
  exception_id: string;
  severity: "critical" | "warning" | "info" | string;
  status: string;
}
interface ExceptionsResponse {
  rows?: ExceptionRow[];
  data?: ExceptionRow[];
  total?: number;
}

interface PlanningRunRow {
  run_id: string;
  executed_at: string;
  summary?: {
    purchase_recs_count?: number;
    production_recs_count?: number;
    exceptions_count?: number;
  };
}
interface PlanningRunsResponse {
  rows?: PlanningRunRow[];
  data?: PlanningRunRow[];
}

interface ProductionPlanRow {
  item_id: string;
  item_name?: string | null;
  plan_date: string;
  planned_qty: number | string;
  completed_qty?: number | string | null;
  planned_remaining_qty?: number | string | null;
  status?: string | null;
}
interface ProductionPlanResponse {
  rows?: ProductionPlanRow[];
  data?: ProductionPlanRow[];
}

interface ProductionActualRow {
  actual_id?: string;
  item_id: string;
  item_name?: string | null;
  output_qty: number | string;
  submitted_at?: string | null;
  produced_at?: string | null;
}
interface ProductionActualsResponse {
  rows?: ProductionActualRow[];
  data?: ProductionActualRow[];
}

interface CriticalTodayRow {
  trigger_kind: string;
  display_name: string;
  severity: string;
  triggered_at: string;
  detail_jsonb: unknown;
}
interface CriticalTodayResponse {
  rows: CriticalTodayRow[];
  as_of: string;
}

interface SlippedPlanRow {
  plan_id: string;
  plan_date: string;
  item_id: string;
  item_name: string | null;
  planned_qty: string;
  uom: string;
  source_recommendation_id: string | null;
  slipped_at: string;
  updated_at: string;
  days_overdue: number;
}
interface SlippedPlansResponse {
  rows: SlippedPlanRow[];
  as_of: string;
  window_days: 7;
}

interface BreakGlassResponse {
  break_glass_active: boolean;
  jobs_paused: boolean;
  set_at: string | null;
}

interface PurchaseOrderRow {
  po_id: string;
  po_number: string;
  supplier_name?: string | null;
  status: string;
  expected_receive_date?: string | null;
  currency?: string | null;
  total_net?: string | number | null;
}
interface PurchaseOrdersResponse {
  rows?: PurchaseOrderRow[];
  data?: PurchaseOrderRow[];
  count?: number;
}

interface LedgerRow {
  movement_id: string;
  movement_type: string;
  item_type?: string | null;
  item_id: string;
  item_name?: string | null;
  qty_delta: string | number;
  uom: string;
  event_at: string;
  posted_at?: string | null;
  reported_by_snapshot?: string | null;
  po_number?: string | null;
}
interface LedgerResponse {
  rows?: LedgerRow[];
  data?: LedgerRow[];
  total?: number;
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------
async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
  return (await res.json()) as T;
}

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

function fmtILS(n: number | null | undefined): string {
  if (n == null) return "—";
  // NBSP between currency symbol and number so they never wrap apart at
  // large font sizes inside narrow KPI tiles.
  return "₪ " + n.toLocaleString("he-IL", { maximumFractionDigits: 0 });
}

// Compact ILS formatter — used inside the KPI tile primary value, where
// the card is narrow at lg+ (4-col layout collapses each tile to ~160px
// wide). Truthful: shows the same number in a more compact form (M / K
// suffix). The full value is still surfaced via the `title` tooltip on
// the KPI tile so nothing is hidden from the operator.
function fmtILSCompact(n: number | null | undefined): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    // 107,885,432 → "₪ 107.9M" — drop trailing ".0" so round millions
    // read as "₪ 5M" not "₪ 5.0M".
    const millions = n / 1_000_000;
    const formatted = millions.toFixed(1).replace(/\.0$/, "");
    return "₪ " + formatted + "M";
  }
  if (abs >= 10_000) {
    // 12,345 → "₪ 12K" — only K for amounts >= 10K so smaller numbers
    // keep full precision.
    return "₪ " + Math.round(n / 1000) + "K";
  }
  return "₪ " + n.toLocaleString("he-IL", { maximumFractionDigits: 0 });
}

function fmtRelative(iso: string | null | undefined, now: Date): string {
  if (!iso) return "—";
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "—";
  const delta = now.getTime() - ts;
  if (delta < 0) return "just now";
  const mins = Math.round(delta / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function fmtAbsolute(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtPlanDate(s: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  try {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
      month: "short",
      day: "2-digit",
    });
  } catch {
    return s;
  }
}

// Tranche 059 (DASH-T5): local-time day boundaries. The previous
// toISOString() version computed the Sun–Sat window in UTC, so in Israel the
// week flipped at 02:00/03:00 local instead of midnight.
function weekRange(today: Date): { from: string; to: string } {
  const day = today.getDay();
  const sun = new Date(today);
  sun.setDate(today.getDate() - day);
  const sat = new Date(sun);
  sat.setDate(sun.getDate() + 6);
  return { from: isoDateLocal(sun), to: isoDateLocal(sat) };
}

// ---------------------------------------------------------------------------
// Critical-today helpers — derive small render hints from detail_jsonb without
// inventing values (PBR-3 opaque payload).
// ---------------------------------------------------------------------------
interface DetailHint {
  body: string | null;
  link: { href: string; label: string } | null;
}

function pickString(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== "object") return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function pickNumber(obj: unknown, key: string): number | null {
  if (!obj || typeof obj !== "object") return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "number" ? v : null;
}

function detailHintFor(row: CriticalTodayRow): DetailHint {
  const d = row.detail_jsonb;
  switch (row.trigger_kind) {
    case "stockout": {
      const itemId = pickString(d, "item_id");
      const eod = pickNumber(d, "projected_on_hand_eod");
      const body =
        eod !== null
          ? `Projected on-hand at end of day: ${eod}.`
          : itemId
            ? `Item ${itemId} is out of stock today.`
            : null;
      const link = itemId
        ? {
            href: `/inventory?item_id=${encodeURIComponent(itemId)}`,
            label: "Open inventory",
          }
        : null;
      return { body, link };
    }
    case "planning_fail_hard": {
      const exceptionId = pickString(d, "exception_id");
      const category = pickString(d, "category");
      const body = category ? `Planning blocker: ${category}.` : "Planning fail-hard exception.";
      const link = exceptionId
        ? {
            href: `/exceptions?id=${encodeURIComponent(exceptionId)}`,
            label: "Open exception",
          }
        : { href: "/planning/blockers", label: "Open blockers" };
      return { body, link };
    }
    case "integration_critical_stale": {
      const producer = pickString(d, "producer");
      const ageMinutes = pickNumber(d, "age_minutes");
      const body =
        producer && ageMinutes !== null
          ? `${producer} has not run in ${ageMinutes} minutes.`
          : producer
            ? `${producer} integration is critical-stale.`
            : "An integration is critical-stale.";
      return {
        body,
        link: { href: "/admin/integrations", label: "Open integrations" },
      };
    }
    case "break_glass": {
      const flagKey = pickString(d, "flag_key");
      const body = flagKey ? `Active flag: ${flagKey}.` : "Break-glass mode is active.";
      return {
        body,
        link: { href: "/admin/integrations#break-glass", label: "Open break-glass" },
      };
    }
    default:
      return { body: null, link: null };
  }
}

function triggerKindLabel(kind: string): string {
  switch (kind) {
    case "stockout":
      return "Stockout";
    case "planning_fail_hard":
      return "Planning fail-hard";
    case "integration_critical_stale":
      return "Integration stale";
    case "break_glass":
      return "Break-glass";
    default:
      return kind;
  }
}

// ---------------------------------------------------------------------------
// Movement-log registry — compact mirror of the movement-log page registry.
// Maps a raw movement_type to an operator-facing label, a direction, and a
// glyph. Direction drives the qty colour (in = success, out = neutral/danger).
// ---------------------------------------------------------------------------
type MoveDir = "in" | "out" | "audit" | "reversal" | "unknown";

const MOVEMENT_REGISTRY: Record<string, { label: string; dir: MoveDir; glyph: string }> = {
  GR_POSTED: { label: "Goods Receipt", dir: "in", glyph: "↓" },
  GR_REVERSAL: { label: "GR Reversal", dir: "reversal", glyph: "↶" },
  WASTE_POSTED: { label: "Waste / Adjustment", dir: "out", glyph: "✕" },
  WASTE_REVERSAL: { label: "Waste Reversal", dir: "reversal", glyph: "↶" },
  LIONWHEEL_PICK: { label: "Shipment Pick", dir: "out", glyph: "→" },
  LIONWHEEL_UNPICK: { label: "Shipment Pick Reversal", dir: "reversal", glyph: "↶" },
  FG_OUT_PICK: { label: "Shipment Pick", dir: "out", glyph: "→" },
  FG_OUT_PICK_REVERSAL: { label: "Shipment Pick Reversal", dir: "reversal", glyph: "↶" },
  production_output: { label: "Production Output", dir: "in", glyph: "↑" },
  production_consumption: { label: "Production Consumption", dir: "out", glyph: "↓" },
  production_scrap: { label: "Production Scrap", dir: "audit", glyph: "·" },
  COUNT_ADJUST: { label: "Count Adjustment", dir: "audit", glyph: "=" },
};

function moveMeta(raw: string): { label: string; dir: MoveDir; glyph: string } {
  return (
    MOVEMENT_REGISTRY[raw] ?? {
      label: raw
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      dir: "unknown",
      glyph: "•",
    }
  );
}

// ---------------------------------------------------------------------------
// Time-of-day greeting — small warmth on the morning view. Iteration 2 adds
// the operator's first name when the session carries a display name.
// ---------------------------------------------------------------------------
function greeting(now: Date, name?: string | null): string {
  const h = now.getHours();
  const base = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${base}, ${first}` : base;
}

function fmtToday(now: Date): string {
  return now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Shared shells — Tranche 049 (VISUAL-014): Skel, SkeletonRow, AllClearRibbon
// and ErrorAlert moved to @/components/feedback/states (named exports,
// visuals unchanged). TitleCount replaced by the <Badge> primitive at call
// sites. This page defines zero local feedback components.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Quick Actions launcher (FLOW-DG-001) — canonical source: quick-actions.ts.
// Role-filtered via authorizeCapability. Hides actions the user lacks.
// ---------------------------------------------------------------------------
function QuickActionsLauncher() {
  const { session } = useSession();
  const role = session?.role ?? "viewer";
  const visible = useMemo(
    () => QUICK_ACTIONS.filter((a) => authorizeCapability(role, a.required)),
    [role],
  );
  if (visible.length === 0) return null;

  return (
    <SectionCard
      className="dash-panel"
      eyebrow="Quick actions"
      title="Jump to a workflow"
      description="Most-used workflows for your role."
    >
      {/* Tranche 051 (FLOW-009): right-edge fade signals more actions exist
          off-screen while the strip scrolls horizontally (<sm). */}
      <ScrollFade
        className="-mx-1 sm:mx-0"
        contentClassName="flex gap-2.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:px-0 sm:pb-0"
      >
        {visible.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.href}
              href={a.href}
              className="dash-quick-action group"
              title={a.blurb}
            >
              <Icon
                className="h-4 w-4 text-fg-subtle transition-colors duration-150 ease-out-quart group-hover:text-accent"
                strokeWidth={2}
              />
              {a.label}
              <ArrowRight
                className="h-3 w-3 -translate-x-1 opacity-0 transition-all duration-150 ease-out-quart group-hover:translate-x-0 group-hover:opacity-100 motion-reduce:transition-none"
                strokeWidth={2}
                aria-hidden
              />
            </Link>
          );
        })}
      </ScrollFade>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Break-glass banner (FLOW-DG-002) — DCT2-2 dual-surface pattern.
// ---------------------------------------------------------------------------
function BreakGlassBanner() {
  const q = useQuery({
    queryKey: QK_BREAK_GLASS,
    queryFn: ({ signal }) => fetchJson<BreakGlassResponse>("/api/system/break-glass", signal),
    staleTime: STALE_TIME_MS,
  });
  const bg = q.data;
  const active = bg?.break_glass_active === true || bg?.jobs_paused === true;
  if (!active) return null;
  return (
    <div
      className="flex items-start gap-3 rounded border border-warning/60 bg-warning-softer px-4 py-3 text-sm text-warning-fg"
      role="alert"
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" strokeWidth={2} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">System is in break-glass read-only mode.</div>
        <div className="mt-0.5 text-xs leading-relaxed text-fg-muted">
          Writes paused. Jobs paused. Reads continue. See the Critical today block for the
          trigger row, or open Integrations to release.
        </div>
      </div>
      <Link
        href="/admin/integrations#break-glass"
        className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-warning-fg hover:underline"
      >
        Open
        <ArrowRight className="h-3 w-3" strokeWidth={2} />
      </Link>
    </div>
  );
}


function Legend({ dotClass, label, n }: { dotClass: string; label: string; n: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("dot", dotClass)} aria-hidden />
      <span className="flex-1 text-fg-muted">{label}</span>
      <span className="font-semibold tabular-nums text-fg-strong">{n}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shortage risk.
// ---------------------------------------------------------------------------
function ShortageRisk({ items, loading }: { items: FlowItem[]; loading?: boolean }) {
  const shortageItems = useMemo(
    () =>
      items
        .filter(
          (i) =>
            i.risk_tier === "critical" || i.risk_tier === "stockout" || i.risk_tier === "watch",
        )
        .sort((a, b) => a.days_of_cover - b.days_of_cover)
        .slice(0, 6),
    [items],
  );

  function urgencyClasses(d: number): { text: string; bg: string; border: string; bar: string } {
    if (d <= 2)
      return {
        text: "text-danger",
        bg: "bg-danger-softer",
        border: "border-danger/30",
        bar: "bg-danger",
      };
    if (d <= 5)
      return {
        text: "text-warning",
        bg: "bg-warning-softer",
        border: "border-warning/30",
        bar: "bg-warning",
      };
    return {
      text: "text-accent",
      bg: "bg-accent-soft/30",
      border: "border-accent/30",
      bar: "bg-accent",
    };
  }

  return (
    <SectionCard
      className="dash-panel"
      eyebrow="Shortage risk"
      title={
        <span>
          Items at risk in horizon
          {shortageItems.length > 0 ? (
            <Badge tone="warning" size="sm" className="ml-2 align-middle tabular-nums">
              {shortageItems.length}
            </Badge>
          ) : null}
        </span>
      }
      description="Days to projected stockout · top 6 items"
    >
      {loading ? (
        <div className="flex flex-col gap-2">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : shortageItems.length === 0 ? (
        <EmptyState
          title="No items at shortage risk."
          description="No items are projected to fall below zero in the current horizon."
          icon={<CheckCircle2 className="h-5 w-5 text-success" strokeWidth={2} />}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {shortageItems.map((item) => {
            const d = item.days_of_cover;
            const u = urgencyClasses(d);
            return (
              <li key={item.item_id}>
                <Link
                  href={`/planning/inventory-flow/${item.item_id}`}
                  className={cn(
                    "flex items-center gap-3 rounded border px-3 py-2.5 text-fg-strong transition-colors hover:bg-bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                    u.border,
                    u.bg,
                  )}
                >
                  <div className={cn("min-w-[60px] text-right", u.text)}>
                    <span className="text-3xl font-semibold tabular-nums tracking-tighter">
                      {Math.round(d)}
                    </span>
                    <span className="ml-0.5 text-sm font-semibold opacity-70">d</span>
                  </div>
                  <div className="h-7 w-px bg-border/60" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{item.item_name}</div>
                    <div className="mt-0.5 text-2xs text-fg-muted">
                      {item.current_on_hand.toLocaleString()} on hand
                    </div>
                  </div>
                  <div className="w-20 shrink-0">
                    <div className="h-1 overflow-hidden rounded bg-bg-muted">
                      <div
                        className={cn("h-full rounded", u.bar)}
                        style={{ width: `${Math.max(8, (d / 14) * 100)}%`, opacity: 0.75 }}
                      />
                    </div>
                    <div className="mt-1 text-right text-3xs text-fg-faint">
                      {Math.round((d / 14) * 100)}% horizon
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Planning card — FLOW-DG-005: adds Open run deep-link when run_id present.
// ---------------------------------------------------------------------------
function PlanningCard({ run, loading }: { run: PlanningRunRow | null; loading?: boolean }) {
  const totalRecs =
    (run?.summary?.purchase_recs_count ?? 0) + (run?.summary?.production_recs_count ?? 0);
  const exceptions = run?.summary?.exceptions_count ?? 0;
  const lastRun = run?.executed_at ?? null;

  return (
    <SectionCard
      className="dash-panel"
      eyebrow="Planning run"
      title="Latest completed run"
      description="Recommendations, exceptions, and timing of the last run."
      actions={
        run ? (
          <Link
            href={`/planning/runs/${encodeURIComponent(run.run_id)}`}
            className="inline-flex items-center gap-1 rounded text-xs font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            Open run
            <ArrowRight className="h-3 w-3" strokeWidth={2} />
          </Link>
        ) : undefined
      }
    >
      {loading ? (
        <div className="flex flex-col gap-3">
          <Skel h={50} w="60%" />
          <Skel h={32} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <div className="text-4xl font-semibold tabular-nums tracking-tighter text-fg-strong">
              {run ? totalRecs : "—"}
            </div>
            <div className="mt-1 text-xs text-fg-muted">
              {run ? "recommendations · latest run" : "No completed run found"}
            </div>
          </div>
          {run && (
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="warning" variant="soft">
                {exceptions} exception{exceptions !== 1 ? "s" : ""}
              </Badge>
              <Badge tone="success" variant="soft">
                {run.summary?.purchase_recs_count ?? 0} purchase
              </Badge>
              <Badge tone="info" variant="soft">
                {run.summary?.production_recs_count ?? 0} production
              </Badge>
            </div>
          )}
          <div className="border-t border-border/60 pt-3">
            <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Last run
            </div>
            <div
              className="mt-1 text-xs font-semibold text-fg-muted"
              title={fmtAbsolute(lastRun)}
            >
              {lastRun ? fmtAbsolute(lastRun) : "—"}
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Production this week.
// ---------------------------------------------------------------------------
interface ProdWeekItem {
  item_id: string;
  item_name: string;
  planned: number;
  completed: number;
  remaining: number;
  current_on_hand: number;
  toneClass: string;
}

const TONE_BG_CYCLE = ["bg-accent", "bg-success", "bg-info", "bg-warning", "bg-danger"];

function ProductionWeek({ rows, loading }: { rows: ProdWeekItem[]; loading?: boolean }) {
  return (
    <SectionCard
      className="dash-panel"
      eyebrow="Production this week"
      title={
        <span>
          Planned vs completed
          {rows.length > 0 ? (
            <Badge tone="neutral" size="sm" className="ml-2 align-middle tabular-nums">
              {rows.length}
            </Badge>
          ) : null}
        </span>
      }
      description="Top 5 items by planned quantity in the current week."
    >
      {loading ? (
        <div className="flex flex-col gap-4">
          <Skel h={52} />
          <Skel h={52} />
          <Skel h={52} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<PackageSearch className="h-5 w-5 text-fg-subtle" strokeWidth={2} />}
          title="No production planned for this week."
          description="No daily-plan rows exist for the current Sun–Sat window."
        />
      ) : (
        <div className="flex flex-col gap-5">
          {rows.map((item) => {
            const total = item.planned;
            const done = item.completed;
            const pctDone = total > 0 ? (done / total) * 100 : 0;
            return (
              <div key={item.item_id}>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-fg-strong">
                    {item.item_name}
                  </span>
                  <span className="shrink-0 text-2xs text-fg-muted">
                    <span className="font-semibold text-fg-strong">
                      +{item.planned.toLocaleString()}
                    </span>
                    {" planned · "}
                    {item.completed.toLocaleString()} done
                  </span>
                </div>
                <div className="relative h-2 overflow-hidden rounded bg-bg-muted">
                  <div
                    className={cn("absolute inset-y-0 rounded opacity-25", item.toneClass)}
                    style={{ width: "100%" }}
                  />
                  <div
                    className={cn("absolute inset-y-0 rounded", item.toneClass)}
                    style={{ width: `${pctDone}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-3xs text-fg-faint">
                  <span>Done: {item.completed.toLocaleString()}</span>
                  <span>On hand: {item.current_on_hand.toLocaleString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Recent production — FLOW-DG-006: adds View movement log footer link.
// ---------------------------------------------------------------------------
function RecentProduction({
  rows,
  now,
  loading,
}: {
  rows: ProductionActualRow[];
  now: Date;
  loading?: boolean;
}) {
  return (
    <SectionCard
      className="dash-panel"
      eyebrow="Recent production"
      title={
        <span>
          Last 5 actuals
          {rows.length > 0 ? (
            <Badge tone="neutral" size="sm" className="ml-2 align-middle tabular-nums">
              {rows.length}
            </Badge>
          ) : null}
        </span>
      }
      description="Most recent production output postings."
      footer={
        <Link
          href="/stock/movement-log"
          className="inline-flex items-center gap-1 rounded text-xs font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          View movement log
          <ArrowRight className="h-3 w-3" strokeWidth={2} />
        </Link>
      }
    >
      {loading ? (
        <div className="flex flex-col gap-2">
          <Skel h={44} />
          <Skel h={44} />
          <Skel h={44} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-5 w-5 text-fg-subtle" strokeWidth={2} />}
          title="No recent production actuals."
          description="No production-actual postings have been recorded yet."
        />
      ) : (
        <ul className="flex flex-col">
          {rows.map((r, i) => {
            const name = r.item_name ?? r.item_id;
            const qty = toNum(r.output_qty);
            const time = fmtRelative(r.submitted_at ?? r.produced_at, now);
            return (
              <li
                key={r.actual_id ?? `${r.item_id}-${i}`}
                className={cn(
                  "flex items-center gap-3 px-2 py-2.5",
                  i < rows.length - 1 ? "border-b border-border/60" : "",
                  i === 0 ? "rounded bg-success-softer/40" : "",
                )}
              >
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-2xs font-semibold",
                    i === 0
                      ? "border-success/40 bg-success/10 text-success"
                      : "border-border/60 bg-bg-muted text-fg-muted",
                  )}
                >
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-fg-strong">{name}</div>
                  <div className="mt-0.5 text-3xs text-fg-muted">{time}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-base font-semibold tabular-nums text-success">
                    +{qty.toLocaleString()}
                  </div>
                  <div className="text-3xs text-fg-faint">units</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Recent movements — last 3 rows from the stock ledger (movement log).
// Distinct from "Recent production": this surfaces every movement kind
// (goods receipts, shipments, waste, counts), not just production output.
// ---------------------------------------------------------------------------
function RecentMovements({
  rows,
  now,
  loading,
  error,
  onRetry,
}: {
  rows: LedgerRow[];
  now: Date;
  loading?: boolean;
  error?: boolean;
  onRetry: () => void;
}) {
  const DIR_PILL: Record<MoveDir, string> = {
    in: "bg-success-softer text-success-fg ring-1 ring-success/20",
    out: "bg-bg-subtle text-fg ring-1 ring-border",
    audit: "bg-info-softer text-info-fg ring-1 ring-info/20",
    reversal: "bg-info-softer text-info-fg ring-1 ring-info/30",
    unknown: "bg-bg-subtle text-fg-subtle ring-1 ring-border",
  };

  return (
    <SectionCard
      className="dash-panel"
      eyebrow="Stock ledger"
      title={
        <span className="inline-flex items-center gap-2">
          <ArrowLeftRight className="h-4 w-4 text-accent" strokeWidth={2.25} />
          Recent movements
        </span>
      }
      description="The 3 most recent postings to the stock ledger."
      footer={
        <Link
          href="/stock/movement-log"
          className="inline-flex items-center gap-1 rounded text-xs font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          View movement log
          <ArrowRight className="h-3 w-3" strokeWidth={2} />
        </Link>
      }
    >
      {loading ? (
        <div className="flex flex-col gap-2">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : error ? (
        <ErrorAlert label="Recent movements unavailable." onRetry={onRetry} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-5 w-5 text-fg-subtle" strokeWidth={2} />}
          title="No movements recorded yet."
          description="No rows have been posted to the stock ledger."
        />
      ) : (
        <ul className="flex flex-col gap-2" aria-live="polite">
          {rows.slice(0, 3).map((r) => {
            const meta = moveMeta(r.movement_type);
            const qty = toNum(r.qty_delta);
            const positive = qty > 0;
            const name = r.item_name ?? r.item_id;
            const when = r.posted_at ?? r.event_at;
            return (
              <li
                key={r.movement_id}
                className="flex items-center gap-3 rounded border border-border/70 bg-bg-raised px-3 py-2.5"
              >
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-2xs font-medium",
                    DIR_PILL[meta.dir],
                  )}
                  title={`${meta.label} (${r.movement_type})`}
                >
                  <span aria-hidden className="font-mono">
                    {meta.glyph}
                  </span>
                  {meta.label}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-fg-strong">{name}</div>
                  <div
                    className="mt-0.5 text-3xs text-fg-muted"
                    title={fmtAbsolute(when)}
                  >
                    {fmtRelative(when, now)}
                    {r.po_number ? ` · PO ${r.po_number}` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div
                    className={cn(
                      "text-base font-semibold tabular-nums",
                      positive ? "text-success" : "text-fg-strong",
                    )}
                  >
                    {positive ? "+" : ""}
                    {qty.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                  </div>
                  <div className="text-3xs uppercase text-fg-faint">{r.uom}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Trend band (tranche 039) — the dashboard's first time-series visualisations.
// Both charts aggregate the COUNT of postings per day (UOM-agnostic, honest)
// rather than summed mixed-unit quantities. See _lib/trends.ts.
// ---------------------------------------------------------------------------

// Neutral direction chip — "up" means more activity, not necessarily "good",
// so the chip stays tonally neutral (accent for movement, muted for flat) and
// never implies a value judgement.
function TrendChip({ delta, days }: { delta: TrendDelta; days: number }) {
  const half = Math.floor(days / 2);
  const Icon =
    delta.direction === "up" ? TrendingUp : delta.direction === "down" ? TrendingDown : Minus;
  const toneClass =
    delta.direction === "flat"
      ? "bg-bg-muted text-fg-subtle"
      : "bg-accent-soft/50 text-accent";
  const label =
    delta.pct === null
      ? `vs prior ${half}d`
      : `${delta.pct >= 0 ? "+" : ""}${Math.round(delta.pct)}% vs prior ${half}d`;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold tabular-nums",
        toneClass,
      )}
      title={`Most recent ${half} days compared with the ${half} days before.`}
    >
      <Icon className="h-3 w-3" strokeWidth={2.25} aria-hidden />
      {label}
    </span>
  );
}

function ProductionActivityCard({
  buckets,
  days,
  loading,
  error,
  onRetry,
}: {
  buckets: DayBucket[];
  days: number;
  loading?: boolean;
  error?: boolean;
  onRetry: () => void;
}) {
  const total = bucketTotal(buckets);
  const delta = trendDelta(buckets);
  return (
    <SectionCard
      className="dash-panel"
      eyebrow="Trends"
      title={
        <span className="inline-flex items-center gap-2">
          <Activity className="h-4 w-4 text-accent" strokeWidth={2.25} />
          Production activity
        </span>
      }
      description={`Output postings per day · last ${days} days`}
      footer={<span>Source: production actuals · counts per day over {days} days</span>}
    >
      {loading ? (
        <div className="flex flex-col gap-3">
          <Skel h={20} w="40%" />
          <Skel h={96} />
        </div>
      ) : error ? (
        <ErrorAlert label="Production activity unavailable." onRetry={onRetry} />
      ) : total === 0 ? (
        <EmptyState
          icon={<PackageSearch className="h-5 w-5 text-fg-subtle" strokeWidth={2} />}
          title={`No production in the last ${days} days.`}
          description="No production-actual postings were recorded in this window."
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-4xl font-semibold tabular-nums tracking-tighter text-fg-strong">
                {total.toLocaleString()}
              </div>
              <div className="mt-0.5 text-xs text-fg-muted">postings · last {days} days</div>
            </div>
            <TrendChip delta={delta} days={days} />
          </div>
          <TrendAreaChart
            buckets={buckets}
            unitLabel="postings"
            ariaLabel={`Production postings per day over the last ${days} days. ${total} total. Use arrow keys to inspect each day.`}
          />
        </div>
      )}
    </SectionCard>
  );
}

function MovementFlowCard({
  buckets,
  days,
  loading,
  error,
  onRetry,
}: {
  buckets: FlowDayBucket[];
  days: number;
  loading?: boolean;
  error?: boolean;
  onRetry: () => void;
}) {
  const inboundTotal = buckets.reduce((s, b) => s + b.inbound, 0);
  const outboundTotal = buckets.reduce((s, b) => s + b.outbound, 0);
  const total = inboundTotal + outboundTotal;
  return (
    <SectionCard
      className="dash-panel"
      eyebrow="Trends"
      title={
        <span className="inline-flex items-center gap-2">
          <ArrowLeftRight className="h-4 w-4 text-accent" strokeWidth={2.25} />
          Stock movement flow
        </span>
      }
      description={`Inbound vs outbound postings per day · last ${days} days`}
      footer={<span>Source: stock ledger · counts per day over {days} days</span>}
    >
      {loading ? (
        <div className="flex flex-col gap-3">
          <Skel h={20} w="40%" />
          <Skel h={96} />
        </div>
      ) : error ? (
        <ErrorAlert label="Stock movement flow unavailable." onRetry={onRetry} />
      ) : total === 0 ? (
        <EmptyState
          icon={<Inbox className="h-5 w-5 text-fg-subtle" strokeWidth={2} />}
          title={`No movements in the last ${days} days.`}
          description="No rows were posted to the stock ledger in this window."
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="dot bg-success" aria-hidden />
              <span className="text-fg-muted">Inbound</span>
              <span className="font-semibold tabular-nums text-fg-strong">
                {inboundTotal.toLocaleString()}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="dot bg-fg-subtle" aria-hidden />
              <span className="text-fg-muted">Outbound</span>
              <span className="font-semibold tabular-nums text-fg-strong">
                {outboundTotal.toLocaleString()}
              </span>
            </span>
          </div>
          <MovementBars
            buckets={buckets}
            ariaLabel={`Stock movement postings per day over the last ${days} days: ${inboundTotal} inbound, ${outboundTotal} outbound. Use arrow keys to inspect each day.`}
          />
        </div>
      )}
    </SectionCard>
  );
}

// Indicative inventory-value trend (RM+PKG). Honest about its nature: anchored
// to today's real snapshot value, reconstructed backward from real movements
// priced at current cost, and degrades to a calm state when cost coverage is
// too low to be trustworthy. Gated to cost-aware roles by the caller.
function InventoryValueCard({
  result,
  anchorValue,
  days,
  loading,
  error,
  onRetry,
}: {
  result: ValueTrendResult | null;
  anchorValue: number | null;
  days: number;
  loading?: boolean;
  error?: boolean;
  onRetry: () => void;
}) {
  const points = result?.points ?? [];
  const coveragePct = result ? Math.round(result.coverage * 100) : 0;
  // Tranche 042 — drawable threshold raised 50% → 75%: below 75% cost
  // coverage the reconstructed line is too speculative to draw.
  const lowCoverage = !!result && result.movementCount > 0 && result.coverage < 0.75;
  const first = points[0]?.value ?? null;
  const change = anchorValue !== null && first !== null ? anchorValue - first : null;
  const changePct = change !== null && first ? (change / first) * 100 : null;
  const footerNote =
    result && result.movementCount === 0
      ? "Indicative · no stock movements in this window · valued at current prices"
      : `Indicative · reconstructed from movements, valued at current prices · ${coveragePct}% cost coverage`;

  return (
    <SectionCard
      className="dash-panel"
      eyebrow="Trends"
      title={
        <span className="inline-flex items-center gap-2">
          <LineChart className="h-4 w-4 text-info" strokeWidth={2.25} />
          Inventory value
          <span className="rounded-full bg-bg-muted px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            Indicative
          </span>
        </span>
      }
      description={`RM + packaging value · reconstructed · last ${days} days`}
      footer={<span>{footerNote}</span>}
    >
      {loading ? (
        <div className="flex flex-col gap-3">
          <Skel h={20} w="40%" />
          <Skel h={96} />
        </div>
      ) : error ? (
        <ErrorAlert label="Inventory value trend unavailable." onRetry={onRetry} />
      ) : anchorValue === null || result === null ? (
        <EmptyState
          icon={<Coins className="h-5 w-5 text-fg-subtle" strokeWidth={2} />}
          title="Inventory value unavailable."
          description="The current stock-value snapshot is needed to anchor the trend."
        />
      ) : lowCoverage ? (
        <EmptyState
          icon={<LineChart className="h-5 w-5 text-fg-subtle" strokeWidth={2} />}
          title="Not enough cost coverage to reconstruct."
          description={`Only ${coveragePct}% of stock movements in this window resolved to a unit cost, so a value line would be misleading.`}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div
                className="text-4xl font-semibold tabular-nums tracking-tighter text-fg-strong"
                title={fmtILS(anchorValue)}
              >
                {fmtILSCompact(anchorValue)}
              </div>
              <div className="mt-0.5 text-xs text-fg-muted">RM + packaging · today</div>
            </div>
            {change !== null ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold tabular-nums",
                  Math.abs(change) < 1
                    ? "bg-bg-muted text-fg-subtle"
                    : change > 0
                      ? "bg-success/15 text-success"
                      : "bg-bg-muted text-fg-subtle",
                )}
                title={`Change over the last ${days} days (indicative).`}
              >
                {change > 0 ? (
                  <TrendingUp className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                ) : change < 0 ? (
                  <TrendingDown className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                ) : (
                  <Minus className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                )}
                {change >= 0 ? "+" : "−"}
                {fmtILSCompact(Math.abs(change))}
                {changePct !== null ? ` (${changePct >= 0 ? "+" : ""}${Math.round(changePct)}%)` : ""}
              </span>
            ) : null}
          </div>
          <TrendAreaChart
            buckets={points}
            tone="info"
            zeroBased={false}
            unitLabel="indicative value"
            formatValue={(v) => fmtILSCompact(v)}
            ariaLabel={`Indicative RM and packaging inventory value over the last ${days} days, reconstructed from stock movements. Current value ${fmtILS(
              anchorValue,
            )}. Use arrow keys to inspect each day.`}
          />
        </div>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Critical Today block — graduated v2 implementation. Full state hygiene.
// ---------------------------------------------------------------------------
function CriticalTodayBlock({ now }: { now: Date }) {
  const query = useQuery({
    queryKey: QK_CRITICAL_TODAY,
    queryFn: ({ signal }) =>
      fetchJson<CriticalTodayResponse>("/api/dashboard/critical-today", signal),
    staleTime: STALE_TIME_MS,
  });

  const rows = query.data?.rows ?? [];
  const asOf = query.data?.as_of;
  // Iteration 5 — escalation: the block is loud (danger border, pulsing
  // flame, count chip) only while something is actually critical. When the
  // floor is clear it drops to the calm default tone with a green check.
  const hot = rows.length > 0;

  return (
    <SectionCard
      tone={hot ? "danger" : "default"}
      className={cn("dash-panel dash-live-block", hot && "is-hot shadow-pop")}
      eyebrow="Live"
      title={
        <span className="inline-flex items-center gap-2">
          {hot ? (
            <Flame
              className="h-4 w-4 text-danger animate-pulse-soft motion-reduce:animate-none"
              strokeWidth={2.25}
            />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-success" strokeWidth={2.25} />
          )}
          Critical today
          {rows.length > 0 ? (
            <Badge tone="danger" size="sm" className="ml-2 align-middle tabular-nums">
              {rows.length}
            </Badge>
          ) : null}
        </span>
      }
      description="What stops production today if nothing is done."
      footer={
        asOf ? (
          <span>
            Source: live factory signals · updated {fmtRelative(asOf, now)}
          </span>
        ) : undefined
      }
    >
      {query.isLoading ? (
        <div className="flex flex-col gap-2">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : query.isError ? (
        <ErrorAlert label="Critical issues unavailable." onRetry={() => query.refetch()} />
      ) : rows.length === 0 ? (
        <AllClearRibbon
          title="All clear · no critical issues today."
          description="No stockouts, no fail-hard planning exceptions, no critical-stale integrations, no active break-glass."
        />
      ) : (
        <ul className="flex flex-col gap-2" aria-live="polite">
          {rows.map((row, idx) => {
            const hint = detailHintFor(row);
            return (
              <li
                key={`${row.trigger_kind}-${row.triggered_at}-${idx}`}
                className="flex flex-col gap-1.5 rounded border border-danger/40 bg-bg-raised px-3 py-3 sm:flex-row sm:items-start sm:gap-3"
              >
                <div className="flex items-center gap-2 sm:w-44 sm:shrink-0">
                  <Badge tone="danger" variant="solid" dotted>
                    {triggerKindLabel(row.trigger_kind)}
                  </Badge>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-fg-strong">{row.display_name}</div>
                  {hint.body ? (
                    <div className="mt-0.5 text-xs leading-relaxed text-fg-muted">{hint.body}</div>
                  ) : null}
                  <div
                    className="mt-1 text-2xs text-fg-faint"
                    title={fmtAbsolute(row.triggered_at)}
                  >
                    Triggered {fmtRelative(row.triggered_at, now)}
                  </div>
                </div>
                {hint.link ? (
                  <Link
                    href={hint.link.href}
                    className="inline-flex shrink-0 items-center gap-1 self-start rounded text-xs font-semibold text-danger-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40 sm:self-center"
                  >
                    {hint.link.label}
                    <ArrowRight className="h-3 w-3" strokeWidth={2} />
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Slipped Plans block — graduated v2 implementation.
// ---------------------------------------------------------------------------
function SlippedPlansBlock({ now }: { now: Date }) {
  const query = useQuery({
    queryKey: QK_SLIPPED_PLANS,
    queryFn: ({ signal }) =>
      fetchJson<SlippedPlansResponse>("/api/dashboard/slipped-plans", signal),
    staleTime: STALE_TIME_MS,
  });

  const rows = query.data?.rows ?? [];
  const asOf = query.data?.as_of;
  const windowDays = query.data?.window_days ?? 7;
  const hasRows = rows.length > 0;

  return (
    <SectionCard
      tone={hasRows ? "warning" : "default"}
      className={cn("dash-panel dash-live-block", hasRows && "is-warm")}
      eyebrow="Live"
      title={
        <span className="inline-flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-warning" strokeWidth={2.25} />
          Slipped plans
          {rows.length > 0 ? (
            <Badge tone="warning" size="sm" className="ml-2 align-middle tabular-nums">
              {rows.length}
            </Badge>
          ) : null}
        </span>
      }
      description={`Planned production from the last ${windowDays} days that was not posted as an actual.`}
      footer={
        asOf ? (
          <span>
            Source: production plan · window {windowDays} days · updated{" "}
            {fmtRelative(asOf, now)}
          </span>
        ) : undefined
      }
    >
      {query.isLoading ? (
        <div className="flex flex-col gap-2">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : query.isError ? (
        <ErrorAlert label="Slipped plans unavailable." onRetry={() => query.refetch()} />
      ) : rows.length === 0 ? (
        <AllClearRibbon
          title={`No slipped plans in the past ${windowDays} days.`}
          description="Every past plan in this window has a posted actual or was cancelled by the planner."
        />
      ) : (
        <ul className="flex flex-col gap-2" aria-live="polite">
          {rows.map((row) => {
            const planLink = `/planning/production-plan?from=${encodeURIComponent(
              row.plan_date,
            )}&to=${encodeURIComponent(row.plan_date)}`;
            const overdueLabel =
              row.days_overdue === 1 ? "1 day overdue" : `${row.days_overdue} days overdue`;
            return (
              <li
                key={row.plan_id}
                className="flex flex-col gap-1.5 rounded border border-border/70 bg-bg-raised px-3 py-3 sm:flex-row sm:items-start sm:gap-3"
              >
                <div className="flex flex-wrap items-center gap-2 sm:w-44 sm:shrink-0">
                  <Badge tone="warning" variant="soft">
                    {fmtPlanDate(row.plan_date)}
                  </Badge>
                  <Badge tone="danger" variant="outline">
                    {overdueLabel}
                  </Badge>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-fg-strong">
                    {row.item_name ?? row.item_id}
                  </div>
                  <div className="mt-0.5 text-xs leading-relaxed text-fg-muted">
                    Planned: <span className="font-mono">{fmtNumStr(row.planned_qty)}</span> {row.uom}
                  </div>
                </div>
                <Link
                  href={planLink}
                  className="inline-flex shrink-0 items-center gap-1 self-start rounded text-xs font-semibold text-fg-strong hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:self-center"
                >
                  Open plan
                  <ArrowRight className="h-3 w-3" strokeWidth={2} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Urgent Procurement block (Stage 4) — surfaces purchase-session supplier
// orders that need ordering now: overdue, due today, or urgent-tier. The
// block is rendered for planner/admin only, gated at the call site so the
// /api/purchase-session/current query never mounts for other roles.
// ---------------------------------------------------------------------------
type ProcUrgency = "overdue" | "today" | "soon";

interface ProcRow {
  po: PurchaseSessionPo;
  urgency: ProcUrgency;
  // Whole days from today to the order-by date. Negative = overdue.
  days: number | null;
}

const PROC_TIER_LABEL: Record<PoTier, string> = {
  urgent: "Urgent",
  must: "Must",
  recommended: "Recommended",
};
const PROC_TIER_TONE: Record<PoTier, "danger" | "warning" | "info"> = {
  urgent: "danger",
  must: "warning",
  recommended: "info",
};

function isoDateLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

// Whole-day count from `todayISO` to `targetISO`. Negative = in the past.
function daysFromToday(targetISO: string, todayISO: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetISO) || !/^\d{4}-\d{2}-\d{2}$/.test(todayISO)) {
    return null;
  }
  const [ty, tm, td] = targetISO.split("-").map(Number);
  const [cy, cm, cd] = todayISO.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(cy, cm - 1, cd)) / 86_400_000);
}

function fmtCost(n: number, currency: string): string {
  const num = Math.round(n).toLocaleString("he-IL");
  return currency && currency !== "ILS" ? `${num} ${currency}` : `₪ ${num}`;
}

function UrgentProcurementBlock({ now }: { now: Date }) {
  const query = useCurrentSession();
  const todayISO = useMemo(() => isoDateLocal(now), [now]);
  const session = query.data?.session ?? null;

  const rows = useMemo<ProcRow[]>(() => {
    if (!session) return [];
    const out: ProcRow[] = [];
    for (const po of session.pos) {
      // Only orders the planner still has to act on — placed and skipped
      // POs are done with.
      if (po.status !== "proposed" && po.status !== "approved") continue;
      const days = daysFromToday(po.order_by_date, todayISO);
      const dueOrPast = days !== null && days <= 0;
      // Urgent-tier orders surface even when their order-by date is upcoming;
      // everything else only surfaces once it is due today or overdue.
      if (!dueOrPast && po.tier !== "urgent") continue;
      const urgency: ProcUrgency =
        days !== null && days < 0 ? "overdue" : days === 0 ? "today" : "soon";
      out.push({ po, urgency, days });
    }
    // Overdue first (most overdue leads), then due-today, then urgent upcoming.
    out.sort((a, b) => (a.days ?? 9_999) - (b.days ?? 9_999));
    return out;
  }, [session, todayISO]);

  const dangerCount = rows.filter((r) => r.urgency !== "soon").length;
  const hot = dangerCount > 0;
  const tone: "danger" | "warning" | "default" = hot
    ? "danger"
    : rows.length > 0
      ? "warning"
      : "default";

  const hasWarm = !hot && rows.length > 0;
  return (
    <SectionCard
      tone={tone}
      className={cn(
        "dash-panel dash-live-block",
        hot && "is-hot shadow-pop",
        hasWarm && "is-warm",
      )}
      eyebrow="Live"
      title={
        <span className="inline-flex items-center gap-2">
          {hot ? (
            <ShoppingCart
              className="h-4 w-4 text-danger animate-pulse-soft motion-reduce:animate-none"
              strokeWidth={2.25}
            />
          ) : rows.length > 0 ? (
            <ShoppingCart className="h-4 w-4 text-warning" strokeWidth={2.25} />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-success" strokeWidth={2.25} />
          )}
          Urgent procurement
          {rows.length > 0 ? (
            <Badge
              tone={hot ? "danger" : "warning"}
              size="sm"
              className="ml-2 align-middle tabular-nums"
            >
              {rows.length}
            </Badge>
          ) : null}
        </span>
      }
      description="Supplier orders from this week's procurement session that need ordering now — overdue, due today, or flagged urgent."
      actions={
        <Link
          href="/planning/procurement"
          className="inline-flex items-center gap-1 rounded text-xs font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          Open procurement
          <ArrowRight className="h-3 w-3" strokeWidth={2} />
        </Link>
      }
      footer={
        session ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              {session.session_type === "weekly" ? "Weekly" : "Off-cycle"} session · started{" "}
              {fmtRelative(session.created_at, now)}
            </span>
            <span aria-hidden className="text-fg-faint">
              ·
            </span>
            <Link
              href="/planning/procurement"
              className="font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              View procurement calendar
            </Link>
          </span>
        ) : undefined
      }
    >
      {query.isLoading ? (
        <div className="flex flex-col gap-2">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : query.isError ? (
        <ErrorAlert label="Purchase session unavailable." onRetry={() => query.refetch()} />
      ) : !session ? (
        <EmptyState
          icon={<ShoppingCart className="h-5 w-5 text-fg-subtle" strokeWidth={2} />}
          title="No purchase session this week."
          description="Start the weekly procurement session to generate consolidated supplier order drafts."
        />
      ) : rows.length === 0 ? (
        <AllClearRibbon
          title="All procurement is on track."
          description="No supplier orders are overdue, due today, or flagged urgent. Upcoming orders appear in the procurement calendar view."
        />
      ) : (
        <ul className="flex flex-col gap-2" aria-live="polite">
          {rows.map(({ po, urgency, days }) => {
            const liveLines = po.lines.filter((l) => !l.is_dropped).length;
            const urgencyLabel =
              urgency === "overdue"
                ? `${Math.abs(days ?? 0)}d overdue`
                : urgency === "today"
                  ? "Due today"
                  : days !== null
                    ? `In ${days}d`
                    : "Urgent";
            const isDanger = urgency !== "soon";
            return (
              <li
                key={po.session_po_id}
                className={cn(
                  "flex flex-col gap-1.5 rounded border bg-bg-raised px-3 py-3 sm:flex-row sm:items-start sm:gap-3",
                  isDanger ? "border-danger/40" : "border-warning/40",
                )}
              >
                <div className="flex flex-wrap items-center gap-2 sm:w-44 sm:shrink-0">
                  <Badge
                    tone={isDanger ? "danger" : "warning"}
                    variant={isDanger ? "solid" : "soft"}
                    dotted={isDanger}
                  >
                    {urgencyLabel}
                  </Badge>
                  <Badge tone={PROC_TIER_TONE[po.tier]} variant="outline">
                    {PROC_TIER_LABEL[po.tier]}
                  </Badge>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-fg-strong">
                    {po.supplier_snapshot}
                  </div>
                  <div className="mt-0.5 text-xs leading-relaxed text-fg-muted">
                    {liveLines} line{liveLines !== 1 ? "s" : ""}
                    {" · "}
                    <span className="font-mono tabular-nums">
                      {fmtCost(po.total_cost, po.currency)}
                    </span>
                  </div>
                  <div className="mt-1 text-2xs text-fg-faint" title={po.order_by_date}>
                    Order by {fmtPlanDate(po.order_by_date)}
                    {po.status === "approved" ? " · approved, not yet placed" : ""}
                  </div>
                </div>
                <Link
                  href="/planning/procurement"
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 self-start rounded text-xs font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 sm:self-center",
                    isDanger
                      ? "text-danger-fg focus-visible:ring-danger/40"
                      : "text-fg-strong focus-visible:ring-accent/40",
                  )}
                >
                  Open
                  <ArrowRight className="h-3 w-3" strokeWidth={2} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Page.
// ---------------------------------------------------------------------------
export default function DashboardPage() {
  // Tranche 059 (DASH-T1): live shared ticker replaces the frozen
  // mount-time Date, so relative labels stay truthful across a shift.
  const now = useNow();
  const todayLocalISO = isoDateLocal(now);
  const week = weekRange(now);
  const { session } = useSession();

  // The Urgent Procurement block reads the planner-scoped purchase session.
  // Gate it here so the query never mounts for viewers/operators.
  const role = session?.role ?? "viewer";
  const canSeePurchasing = role === "planner" || role === "admin";
  // The indicative inventory-value trend reads per-item unit costs from the
  // economics surface, so it is gated to the same cost-aware roles as
  // purchasing — viewers/operators never see (or fetch) cost data.
  const canSeeValueTrend = role === "planner" || role === "admin";

  // Shared range for the operational-trends band (7 / 14 / 30 days). The trend
  // queries already fetch a 30-day-deep window, so switching range only
  // re-aggregates client-side — no refetch.
  const [rangeDays, setRangeDays] = useState<number>(TREND_DAYS);

  // Inventory flow drives Stock Health + Shortage Risk + on-hand context.
  const flowQ = useInventoryFlow({});

  const valueQ = useQuery({
    queryKey: QK_VALUE,
    queryFn: ({ signal }) => fetchJson<StockValueResponse>("/api/stock/value", signal),
    staleTime: STALE_TIME_MS,
    refetchInterval: STALE_TIME_MS,
  });

  const exceptionsQ = useQuery({
    queryKey: QK_EXCEPTIONS,
    queryFn: ({ signal }) =>
      fetchJson<ExceptionsResponse>("/api/exceptions?status=OPEN&page_size=200", signal),
    staleTime: STALE_TIME_MS,
    refetchInterval: STALE_TIME_MS,
  });

  const planningQ = useQuery({
    queryKey: QK_PLANNING_LATEST,
    queryFn: ({ signal }) =>
      fetchJson<PlanningRunsResponse>("/api/planning/runs?status=completed&limit=1", signal),
    staleTime: 120_000,
  });

  const productionQ = useQuery({
    queryKey: [...QK_PRODUCTION_PLAN, week.from, week.to],
    queryFn: ({ signal }) =>
      fetchJson<ProductionPlanResponse>(
        `/api/production-plan?from=${week.from}&to=${week.to}`,
        signal,
      ),
    staleTime: STALE_TIME_MS,
  });

  const actualsQ = useQuery({
    queryKey: QK_PRODUCTION_ACTUALS,
    queryFn: ({ signal }) =>
      fetchJson<ProductionActualsResponse>("/api/production-actuals/history?limit=5", signal),
    staleTime: STALE_TIME_MS,
    refetchInterval: STALE_TIME_MS,
  });

  const purchaseOrdersQ = useQuery({
    queryKey: QK_PURCHASE_ORDERS,
    queryFn: ({ signal }) =>
      fetchJson<PurchaseOrdersResponse>("/api/purchase-orders?limit=500", signal),
    staleTime: STALE_TIME_MS,
    refetchInterval: STALE_TIME_MS,
  });

  const movementsQ = useQuery({
    queryKey: QK_RECENT_MOVEMENTS,
    queryFn: ({ signal }) =>
      fetchJson<LedgerResponse>("/api/stock/ledger?limit=3", signal),
    staleTime: STALE_TIME_MS,
    refetchInterval: STALE_TIME_MS,
  });

  // Trend queries (tranche 039) — larger windows, aggregated client-side into
  // per-day counts. Separate query keys so the recent-snapshot panels above
  // keep their own (smaller) caches untouched.
  const prodTrendQ = useQuery({
    queryKey: QK_PROD_TREND,
    queryFn: ({ signal }) =>
      fetchJson<ProductionActualsResponse>(
        `/api/production-actuals/history?limit=${TREND_ROW_LIMIT}`,
        signal,
      ),
    staleTime: STALE_TIME_MS,
  });

  const movementsTrendQ = useQuery({
    queryKey: QK_MOVEMENTS_TREND,
    queryFn: ({ signal }) =>
      fetchJson<LedgerResponse>(`/api/stock/ledger?limit=${TREND_ROW_LIMIT}`, signal),
    staleTime: STALE_TIME_MS,
  });

  // Per-item current unit costs for the indicative value reconstruction.
  // Gated to cost-aware roles; the query simply never mounts otherwise.
  const valueCostsQ = useQuery({
    queryKey: QK_VALUE_COSTS,
    queryFn: ({ signal }) =>
      fetchJson<RawMaterialCostResponse>("/api/economics/raw-materials", signal),
    staleTime: 120_000,
    enabled: canSeeValueTrend,
  });

  // Mirror queries for the at-a-glance factory-state chip. These share
  // queryKeys with the inline block components (CriticalTodayBlock and
  // SlippedPlansBlock), so React Query dedupes — no extra network traffic.
  const criticalTodayQ = useQuery({
    queryKey: QK_CRITICAL_TODAY,
    queryFn: ({ signal }) =>
      fetchJson<CriticalTodayResponse>("/api/dashboard/critical-today", signal),
    staleTime: STALE_TIME_MS,
  });
  const slippedPlansQ = useQuery({
    queryKey: QK_SLIPPED_PLANS,
    queryFn: ({ signal }) =>
      fetchJson<SlippedPlansResponse>("/api/dashboard/slipped-plans", signal),
    staleTime: STALE_TIME_MS,
  });

  // Derived: stock health from inventory-flow.
  const flowItems = flowQ.data?.items ?? [];
  const healthy = flowItems.filter((i) => i.risk_tier === "healthy").length;
  const watch = flowItems.filter((i) => i.risk_tier === "watch").length;
  const critical = flowItems.filter(
    (i) => i.risk_tier === "critical" || i.risk_tier === "stockout",
  ).length;
  const total = flowItems.length;

  // Derived: inventory values. The /api/stock/value response carries an
  // uncapped per-item_type rollup in `by_type`. The dashboard composes two
  // cards from it:
  //   FG card = item_type 'FG'
  //   RM card = item_type 'RM' + 'PKG' (raw materials + packaging)
  // `value_ils` already excludes unpriced items; `unpriced_sku_count` is
  // surfaced so the figure stays honest about its coverage.
  const stockValue = useMemo(() => {
    const buckets = valueQ.data?.by_type ?? [];
    const bucket = (t: string) => buckets.find((b) => b.item_type === t);
    const fg = bucket("FG");
    const rm = bucket("RM");
    const pkg = bucket("PKG");
    const hasData = buckets.length > 0;
    return {
      rmValue: hasData
        ? Number(rm?.value_ils ?? 0) + Number(pkg?.value_ils ?? 0)
        : null,
      fgValue: hasData ? Number(fg?.value_ils ?? 0) : null,
      rmSkus: (rm?.total_sku_count ?? 0) + (pkg?.total_sku_count ?? 0),
      fgSkus: fg?.total_sku_count ?? 0,
      rmUnpriced: (rm?.unpriced_sku_count ?? 0) + (pkg?.unpriced_sku_count ?? 0),
      fgUnpriced: fg?.unpriced_sku_count ?? 0,
    };
  }, [valueQ.data]);

  const rmValue = stockValue.rmValue;
  const fgValue = stockValue.fgValue;
  const rmSkus = stockValue.rmSkus;
  const fgSkus = stockValue.fgSkus;
  const valueAsOf = valueQ.data?.as_of ?? null;

  // Derived: exceptions.
  const excRows = exceptionsQ.data?.rows ?? exceptionsQ.data?.data ?? [];
  const criticalN = excRows.filter((e) => e.severity === "critical").length;
  const warningN = excRows.filter((e) => e.severity === "warning").length;
  const infoN = excRows.filter((e) => e.severity === "info").length;

  // Derived: planning run.
  const planRows = planningQ.data?.rows ?? planningQ.data?.data ?? [];
  const latestRun = planRows[0] ?? null;

  // Derived: production this week.
  const prodWeekItems = useMemo<ProdWeekItem[]>(() => {
    const rawRows = productionQ.data?.rows ?? productionQ.data?.data ?? [];
    const byItem = new Map<string, ProdWeekItem>();
    rawRows.forEach((row, idx) => {
      if (row.status === "CANCELLED") return;
      const existing = byItem.get(row.item_id);
      const planned = toNum(row.planned_qty);
      const completed = toNum(row.completed_qty);
      const flowItem = flowItems.find((f) => f.item_id === row.item_id);
      if (existing) {
        existing.planned += planned;
        existing.completed += completed;
        existing.remaining += toNum(row.planned_remaining_qty);
      } else {
        byItem.set(row.item_id, {
          item_id: row.item_id,
          item_name: row.item_name ?? row.item_id,
          planned,
          completed,
          remaining: toNum(row.planned_remaining_qty),
          current_on_hand: flowItem?.current_on_hand ?? 0,
          toneClass: TONE_BG_CYCLE[idx % TONE_BG_CYCLE.length],
        });
      }
    });
    return Array.from(byItem.values())
      .sort((a, b) => b.planned - a.planned)
      .slice(0, 5);
  }, [productionQ.data, flowItems]);

  // Derived: recent actuals.
  const recentActuals = actualsQ.data?.rows ?? actualsQ.data?.data ?? [];

  // Derived: recent stock-ledger movements (3 most recent).
  const recentMovements = movementsQ.data?.rows ?? movementsQ.data?.data ?? [];

  // Derived: production activity trend — count of output postings per day over
  // the trend window (UOM-agnostic; never sums mixed-unit quantities).
  const prodTrend = useMemo<DayBucket[]>(() => {
    const rows = prodTrendQ.data?.rows ?? prodTrendQ.data?.data ?? [];
    const timestamps = rows.map((r) => r.produced_at ?? r.submitted_at ?? null);
    return dailyCounts(timestamps, rangeDays, now);
  }, [prodTrendQ.data, now, rangeDays]);

  // Derived: stock movement flow — inbound vs outbound postings per day.
  // Direction reuses the page's single-source MOVEMENT_REGISTRY (via moveMeta);
  // movement kinds without an explicit in/out direction fall back to the sign
  // of qty_delta so reversals/audits still land on the correct side.
  const movementFlow = useMemo<FlowDayBucket[]>(() => {
    const rows = movementsTrendQ.data?.rows ?? movementsTrendQ.data?.data ?? [];
    const mapped = rows.map((r) => {
      const dir = moveMeta(r.movement_type).dir;
      const direction: "in" | "out" =
        dir === "in" ? "in" : dir === "out" ? "out" : toNum(r.qty_delta) >= 0 ? "in" : "out";
      return { when: r.posted_at ?? r.event_at ?? null, direction };
    });
    return dailyFlow(mapped, rangeDays, now);
  }, [movementsTrendQ.data, now, rangeDays]);

  // Derived: indicative inventory-value trend (RM+PKG). Anchored to today's
  // real snapshot value (stockValue.rmValue) and reconstructed backward from
  // real stock movements priced at current unit cost. See _lib/value-trend.ts.
  const valueTrend = useMemo<ValueTrendResult | null>(() => {
    if (!canSeeValueTrend) return null;
    const anchor = stockValue.rmValue;
    if (anchor === null) return null;
    const costRows = valueCostsQ.data?.rows ?? valueCostsQ.data?.data ?? [];
    const costMap = new Map<string, number>();
    for (const r of costRows) {
      const c = r.effective_cost_ils == null ? NaN : Number(r.effective_cost_ils);
      if (!Number.isNaN(c)) costMap.set(r.component_id, c);
    }
    const ledgerRows = movementsTrendQ.data?.rows ?? movementsTrendQ.data?.data ?? [];
    const movements: ValueMovement[] = ledgerRows.map((r) => ({
      when: r.posted_at ?? r.event_at ?? null,
      item_id: r.item_id,
      item_type: r.item_type,
      qty_delta: toNum(r.qty_delta),
    }));
    return reconstructValueSeries(
      anchor,
      movements,
      (id) => (costMap.has(id) ? (costMap.get(id) as number) : null),
      rangeDays,
      now,
    );
  }, [canSeeValueTrend, stockValue.rmValue, valueCostsQ.data, movementsTrendQ.data, rangeDays, now]);

  // Derived: open purchase orders. "Open" = not yet fully received, i.e.
  // status OPEN or PARTIAL. Late = an open PO whose expected receive date
  // has already passed.
  const poStats = useMemo(() => {
    const rows = purchaseOrdersQ.data?.rows ?? purchaseOrdersQ.data?.data ?? [];
    const open = rows.filter((r) => r.status === "OPEN" || r.status === "PARTIAL");
    // DASH-T5: "late" compares against the local calendar day, not UTC.
    const late = open.filter(
      (r) => !!r.expected_receive_date && r.expected_receive_date < todayLocalISO,
    );
    // DASH-T4: sum ILS POs only — a foreign-currency PO must not silently
    // inflate a ₪-labelled figure. Foreign open POs are counted and surfaced
    // in the tile's sub line instead.
    const ilsOpen = open.filter((r) => !r.currency || r.currency === "ILS");
    const openValue = ilsOpen.reduce((sum, r) => sum + toNum(r.total_net), 0);
    return {
      openCount: open.length,
      lateCount: late.length,
      openValue,
      foreignCount: open.length - ilsOpen.length,
    };
  }, [purchaseOrdersQ.data, todayLocalISO]);

  // Combined inventory value for the header chip.
  const totalInventoryValue =
    rmValue != null || fgValue != null ? (rmValue ?? 0) + (fgValue ?? 0) : null;

  // At-a-glance factory-state counts for the hero chip. null while still
  // loading so we never paint unknown as healthy.
  const criticalCount = criticalTodayQ.isLoading
    ? null
    : criticalTodayQ.data?.rows?.length ?? 0;
  const slippedCount = slippedPlansQ.isLoading
    ? null
    : slippedPlansQ.data?.rows?.length ?? 0;

  // Compact + long date strings for the hero. Compact is shown right of the
  // greeting; long is in the sub-line below. Locale-aware.
  const dateLong = useMemo(() => fmtToday(now), [now]);
  const dateCompact = useMemo(
    () =>
      now.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
    [now],
  );

  return (
    <div className="dashboard-canvas flex flex-col gap-6 sm:gap-7">
      <DashboardHero
        greeting={greeting(now, session?.display_name)}
        dateLong={dateLong}
        dateCompact={dateCompact}
        critical={criticalCount}
        slipped={slippedCount}
        metaRail={
          <>
            <FreshnessBadge
              label="Stock value"
              lastAt={valueAsOf ?? undefined}
              warnAfterMinutes={15}
              failAfterMinutes={120}
            />
            {totalInventoryValue != null ? (
              <span
                className="dash-chip"
                title={`${fmtILS(totalInventoryValue)} — combined value of RM + PKG + FG stock from the latest stock-value snapshot.`}
              >
                <Coins className="h-3.5 w-3.5 text-accent" strokeWidth={2} aria-hidden />
                <span className="text-fg-muted">Total inventory</span>
                {/* Tranche 051 (FLOW-010): compact form so the hero meta rail
                    fits a phone width; the title tooltip keeps the framing. */}
                <span className="tabular-nums text-fg-strong">
                  {fmtILSCompact(totalInventoryValue)}
                </span>
              </span>
            ) : null}
            <span
              className="dash-chip"
              data-tone="accent"
              title="Key panels re-fetch automatically every 60 seconds."
            >
              <span className="dash-live-dot" aria-hidden />
              Auto-refreshing
            </span>
          </>
        }
      />

      <BreakGlassBanner />

      <div className="reveal reveal-delay-1">
        <QuickActionsLauncher />
      </div>

      {/* Hero KPI strip — promoted above the live blocks so the headline
          numbers a COO opens the dashboard to see appear in the first
          scanning zone. The live blocks (critical / urgent / slipped)
          follow immediately below and escalate visually when active. */}
      <div className="reveal reveal-delay-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="RM Inventory Value"
          value={rmValue != null ? fmtILSCompact(rmValue) : null}
          valueFull={rmValue != null ? fmtILS(rmValue) : null}
          sub={
            <span>
              {rmSkus} raw material &amp; packaging SKUs
              {stockValue.rmUnpriced > 0 ? (
                <span className="text-fg-faint"> · {stockValue.rmUnpriced} unpriced</span>
              ) : null}
            </span>
          }
          tone="warning"
          icon={<Coins className="h-5 w-5" strokeWidth={2} />}
          href="/inventory"
          ctaLabel="Open inventory"
          loading={valueQ.isLoading}
        />
        <KpiTile
          label="FG Inventory Value"
          value={fgValue != null ? fmtILSCompact(fgValue) : null}
          valueFull={fgValue != null ? fmtILS(fgValue) : null}
          sub={
            <span>
              {fgSkus} finished good SKUs
              {stockValue.fgUnpriced > 0 ? (
                <span className="text-fg-faint"> · {stockValue.fgUnpriced} unpriced</span>
              ) : null}
            </span>
          }
          tone="success"
          icon={<PackageCheck className="h-5 w-5" strokeWidth={2} />}
          href="/inventory"
          ctaLabel="Open inventory"
          loading={valueQ.isLoading}
        />
        <KpiTile
          label="Open Purchase Orders"
          value={String(poStats.openCount)}
          sub={
            <span>
              {fmtILSCompact(poStats.openValue)} open value
              {poStats.foreignCount > 0 ? (
                <span className="text-fg-faint">
                  {" · "}+{poStats.foreignCount} foreign-currency
                </span>
              ) : null}
              {poStats.lateCount > 0 ? (
                <>
                  {" · "}
                  <span className="font-semibold text-danger">
                    {poStats.lateCount} late
                  </span>
                </>
              ) : null}
            </span>
          }
          tone="info"
          icon={<ClipboardList className="h-5 w-5" strokeWidth={2} />}
          href="/purchase-orders"
          ctaLabel="Open POs"
          loading={purchaseOrdersQ.isLoading}
        />
        {/* Tranche 059 (DASH-T3): the headline number is the CRITICAL count —
            info/warning rows no longer inflate the scariest-looking tile.
            The legend keeps the full breakdown. */}
        <KpiTileBreakdown
          label="Critical Exceptions"
          value={String(criticalN)}
          tone={criticalN > 0 ? "danger" : "info"}
          icon={<Inbox className="h-5 w-5" strokeWidth={2} />}
          href="/inbox"
          ctaLabel="Open inbox"
          loading={exceptionsQ.isLoading}
          legend={
            <>
              <Legend dotClass="bg-danger" label="Critical" n={criticalN} />
              <Legend dotClass="bg-warning" label="Warning" n={warningN} />
              <Legend dotClass="bg-info" label="Info" n={infoN} />
            </>
          }
        />
      </div>

      <div className="reveal reveal-delay-3">
        <CriticalTodayBlock now={now} />
      </div>
      {canSeePurchasing ? (
        <div className="reveal reveal-delay-4">
          <UrgentProcurementBlock now={now} />
        </div>
      ) : null}
      <div className="reveal reveal-delay-5">
        <SlippedPlansBlock now={now} />
      </div>

      {/* Operational trends — the dashboard's time-series band. Activity charts
          count postings per day (honest, UOM-agnostic); the inventory-value
          card is an explicitly-indicative reconstruction. A shared range
          selector drives all charts. */}
      <section className="reveal reveal-delay-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading
            eyebrow="Operational trends"
            title={`The last ${rangeDays} days at a glance`}
          />
          <RangeSelector value={rangeDays} onChange={setRangeDays} options={[...TREND_RANGES]} />
        </div>
        <div
          className={cn(
            "grid grid-cols-1 gap-4",
            canSeeValueTrend ? "lg:grid-cols-2 xl:grid-cols-3" : "lg:grid-cols-2",
          )}
        >
          <ProductionActivityCard
            buckets={prodTrend}
            days={rangeDays}
            loading={prodTrendQ.isLoading}
            error={prodTrendQ.isError}
            onRetry={() => prodTrendQ.refetch()}
          />
          <MovementFlowCard
            buckets={movementFlow}
            days={rangeDays}
            loading={movementsTrendQ.isLoading}
            error={movementsTrendQ.isError}
            onRetry={() => movementsTrendQ.refetch()}
          />
          {canSeeValueTrend ? (
            <InventoryValueCard
              result={valueTrend}
              anchorValue={stockValue.rmValue}
              days={rangeDays}
              loading={valueQ.isLoading || valueCostsQ.isLoading}
              error={valueCostsQ.isError}
              onRetry={() => valueCostsQ.refetch()}
            />
          ) : null}
        </div>
      </section>

      {/* Shortage risk + stock health + planning. */}
      <div className="reveal reveal-delay-6 grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
        <ShortageRisk items={flowItems} loading={flowQ.isLoading} />
        <div className="flex flex-col gap-4">
          <StockHealthCard
            healthy={healthy}
            watch={watch}
            critical={critical}
            total={total}
            loading={flowQ.isLoading}
          />
          <PlanningCard run={latestRun} loading={planningQ.isLoading} />
        </div>
      </div>

      {/* Production this week + recent activity. */}
      <div className="reveal reveal-delay-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ProductionWeek rows={prodWeekItems} loading={productionQ.isLoading} />
        <div className="flex flex-col gap-4">
          <RecentProduction rows={recentActuals} now={now} loading={actualsQ.isLoading} />
          <RecentMovements
            rows={recentMovements}
            now={now}
            loading={movementsQ.isLoading}
            error={movementsQ.isError}
            onRetry={() => movementsQ.refetch()}
          />
        </div>
      </div>
    </div>
  );
}
