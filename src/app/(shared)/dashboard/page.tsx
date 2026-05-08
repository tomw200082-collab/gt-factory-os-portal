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
// ---------------------------------------------------------------------------

import type { ReactNode } from "react";
import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Flame,
  RefreshCw,
  TrendingDown,
} from "lucide-react";

import { useInventoryFlow } from "@/app/(planning)/planning/inventory-flow/_lib/useInventoryFlow";
import type { FlowItem } from "@/app/(planning)/planning/inventory-flow/_lib/types";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { FreshnessBadge } from "@/components/badges/FreshnessBadge";
import { EmptyState } from "@/components/feedback/states";
import { useSession } from "@/lib/auth/session-provider";
import { authorizeCapability } from "@/lib/auth/authorize";
import { cn } from "@/lib/cn";
import { QUICK_ACTIONS } from "@/features/dashboard/quick-actions";

// ---------------------------------------------------------------------------
// Cadence — keep low for the morning view; refresh on tab focus is the default.
// ---------------------------------------------------------------------------
const STALE_TIME_MS = 60_000;

// Cache keys — canonical post-graduation namespace under "dashboard".
const QK_VALUE = ["dashboard", "stock", "value"] as const;
const QK_EXCEPTIONS = ["dashboard", "exceptions", "open"] as const;
const QK_PLANNING_LATEST = ["dashboard", "planning", "runs", "latest"] as const;
const QK_PRODUCTION_PLAN = ["dashboard", "production-plan"] as const;
const QK_PRODUCTION_ACTUALS = ["dashboard", "production-actuals", "recent"] as const;
const QK_CRITICAL_TODAY = ["dashboard", "critical-today"] as const;
const QK_SLIPPED_PLANS = ["dashboard", "slipped-plans"] as const;
const QK_BREAK_GLASS = ["dashboard", "break-glass"] as const;

// ---------------------------------------------------------------------------
// API response types.
// ---------------------------------------------------------------------------
interface StockValueResponse {
  rm_value?: number | null;
  rm_total?: number | null;
  fg_value?: number | null;
  fg_total?: number | null;
  rm_sku_count?: number | null;
  fg_sku_count?: number | null;
  as_of?: string | null;
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
  return "₪ " + n.toLocaleString("he-IL", { maximumFractionDigits: 0 });
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

function weekRange(): { from: string; to: string } {
  const now = new Date();
  const day = now.getDay();
  const sun = new Date(now);
  sun.setDate(now.getDate() - day);
  const sat = new Date(sun);
  sat.setDate(sun.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(sun), to: fmt(sat) };
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
// Shared shells.
// ---------------------------------------------------------------------------
function Skel({ h, w, className }: { h?: number; w?: string | number; className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded bg-bg-muted", className)}
      style={{ height: h ?? 16, width: w ?? "100%" }}
    />
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 rounded border border-border/60 bg-bg-subtle px-3 py-3">
      <div className="h-3 w-20 animate-pulse rounded bg-border/60" />
      <div className="h-3 w-40 flex-1 animate-pulse rounded bg-border/60" />
      <div className="h-3 w-16 animate-pulse rounded bg-border/60" />
    </div>
  );
}

function ErrorAlert({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div
      className="flex items-start gap-3 rounded border border-danger/40 bg-danger-softer px-3 py-3 text-xs text-danger-fg"
      role="alert"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{label}</div>
        <div className="mt-0.5 leading-relaxed text-fg-muted">Try again.</div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex shrink-0 items-center gap-1 rounded border border-danger/40 bg-bg-raised px-2 py-1 text-3xs font-semibold uppercase tracking-sops text-danger-fg hover:bg-danger-softer"
      >
        <RefreshCw className="h-3 w-3" strokeWidth={2} />
        Retry
      </button>
    </div>
  );
}

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
      eyebrow="Quick actions"
      title="Jump to a workflow"
      description="Most-used workflows for your role."
    >
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0">
        {visible.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.href}
              href={a.href}
              className="inline-flex shrink-0 items-center gap-2 rounded border border-border/70 bg-bg-raised px-3 py-2 text-xs font-semibold text-fg-strong hover:border-accent/60 hover:bg-accent-soft hover:text-accent"
              title={a.blurb}
            >
              <Icon className="h-4 w-4" strokeWidth={2} />
              {a.label}
            </Link>
          );
        })}
      </div>
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

// ---------------------------------------------------------------------------
// Stat tiles — Tailwind tokens only, no inline hex.
// ---------------------------------------------------------------------------
function ValueCard({
  label,
  value,
  sub,
  tone,
  loading,
}: {
  label: string;
  value: string | null;
  sub: string;
  tone: "accent" | "success" | "info" | "warning";
  loading?: boolean;
}) {
  const TONE_CHIP: Record<typeof tone, string> = {
    accent: "text-accent",
    success: "text-success",
    info: "text-info",
    warning: "text-warning",
  };
  const TONE_BAR: Record<typeof tone, string> = {
    accent: "bg-accent",
    success: "bg-success",
    info: "bg-info",
    warning: "bg-warning",
  };
  return (
    <div className="card flex flex-col gap-3 p-5">
      <div
        className={cn(
          "text-3xs font-semibold uppercase tracking-sops",
          TONE_CHIP[tone],
        )}
      >
        {label}
      </div>
      {loading ? (
        <Skel h={36} w="80%" />
      ) : (
        <div className="text-3xl font-semibold tabular-nums tracking-tighter text-fg-strong">
          {value ?? "—"}
        </div>
      )}
      <div className="text-xs text-fg-muted">{sub}</div>
      <div className={cn("h-0.5 w-full rounded opacity-60", TONE_BAR[tone])} aria-hidden />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stock health donut.
// ---------------------------------------------------------------------------
function StockDonut({
  healthy,
  watch,
  critical,
  total,
  loading,
}: {
  healthy: number;
  watch: number;
  critical: number;
  total: number;
  loading?: boolean;
}) {
  const r = 40;
  const circ = 2 * Math.PI * r;
  const gap = 6;
  function arc(count: number, stroke: string, offset: number) {
    return (
      <circle
        cx={52}
        cy={52}
        r={r}
        fill="none"
        className={stroke}
        strokeWidth={10}
        strokeDasharray={`${Math.max(0, (count / Math.max(1, total)) * circ - gap)} ${circ}`}
        strokeDashoffset={offset}
        transform="rotate(-90 52 52)"
        strokeLinecap="round"
      />
    );
  }
  const hShare = (healthy / Math.max(1, total)) * circ;
  const wShare = (watch / Math.max(1, total)) * circ;

  return (
    <div className="card p-5">
      <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
        Stock health
      </div>
      {loading ? (
        <div className="mt-4 flex items-center gap-5">
          <Skel h={104} w={104} className="rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skel h={14} />
            <Skel h={14} />
            <Skel h={14} />
          </div>
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-5">
          <svg width={104} height={104} viewBox="0 0 104 104">
            <circle cx={52} cy={52} r={r} fill="none" className="stroke-border/40" strokeWidth={10} />
            {arc(healthy, "stroke-success", 0)}
            {arc(watch, "stroke-warning", -hShare)}
            {arc(critical, "stroke-danger", -(hShare + wShare))}
            <text
              x={52}
              y={48}
              textAnchor="middle"
              className="fill-fg-strong text-[22px] font-semibold"
            >
              {total}
            </text>
            <text
              x={52}
              y={63}
              textAnchor="middle"
              className="fill-fg-subtle text-[9px] uppercase tracking-widest"
            >
              ITEMS
            </text>
          </svg>
          <div className="flex flex-1 flex-col gap-2 text-xs">
            <Legend dotClass="bg-success" label="Healthy" n={healthy} />
            <Legend dotClass="bg-warning" label="Watch" n={watch} />
            <Legend dotClass="bg-danger" label="Critical" n={critical} />
          </div>
        </div>
      )}
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
// Exceptions card — FLOW-DG-007: adds Open inbox link.
// ---------------------------------------------------------------------------
function ExceptionsCard({
  criticalN,
  warningN,
  infoN,
  loading,
}: {
  criticalN: number;
  warningN: number;
  infoN: number;
  loading?: boolean;
}) {
  const total = criticalN + warningN + infoN;
  const hot = criticalN > 0;
  return (
    <div
      className={cn(
        "card flex flex-col gap-3 p-5",
        hot ? "border-danger/40 bg-danger-softer" : "",
      )}
    >
      <div
        className={cn(
          "text-3xs font-semibold uppercase tracking-sops",
          hot ? "text-danger" : "text-fg-subtle",
        )}
      >
        Exceptions
      </div>
      {loading ? (
        <Skel h={46} w="60%" />
      ) : (
        <div
          className={cn(
            "text-4xl font-semibold tabular-nums tracking-tighter",
            hot ? "text-danger" : "text-fg-strong",
          )}
        >
          {total}
        </div>
      )}
      {!loading && (
        <div className="flex flex-col gap-1.5 text-xs">
          <Legend dotClass="bg-danger" label="Critical" n={criticalN} />
          <Legend dotClass="bg-warning" label="Warning" n={warningN} />
          <Legend dotClass="bg-info" label="Info" n={infoN} />
        </div>
      )}
      <Link
        href="/inbox"
        className="inline-flex items-center gap-1 self-start text-xs font-semibold text-accent hover:underline"
      >
        Open inbox
        <ArrowRight className="h-3 w-3" strokeWidth={2} />
      </Link>
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
      eyebrow="Shortage risk"
      title="Items at risk in horizon"
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
                    "flex items-center gap-3 rounded border px-3 py-2.5 text-fg-strong hover:bg-bg-raised",
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
      eyebrow="Planning run"
      title="Latest completed run"
      description="Recommendations, exceptions, and timing of the last run."
      actions={
        run ? (
          <Link
            href={`/planning/runs/${encodeURIComponent(run.run_id)}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
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
      eyebrow="Production this week"
      title="Planned vs completed"
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
      eyebrow="Recent production"
      title="Last 5 actuals"
      description="Most recent production output postings."
      footer={
        <Link
          href="/stock/movement-log"
          className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
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

  return (
    <SectionCard
      tone="danger"
      eyebrow="Live"
      title={
        <span className="inline-flex items-center gap-2">
          <Flame className="h-4 w-4 text-danger" strokeWidth={2.25} />
          Critical today
        </span>
      }
      description="What stops production today if nothing is done."
      footer={
        asOf ? (
          <span>
            Source: <code className="font-mono">api_read.v_critical_today</code> · updated{" "}
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
        <ErrorAlert label="Critical issues unavailable." onRetry={() => query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-5 w-5 text-success" strokeWidth={2} />}
          title="All clear · no critical issues today."
          description="No stockouts, no fail-hard planning exceptions, no critical-stale integrations, no active break-glass."
        />
      ) : (
        <ul className="flex flex-col gap-2">
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
                    className="inline-flex shrink-0 items-center gap-1 self-start text-xs font-semibold text-danger-fg hover:underline sm:self-center"
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

  return (
    <SectionCard
      eyebrow="Live"
      title={
        <span className="inline-flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-warning" strokeWidth={2.25} />
          Slipped plans
        </span>
      }
      description={`Planned production from the last ${windowDays} days that was not posted as an actual.`}
      footer={
        asOf ? (
          <span>
            Source:{" "}
            <code className="font-mono">api_read.v_production_plan_slippage</code>
            {" · "}window {windowDays} days · updated {fmtRelative(asOf, now)}
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
        <EmptyState
          icon={<CheckCircle2 className="h-5 w-5 text-success" strokeWidth={2} />}
          title={`No slipped plans in the past ${windowDays} days.`}
          description="Every past plan in this window has a posted actual or was cancelled by the planner."
        />
      ) : (
        <ul className="flex flex-col gap-2">
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
                    Planned: <span className="font-mono">{row.planned_qty}</span> {row.uom}
                  </div>
                </div>
                <Link
                  href={planLink}
                  className="inline-flex shrink-0 items-center gap-1 self-start text-xs font-semibold text-fg-strong hover:underline sm:self-center"
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
// Hidden helper to consume children prop from SectionCard if no child renders.
// (Not actually used — kept inline.)
// ---------------------------------------------------------------------------
function MetaRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

// ---------------------------------------------------------------------------
// Page.
// ---------------------------------------------------------------------------
export default function DashboardPage() {
  const now = useMemo(() => new Date(), []);
  const week = useMemo(() => weekRange(), []);

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

  // Derived: stock health from inventory-flow.
  const flowItems = flowQ.data?.items ?? [];
  const healthy = flowItems.filter((i) => i.risk_tier === "healthy").length;
  const watch = flowItems.filter((i) => i.risk_tier === "watch").length;
  const critical = flowItems.filter(
    (i) => i.risk_tier === "critical" || i.risk_tier === "stockout",
  ).length;
  const total = flowItems.length;

  // Derived: inventory values.
  const vd = valueQ.data;
  const rmValue = vd?.rm_value ?? vd?.rm_total ?? null;
  const fgValue = vd?.fg_value ?? vd?.fg_total ?? null;
  const rmSkus = vd?.rm_sku_count ?? null;
  const fgSkus = vd?.fg_sku_count ?? null;
  const valueAsOf = vd?.as_of ?? null;

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

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <WorkflowHeader
        eyebrow="Factory floor"
        title="Dashboard"
        meta={
          <MetaRow>
            <FreshnessBadge
              label="Stock value"
              lastAt={valueAsOf ?? undefined}
              warnAfterMinutes={15}
              failAfterMinutes={120}
            />
          </MetaRow>
        }
      />

      <BreakGlassBanner />

      <QuickActionsLauncher />

      <CriticalTodayBlock now={now} />
      <SlippedPlansBlock now={now} />

      {/* Hero KPI strip. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ValueCard
          label="RM Inventory Value"
          value={rmValue != null ? fmtILS(rmValue) : null}
          sub={rmSkus != null ? `${rmSkus} raw material SKUs` : "Raw materials"}
          tone="warning"
          loading={valueQ.isLoading}
        />
        <ValueCard
          label="FG Inventory Value"
          value={fgValue != null ? fmtILS(fgValue) : null}
          sub={fgSkus != null ? `${fgSkus} finished good SKUs` : "Finished goods"}
          tone="success"
          loading={valueQ.isLoading}
        />
        <StockDonut
          healthy={healthy}
          watch={watch}
          critical={critical}
          total={total}
          loading={flowQ.isLoading}
        />
        <ExceptionsCard
          criticalN={criticalN}
          warningN={warningN}
          infoN={infoN}
          loading={exceptionsQ.isLoading}
        />
      </div>

      {/* Shortage + Planning. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
        <ShortageRisk items={flowItems} loading={flowQ.isLoading} />
        <PlanningCard run={latestRun} loading={planningQ.isLoading} />
      </div>

      {/* Production + Recent actuals. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ProductionWeek rows={prodWeekItems} loading={productionQ.isLoading} />
        <RecentProduction rows={recentActuals} now={now} loading={actualsQ.isLoading} />
      </div>
    </div>
  );
}
