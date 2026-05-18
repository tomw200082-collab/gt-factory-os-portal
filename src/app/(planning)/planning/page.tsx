"use client";

// ---------------------------------------------------------------------------
// /planning — Planning workspace overview.
//
// Goal: a single screen that summarizes the entire planning engine and lets
// the planner read the current state in seconds.
//
// The page is built around the planning pipeline:
//
//     Demand  →  Planning run  →  Recommendations  →  Blockers
//
// Each stage is a live, clickable status node. Below the pipeline, three
// dossiers expand the most decision-relevant detail:
//   - Last planning run   — what the engine produced + the signals it raised
//   - Demand coverage     — how much of live order demand the engine can see
//   - Blockers            — what is stuck, grouped by root cause
//   - Engine inputs       — freshness of the forecast + LionWheel feed
//
// Every number is from a live in-product API. No mock data. English / LTR,
// names not IDs.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart2,
  CalendarClock,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Cpu,
  Layers,
  ListChecks,
  Loader2,
  PackageCheck,
  PlayCircle,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { FreshnessBadge } from "@/components/badges/FreshnessBadge";
import { Badge } from "@/components/badges/StatusBadge";
import { EmptyState } from "@/components/feedback/states";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Quick-nav registry — bottom-of-page jump links.
// ---------------------------------------------------------------------------
const PLANNING_SECTIONS = [
  { label: "Forecast", href: "/planning/forecast", icon: BarChart2, blurb: "Demand by month" },
  { label: "Run history", href: "/planning/runs", icon: ListChecks, blurb: "Every planning run" },
  { label: "Production plan", href: "/planning/production-plan", icon: CalendarClock, blurb: "This week's build" },
  { label: "Weekly outlook", href: "/planning/weekly-outlook", icon: CalendarRange, blurb: "Near-term snapshot" },
  { label: "Inventory flow", href: "/planning/inventory-flow", icon: Layers, blurb: "Daily projection" },
  { label: "Blockers", href: "/planning/blockers", icon: AlertTriangle, blurb: "Items to fix" },
] as const;

// ---------------------------------------------------------------------------
// API DTOs
// ---------------------------------------------------------------------------
interface ForecastVersionRow {
  version_id: string;
  cadence: string | null;
  horizon_start_at: string | null;
  horizon_weeks: number | null;
  status: string;
  published_at: string | null;
}

interface JobRow {
  job_name: string;
  last_ended_at: string | null;
  last_status: string | null;
  failed_count_24h: number;
}

type RunStatus = "draft" | "running" | "completed" | "failed" | "superseded";

interface PlanningRunSummaryRow {
  run_id: string;
  executed_at: string;
  trigger_source: "manual" | "scheduled";
  planning_horizon_start_at: string;
  planning_horizon_weeks: number;
  status: RunStatus;
  triggered_by_name?: string | null;
  summary: {
    fg_coverage_count: number;
    purchase_recs_count: number;
    production_recs_count: number;
    exceptions_count: number;
  };
}

interface RunDetailResponse {
  run_id: string;
  executed_at: string;
  planning_horizon_start_at: string;
  planning_horizon_weeks: number;
  status: RunStatus;
  triggered_by_name?: string | null;
  summary: {
    fg_coverage_count: number;
    purchase_recs_count: number;
    production_recs_count: number;
    exceptions_count: number;
    exceptions_by_severity: { info: number; warning: number; fail_hard: number };
  };
}

type BlockerSeverity = "info" | "warning" | "fail_hard";

interface BlockerRow {
  exception_id: string;
  category: string;
  severity: BlockerSeverity;
  display_name: string | null;
  demand_qty: string | null;
}

interface BlockersResponse {
  total_blocker_count: number;
  rows: BlockerRow[];
  run: { run_id: string | null; run_status: string | null };
}

interface DemandCoverageResponse {
  as_of: string;
  total_lines: number;
  resolved_lines: number;
  bundle_lines: number;
  unresolved_lines: number;
  total_distinct_skus: number;
  resolved_distinct_skus: number;
  bundle_distinct_skus: number;
  unresolved_distinct_skus: number;
  is_partial: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

function fmtMonthYear(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString();
}

// Resolved-share as a whole percent. Clamped to 1–99 in between so a near-miss
// never reads as a clean 100% (or a non-zero remainder as 0%).
function coveragePct(resolved: number, total: number): number {
  if (total <= 0) return 0;
  if (resolved >= total) return 100;
  if (resolved <= 0) return 0;
  return Math.min(99, Math.max(1, Math.round((resolved / total) * 100)));
}

const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  completed: "Completed",
  failed: "Failed",
  running: "Running",
  superseded: "Superseded",
  draft: "Queued",
};

type Tone = "success" | "warning" | "danger" | "accent" | "neutral";

function runStatusTone(status: RunStatus): Tone {
  if (status === "completed") return "success";
  if (status === "running" || status === "draft") return "warning";
  if (status === "failed") return "danger";
  return "neutral";
}

const TONE_BAR: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  accent: "bg-accent",
  neutral: "bg-border-strong",
};

const TONE_SOFT: Record<Tone, string> = {
  success: "bg-success-softer text-success-fg",
  warning: "bg-warning-softer text-warning-fg",
  danger: "bg-danger-softer text-danger-fg",
  accent: "bg-accent-soft text-accent",
  neutral: "bg-bg-muted text-fg-muted",
};

const TONE_ICON: Record<Tone, string> = {
  success: "border-success/30 bg-success-softer text-success-fg",
  warning: "border-warning/30 bg-warning-softer text-warning-fg",
  danger: "border-danger/30 bg-danger-softer text-danger-fg",
  accent: "border-accent/30 bg-accent-soft text-accent",
  neutral: "border-border/70 bg-bg text-fg-muted",
};

const BLOCKER_CATEGORY_LABEL: Record<string, string> = {
  missing_supplier_mapping: "Missing supplier mapping",
  missing_bom: "Missing BOM",
  po_substrate_absent_supply_not_netted: "Open-PO supply not netted",
  recommendation_below_trigger_threshold: "Below trigger threshold",
};

function blockerCategoryLabel(c: string): string {
  return BLOCKER_CATEGORY_LABEL[c] ?? c.replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// SplitBar — a stacked horizontal proportion bar.
// ---------------------------------------------------------------------------
function SplitBar({
  segments,
  className,
}: {
  segments: { value: number; tone: Tone }[];
  className?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <div
      className={cn(
        "flex h-2 w-full overflow-hidden rounded-full bg-bg-muted",
        className,
      )}
      aria-hidden
    >
      {total === 0 ? null : (
        segments.map((seg, i) =>
          seg.value > 0 ? (
            <div
              key={i}
              className={cn(TONE_BAR[seg.tone], "h-full")}
              style={{ width: `${(seg.value / total) * 100}%` }}
            />
          ) : null,
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legend dot + label + value.
// ---------------------------------------------------------------------------
function LegendItem({
  tone,
  label,
  value,
}: {
  tone: Tone;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn("h-2 w-2 shrink-0 rounded-full", TONE_BAR[tone])}
        aria-hidden
      />
      <span className="text-xs text-fg-muted">{label}</span>
      <span className="ml-auto font-mono text-xs font-semibold tabular-nums text-fg-strong">
        {fmtNum(value)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pipeline stage — a clickable status node in the planning flow.
// ---------------------------------------------------------------------------
interface StageProps {
  step: string;
  href: string;
  eyebrow: string;
  icon: React.ReactNode;
  tone: Tone;
  loading?: boolean;
  headline: React.ReactNode;
  sub: React.ReactNode;
  testId?: string;
}

function PipelineStage({
  step,
  href,
  eyebrow,
  icon,
  tone,
  loading,
  headline,
  sub,
  testId,
}: StageProps) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className={cn(
        "group relative flex flex-1 flex-col gap-3 overflow-hidden rounded-xl border border-border bg-bg-raised p-4 shadow-raised transition-all",
        "hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
      )}
    >
      <span
        className={cn("absolute inset-x-0 top-0 h-[3px]", TONE_BAR[tone])}
        aria-hidden
      />
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg border",
            TONE_ICON[tone],
          )}
        >
          {icon}
        </span>
        <span className="font-mono text-2xs font-semibold tracking-sops text-fg-faint">
          {step}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-2xs font-semibold uppercase tracking-sops text-fg-muted">
          {eyebrow}
        </span>
        {loading ? (
          <div className="mt-1 space-y-1.5">
            <div className="h-6 w-2/3 animate-pulse rounded bg-bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-bg-muted" />
          </div>
        ) : (
          <>
            <div className="text-lg font-semibold leading-tight tracking-tightish text-fg-strong">
              {headline}
            </div>
            <div className="text-xs leading-relaxed text-fg-muted">{sub}</div>
          </>
        )}
      </div>
      <span className="mt-auto inline-flex items-center gap-1 text-2xs font-semibold text-fg-faint transition-colors group-hover:text-accent">
        Open
        <ArrowRight
          className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
          strokeWidth={2.5}
          aria-hidden
        />
      </span>
    </Link>
  );
}

function StageConnector() {
  return (
    <div
      className="flex shrink-0 items-center justify-center text-border-strong lg:px-0.5"
      aria-hidden
    >
      <ChevronRight className="hidden h-5 w-5 lg:block" strokeWidth={2} />
      <ChevronDown className="h-5 w-5 lg:hidden" strokeWidth={2} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat panel — a compact metric cell used inside the dossier cards.
// ---------------------------------------------------------------------------
function StatPanel({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: React.ReactNode;
  tone?: Tone;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border/70 bg-bg p-3">
      <span className="text-2xs font-semibold uppercase tracking-sops text-fg-subtle">
        {label}
      </span>
      <span
        className={cn(
          "text-xl font-semibold tabular-nums",
          tone === "danger"
            ? "text-danger-fg"
            : tone === "warning"
              ? "text-warning-fg"
              : tone === "success"
                ? "text-success-fg"
                : "text-fg-strong",
        )}
      >
        {value}
      </span>
      {hint ? <span className="text-2xs text-fg-muted">{hint}</span> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function PlanningOverviewPage() {
  // --- Forecast — most recent published version ----------------------------
  const forecastQuery = useQuery<{ rows: ForecastVersionRow[] }>({
    queryKey: ["planning", "overview", "forecast"],
    queryFn: async () => {
      const res = await fetch("/api/forecasts/versions?status=published");
      if (!res.ok) throw new Error("Request failed");
      return res.json() as Promise<{ rows: ForecastVersionRow[] }>;
    },
    staleTime: 2 * 60 * 1000,
  });

  // --- Jobs — LionWheel sync health ----------------------------------------
  const jobsQuery = useQuery<{ rows: JobRow[] }>({
    queryKey: ["planning", "overview", "jobs"],
    queryFn: async () => {
      const res = await fetch("/api/admin/jobs");
      if (!res.ok) throw new Error("Request failed");
      return res.json() as Promise<{ rows: JobRow[] }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  // --- Planning runs list --------------------------------------------------
  // While a run is in progress the overview polls every 5s so the pipeline
  // reflects completion without a manual refresh.
  const runsQuery = useQuery<{ rows: PlanningRunSummaryRow[]; total: number }>({
    queryKey: ["planning", "overview", "runs"],
    queryFn: async () => {
      const res = await fetch("/api/planning/runs");
      if (!res.ok) throw new Error("Request failed");
      return res.json() as Promise<{
        rows: PlanningRunSummaryRow[];
        total: number;
      }>;
    },
    staleTime: 2 * 60 * 1000,
    refetchInterval: (q) => {
      const data = q.state.data as
        | { rows: PlanningRunSummaryRow[] }
        | undefined;
      return data?.rows?.some((r) => r.status === "running") ? 5000 : false;
    },
  });

  const latestRun = runsQuery.data?.rows?.[0] ?? null;

  // --- Latest-run detail (exceptions by severity) --------------------------
  const runDetailQuery = useQuery<RunDetailResponse>({
    queryKey: ["planning", "overview", "run-detail", latestRun?.run_id],
    queryFn: async () => {
      const res = await fetch(
        `/api/planning/runs/${encodeURIComponent(latestRun!.run_id)}`,
      );
      if (!res.ok) throw new Error("Request failed");
      return res.json() as Promise<RunDetailResponse>;
    },
    enabled: !!latestRun?.run_id,
    staleTime: 2 * 60 * 1000,
    refetchInterval: latestRun?.status === "running" ? 5000 : false,
  });

  // --- Blockers — fetch a wide page so we can group by category ------------
  const blockersQuery = useQuery<BlockersResponse>({
    queryKey: ["planning", "overview", "blockers"],
    queryFn: async () => {
      const res = await fetch("/api/planning/blockers?page_size=200");
      if (!res.ok) throw new Error("Request failed");
      return res.json() as Promise<BlockersResponse>;
    },
    staleTime: 2 * 60 * 1000,
    retry: false,
  });

  // --- Demand coverage -----------------------------------------------------
  const coverageQuery = useQuery<DemandCoverageResponse>({
    queryKey: ["planning", "overview", "coverage"],
    queryFn: async () => {
      const res = await fetch("/api/planning/demand-coverage");
      if (!res.ok) throw new Error("Request failed");
      return res.json() as Promise<DemandCoverageResponse>;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // ----- derived state -----------------------------------------------------
  const latestForecast = forecastQuery.data?.rows?.[0] ?? null;
  const lionwheelJob =
    jobsQuery.data?.rows?.find(
      (j) =>
        j.job_name === "integration.lionwheel" ||
        j.job_name === "lionwheel_poll",
    ) ?? null;
  const runDetail = runDetailQuery.data ?? null;
  const blockers = blockersQuery.data ?? null;
  const coverage = coverageQuery.data ?? null;

  const blockerCount = blockers?.total_blocker_count ?? null;
  const blockerRows = blockers?.rows ?? [];
  const criticalBlockers = blockerRows.filter(
    (b) => b.severity === "fail_hard",
  ).length;

  // Blockers grouped by category, sorted by frequency.
  const blockersByCategory = (() => {
    const map = new Map<
      string,
      { count: number; critical: number; warning: number }
    >();
    for (const b of blockerRows) {
      const cur = map.get(b.category) ?? { count: 0, critical: 0, warning: 0 };
      cur.count += 1;
      if (b.severity === "fail_hard") cur.critical += 1;
      if (b.severity === "warning") cur.warning += 1;
      map.set(b.category, cur);
    }
    return [...map.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.count - a.count);
  })();

  const totalRecs = latestRun
    ? latestRun.summary.purchase_recs_count +
      latestRun.summary.production_recs_count
    : 0;

  const queriesSettled =
    !forecastQuery.isLoading &&
    !jobsQuery.isLoading &&
    !runsQuery.isLoading &&
    !blockersQuery.isLoading &&
    !coverageQuery.isLoading;

  // Overall planning health — feeds the header status pill.
  // Critical = the engine cannot produce a trustworthy plan.
  // Attention = the plan stands but an input or output needs a look.
  const isCritical =
    queriesSettled &&
    (!latestForecast ||
      latestRun?.status === "failed" ||
      criticalBlockers > 0);

  // A data source that failed to load means we cannot certify a green state.
  const aDataSourceUnavailable =
    blockersQuery.isError || coverageQuery.isError || jobsQuery.isError;

  const isAttention =
    queriesSettled &&
    !isCritical &&
    ((blockerCount !== null && blockerCount > 0) ||
      coverage?.is_partial === true ||
      latestRun?.status === "running" ||
      lionwheelJob?.last_status === "failed" ||
      Number(lionwheelJob?.failed_count_24h ?? 0) > 0 ||
      aDataSourceUnavailable);

  // ----- render ------------------------------------------------------------
  return (
    <div className="space-y-8">
      <WorkflowHeader
        eyebrow="Planning workspace"
        title="Planning overview"
        description="The whole planning engine on one screen — demand, runs, recommendations and blockers, read in seconds."
        meta={
          !queriesSettled ? (
            <Badge tone="neutral" dotted>
              Checking…
            </Badge>
          ) : isCritical ? (
            <Badge tone="danger" dotted>
              Action required
            </Badge>
          ) : isAttention ? (
            <Badge tone="warning" dotted>
              Attention needed
            </Badge>
          ) : (
            <Badge tone="success" dotted>
              All systems green
            </Badge>
          )
        }
        actions={
          <Link href="/planning/runs" className="btn btn-sm gap-1.5">
            <PlayCircle className="h-3.5 w-3.5" strokeWidth={2.5} />
            Run history
          </Link>
        }
      />

      {/* ===================================================================
          The planning pipeline — Demand → Run → Recommendations → Blockers
          =================================================================== */}
      <section aria-label="Planning pipeline" className="space-y-3">
        <h2 className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-sops text-fg-muted">
          <Activity className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          The planning pipeline
        </h2>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-0">
          {/* Stage 1 — Demand */}
          <PipelineStage
            step="01"
            href="/planning/forecast"
            eyebrow="Demand"
            icon={<BarChart2 className="h-4 w-4" strokeWidth={2} />}
            tone={
              !latestForecast
                ? "danger"
                : coverage?.is_partial
                  ? "warning"
                  : coverage
                    ? "success"
                    : "neutral"
            }
            loading={forecastQuery.isLoading}
            testId="pipeline-stage-demand"
            headline={
              latestForecast
                ? fmtMonthYear(latestForecast.horizon_start_at)
                : "No forecast"
            }
            sub={
              !latestForecast ? (
                "Publish a forecast to feed the engine."
              ) : coverage ? (
                <>
                  {fmtNum(coverage.resolved_distinct_skus)} of{" "}
                  {fmtNum(coverage.total_distinct_skus)} SKUs resolved
                </>
              ) : (
                <>Published {timeAgo(latestForecast.published_at)}</>
              )
            }
          />
          <StageConnector />

          {/* Stage 2 — Planning run */}
          <PipelineStage
            step="02"
            href={
              latestRun
                ? `/planning/runs/${encodeURIComponent(latestRun.run_id)}`
                : "/planning/runs"
            }
            eyebrow="Planning run"
            icon={<Cpu className="h-4 w-4" strokeWidth={2} />}
            tone={latestRun ? runStatusTone(latestRun.status) : "neutral"}
            loading={runsQuery.isLoading}
            testId="pipeline-stage-run"
            headline={
              latestRun ? RUN_STATUS_LABEL[latestRun.status] : "No runs yet"
            }
            sub={
              latestRun
                ? `Last run ${timeAgo(latestRun.executed_at)}`
                : "Trigger a run to generate recommendations."
            }
          />
          <StageConnector />

          {/* Stage 3 — Recommendations */}
          <PipelineStage
            step="03"
            href={
              latestRun
                ? `/planning/runs/${encodeURIComponent(latestRun.run_id)}?tab=recommendations`
                : "/planning/runs"
            }
            eyebrow="Recommendations"
            icon={<ClipboardList className="h-4 w-4" strokeWidth={2} />}
            tone={
              !latestRun
                ? "neutral"
                : latestRun.status === "failed"
                  ? "danger"
                  : latestRun.status === "running" ||
                      latestRun.status === "draft"
                    ? "warning"
                    : totalRecs > 0
                      ? "accent"
                      : "success"
            }
            loading={runsQuery.isLoading}
            testId="pipeline-stage-recs"
            headline={latestRun ? fmtNum(totalRecs) : "—"}
            sub={
              !latestRun ? (
                "No recommendations available."
              ) : latestRun.status === "failed" ? (
                "Run failed — totals may be incomplete."
              ) : latestRun.status === "running" ||
                latestRun.status === "draft" ? (
                "Run in progress — totals not final."
              ) : (
                <>
                  {fmtNum(latestRun.summary.purchase_recs_count)} purchase ·{" "}
                  {fmtNum(latestRun.summary.production_recs_count)} production
                </>
              )
            }
          />
          <StageConnector />

          {/* Stage 4 — Blockers */}
          <PipelineStage
            step="04"
            href="/planning/blockers"
            eyebrow="Blockers"
            icon={<AlertTriangle className="h-4 w-4" strokeWidth={2} />}
            tone={
              blockerCount === null
                ? "neutral"
                : criticalBlockers > 0
                  ? "danger"
                  : blockerCount > 0
                    ? "warning"
                    : "success"
            }
            loading={blockersQuery.isLoading}
            testId="pipeline-stage-blockers"
            headline={
              blockersQuery.isError
                ? "Unavailable"
                : blockerCount === null
                  ? "—"
                  : fmtNum(blockerCount)
            }
            sub={
              blockersQuery.isError
                ? "Could not load blockers."
                : blockerCount === null
                  ? "No data yet."
                  : blockerCount === 0
                    ? "Every demand line resolves cleanly."
                    : criticalBlockers > 0
                      ? `${fmtNum(criticalBlockers)} critical · needs action`
                      : "Review and clear before the next run."
            }
          />
        </div>
      </section>

      {/* ===================================================================
          Dossier row 1 — Last run + Demand coverage
          =================================================================== */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* --- Last planning run ------------------------------------------- */}
        <SectionCard
          className="lg:col-span-2"
          eyebrow="Engine output"
          title="Last planning run"
          description={
            latestRun
              ? `Triggered by ${
                  latestRun.triggered_by_name?.trim() ||
                  (latestRun.trigger_source === "scheduled"
                    ? "Schedule"
                    : "Manual")
                } · ${timeAgo(latestRun.executed_at)}`
              : "No planning run has been executed yet."
          }
          actions={
            latestRun ? (
              <Link
                href={`/planning/runs/${encodeURIComponent(latestRun.run_id)}`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
              >
                Open run
                <ArrowRight className="h-3 w-3" strokeWidth={2.5} aria-hidden />
              </Link>
            ) : null
          }
        >
          {runsQuery.isLoading ? (
            <div className="space-y-3" aria-busy="true">
              <div className="h-20 w-full animate-pulse rounded bg-bg-subtle" />
              <div className="h-16 w-full animate-pulse rounded bg-bg-subtle" />
            </div>
          ) : !latestRun ? (
            <EmptyState
              title="No planning runs yet"
              description="Trigger your first run to turn the published forecast into purchase and production recommendations."
              action={
                <Link href="/planning/runs" className="btn btn-primary btn-sm">
                  Go to planning runs
                </Link>
              }
            />
          ) : (
            <div className="space-y-5">
              {latestRun.status === "failed" ? (
                <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-softer px-3 py-2 text-xs text-danger-fg">
                  <XCircle
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    strokeWidth={2}
                    aria-hidden
                  />
                  <span>
                    This run failed before completing — its recommendations may
                    be incomplete. Open the run for the failure detail.
                  </span>
                </div>
              ) : latestRun.status === "running" ? (
                <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-softer px-3 py-2 text-xs text-warning-fg">
                  <Loader2
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin"
                    strokeWidth={2}
                    aria-hidden
                  />
                  <span>
                    This run is still in progress — the numbers below update
                    live.
                  </span>
                </div>
              ) : null}

              {/* Recommendations split */}
              <div className="space-y-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-2xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Recommendations produced
                  </span>
                  <span className="font-mono text-sm font-semibold tabular-nums text-fg-strong">
                    {fmtNum(totalRecs)} total
                  </span>
                </div>
                <SplitBar
                  segments={[
                    {
                      value: latestRun.summary.purchase_recs_count,
                      tone: "accent",
                    },
                    {
                      value: latestRun.summary.production_recs_count,
                      tone: "success",
                    },
                  ]}
                />
                <div className="grid grid-cols-2 gap-3">
                  <LegendItem
                    tone="accent"
                    label="Purchase"
                    value={latestRun.summary.purchase_recs_count}
                  />
                  <LegendItem
                    tone="success"
                    label="Production"
                    value={latestRun.summary.production_recs_count}
                  />
                </div>
              </div>

              {/* Run stats */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatPanel
                  label="FG evaluated"
                  value={fmtNum(latestRun.summary.fg_coverage_count)}
                  hint="Finished goods covered"
                />
                <StatPanel
                  label="Horizon"
                  value={`${latestRun.planning_horizon_weeks}w`}
                  hint={`From ${fmtMonthYear(latestRun.planning_horizon_start_at)}`}
                />
                <StatPanel
                  label="Exceptions"
                  value={fmtNum(latestRun.summary.exceptions_count)}
                  tone={
                    latestRun.summary.exceptions_count > 0
                      ? "warning"
                      : "success"
                  }
                  hint={
                    latestRun.summary.exceptions_count > 0
                      ? "Signals raised this run"
                      : "Clean run"
                  }
                />
              </div>

              {/* Exceptions by severity */}
              <div className="space-y-2">
                <span className="text-2xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Exception signals by severity
                </span>
                {runDetailQuery.isLoading ? (
                  <div className="h-9 w-full animate-pulse rounded bg-bg-subtle" />
                ) : runDetail ? (
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        {
                          tone: "danger" as Tone,
                          label: "Critical",
                          value: runDetail.summary.exceptions_by_severity.fail_hard,
                        },
                        {
                          tone: "warning" as Tone,
                          label: "Warning",
                          value: runDetail.summary.exceptions_by_severity.warning,
                        },
                        {
                          tone: "accent" as Tone,
                          label: "Info",
                          value: runDetail.summary.exceptions_by_severity.info,
                        },
                      ]
                    ).map((s) => (
                      <div
                        key={s.label}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-lg px-3 py-2",
                          s.value > 0 ? TONE_SOFT[s.tone] : "bg-bg-muted text-fg-muted",
                        )}
                      >
                        <span className="text-2xs font-semibold uppercase tracking-sops">
                          {s.label}
                        </span>
                        <span className="font-mono text-base font-semibold tabular-nums">
                          {fmtNum(s.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-fg-muted">
                    Severity breakdown unavailable.
                  </p>
                )}
              </div>
            </div>
          )}
        </SectionCard>

        {/* --- Demand coverage --------------------------------------------- */}
        <SectionCard
          eyebrow="Engine input"
          title="Demand coverage"
          description="How much live order demand the engine can resolve."
          tone={coverage?.is_partial ? "warning" : "default"}
        >
          {coverageQuery.isLoading ? (
            <div className="space-y-3" aria-busy="true">
              <div className="h-16 w-full animate-pulse rounded bg-bg-subtle" />
              <div className="h-20 w-full animate-pulse rounded bg-bg-subtle" />
            </div>
          ) : coverageQuery.isError || !coverage ? (
            <p className="text-sm text-fg-muted">
              Demand coverage is unavailable right now.
            </p>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tabular-nums text-fg-strong">
                    {coverage.total_lines === 0
                      ? "—"
                      : `${coveragePct(coverage.resolved_lines, coverage.total_lines)}%`}
                  </span>
                  <span className="text-xs text-fg-muted">
                    of {fmtNum(coverage.total_lines)} order lines resolved
                  </span>
                </div>
              </div>

              <div className="space-y-2.5">
                <SplitBar
                  segments={[
                    { value: coverage.resolved_lines, tone: "success" },
                    { value: coverage.bundle_lines, tone: "neutral" },
                    { value: coverage.unresolved_lines, tone: "danger" },
                  ]}
                />
                <div className="space-y-1.5">
                  <LegendItem
                    tone="success"
                    label="Resolved"
                    value={coverage.resolved_lines}
                  />
                  <LegendItem
                    tone="neutral"
                    label="Bundles (excluded)"
                    value={coverage.bundle_lines}
                  />
                  <LegendItem
                    tone="danger"
                    label="Unresolved"
                    value={coverage.unresolved_lines}
                  />
                </div>
              </div>

              <div className="rounded-lg border border-border/70 bg-bg p-3 text-xs text-fg-muted">
                <span className="font-semibold text-fg-strong">
                  {fmtNum(coverage.resolved_distinct_skus)}
                </span>{" "}
                of {fmtNum(coverage.total_distinct_skus)} distinct SKUs feed the
                engine.
              </div>

              {coverage.is_partial ? (
                <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-softer px-3 py-2 text-xs text-warning-fg">
                  <AlertTriangle
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    strokeWidth={2}
                    aria-hidden
                  />
                  <span>
                    Demand is partial — some order lines are excluded. The next
                    run will not see them.
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-success-fg">
                  <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  <span>Full demand is visible to the engine.</span>
                </div>
              )}
            </div>
          )}
        </SectionCard>
      </div>

      {/* ===================================================================
          Dossier row 2 — Blockers + Engine inputs
          =================================================================== */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* --- Blockers by category ---------------------------------------- */}
        <SectionCard
          className="lg:col-span-2"
          eyebrow="Needs attention"
          title={
            blockerCount === null
              ? "Blockers"
              : `${fmtNum(blockerCount)} blocker${blockerCount === 1 ? "" : "s"}`
          }
          description="Demand the engine could not turn into a clean recommendation, grouped by root cause."
          tone={
            criticalBlockers > 0
              ? "danger"
              : blockerCount && blockerCount > 0
                ? "warning"
                : "default"
          }
          actions={
            <Link
              href="/planning/blockers"
              className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
            >
              All blockers
              <ArrowRight className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            </Link>
          }
        >
          {blockersQuery.isLoading ? (
            <div className="space-y-2" aria-busy="true">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-12 w-full animate-pulse rounded bg-bg-subtle"
                />
              ))}
            </div>
          ) : blockersQuery.isError ? (
            <p className="text-sm text-fg-muted">
              Blockers are unavailable right now.
            </p>
          ) : !blockerCount || blockerCount === 0 ? (
            <EmptyState
              title="No blockers"
              description="Every demand line resolves into a clean recommendation. Nothing is waiting on you."
            />
          ) : (
            <div className="space-y-2">
              {blockersByCategory.map((cat) => {
                const tone: Tone =
                  cat.critical > 0
                    ? "danger"
                    : cat.warning > 0
                      ? "warning"
                      : "neutral";
                return (
                  <Link
                    key={cat.category}
                    href={`/planning/blockers?category=${encodeURIComponent(cat.category)}`}
                    className="group flex items-center gap-3 rounded-lg border border-border/70 bg-bg p-3 transition-colors hover:border-accent/40 hover:bg-bg-subtle/60"
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                        TONE_ICON[tone],
                      )}
                    >
                      <AlertTriangle className="h-4 w-4" strokeWidth={2} aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-fg-strong">
                        {blockerCategoryLabel(cat.category)}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-fg-muted">
                        {cat.critical > 0 ? (
                          <span className="font-semibold text-danger-fg">
                            {fmtNum(cat.critical)} critical
                          </span>
                        ) : null}
                        {cat.warning > 0 ? (
                          <span className="font-semibold text-warning-fg">
                            {fmtNum(cat.warning)} warning
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 font-mono text-sm font-semibold tabular-nums",
                        TONE_SOFT[tone],
                      )}
                    >
                      {fmtNum(cat.count)}
                    </span>
                    <ArrowRight
                      className="h-4 w-4 shrink-0 text-fg-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
                      strokeWidth={2}
                      aria-hidden
                    />
                  </Link>
                );
              })}
              {blockerCount > blockerRows.length ? (
                <p className="pt-1 text-2xs text-fg-faint">
                  Showing the first {fmtNum(blockerRows.length)} of{" "}
                  {fmtNum(blockerCount)} blockers — open the full list for the
                  rest.
                </p>
              ) : null}
            </div>
          )}
        </SectionCard>

        {/* --- Engine inputs ----------------------------------------------- */}
        <SectionCard
          eyebrow="Data freshness"
          title="Engine inputs"
          description="The feeds every planning run depends on."
        >
          <div className="space-y-3">
            {/* Forecast */}
            <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-bg p-3">
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                  TONE_ICON[
                    !latestForecast
                      ? "danger"
                      : latestForecast.published_at
                        ? "success"
                        : "warning"
                  ],
                )}
              >
                <BarChart2 className="h-4 w-4" strokeWidth={2} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-2xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Forecast
                </div>
                {forecastQuery.isLoading ? (
                  <div className="mt-1 h-4 w-24 animate-pulse rounded bg-bg-muted" />
                ) : latestForecast ? (
                  <>
                    <div className="text-sm font-semibold text-fg-strong">
                      {fmtMonthYear(latestForecast.horizon_start_at)}
                      {latestForecast.horizon_weeks ? (
                        <span className="ml-1 text-xs font-normal text-fg-muted">
                          · {latestForecast.horizon_weeks}
                          {latestForecast.cadence === "monthly" ? "mo" : "w"}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1">
                      <FreshnessBadge
                        lastAt={latestForecast.published_at ?? undefined}
                        producer="forecast_published_at"
                        warnAfterMinutes={60 * 24 * 14}
                        failAfterMinutes={60 * 24 * 30}
                        compact
                      />
                    </div>
                  </>
                ) : (
                  <div className="text-sm font-semibold text-danger-fg">
                    No active forecast
                  </div>
                )}
              </div>
              <Link
                href="/planning/forecast"
                className="text-xs font-semibold text-accent hover:underline"
              >
                Open
              </Link>
            </div>

            {/* LionWheel sync */}
            <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-bg p-3">
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                  TONE_ICON[
                    !lionwheelJob
                      ? "neutral"
                      : lionwheelJob.last_status === "failed"
                        ? "danger"
                        : Number(lionwheelJob.failed_count_24h) > 0
                          ? "warning"
                          : "success"
                  ],
                )}
              >
                {lionwheelJob && lionwheelJob.last_status !== "failed" ? (
                  <Wifi className="h-4 w-4" strokeWidth={2} aria-hidden />
                ) : (
                  <WifiOff className="h-4 w-4" strokeWidth={2} aria-hidden />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-2xs font-semibold uppercase tracking-sops text-fg-subtle">
                  LionWheel sync
                </div>
                {jobsQuery.isLoading ? (
                  <div className="mt-1 h-4 w-24 animate-pulse rounded bg-bg-muted" />
                ) : !lionwheelJob ? (
                  <div className="text-sm font-semibold text-fg-strong">
                    No data yet
                  </div>
                ) : (
                  <>
                    <div className="text-sm font-semibold text-fg-strong">
                      {lionwheelJob.last_status === "failed"
                        ? "Sync failed"
                        : "Synced"}
                    </div>
                    <div className="mt-1">
                      <FreshnessBadge
                        lastAt={lionwheelJob.last_ended_at ?? undefined}
                        producer="lionwheel_poll"
                        warnAfterMinutes={30}
                        failAfterMinutes={120}
                        compact
                      />
                    </div>
                    {Number(lionwheelJob.failed_count_24h) > 0 ? (
                      <div className="mt-1 text-2xs font-semibold text-warning-fg">
                        {fmtNum(Number(lionwheelJob.failed_count_24h))} failure
                        {Number(lionwheelJob.failed_count_24h) !== 1
                          ? "s"
                          : ""}{" "}
                        in 24h
                      </div>
                    ) : null}
                  </>
                )}
              </div>
              <Link
                href="/planning/inventory-flow"
                className="text-xs font-semibold text-accent hover:underline"
              >
                Open
              </Link>
            </div>

            {/* Coverage freshness footnote */}
            {coverage ? (
              <div className="flex items-center gap-2 px-1 text-2xs text-fg-faint">
                <PackageCheck className="h-3 w-3" strokeWidth={2} aria-hidden />
                <span>Demand snapshot taken {timeAgo(coverage.as_of)}.</span>
              </div>
            ) : null}
          </div>
        </SectionCard>
      </div>

      {/* ===================================================================
          Quick navigation
          =================================================================== */}
      <section className="space-y-3" aria-label="Planning sections">
        <h2 className="text-2xs font-semibold uppercase tracking-sops text-fg-muted">
          Jump to section
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {PLANNING_SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.href}
                href={s.href}
                data-testid={`quick-nav-${s.label.toLowerCase().replace(/\s+/g, "-")}`}
                className={cn(
                  "group flex flex-col gap-1 rounded-lg border border-border bg-bg-raised px-4 py-3 transition-all",
                  "hover:border-accent/40 hover:bg-accent-soft/10",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <Icon
                    className="h-4 w-4 text-fg-muted group-hover:text-accent"
                    strokeWidth={2}
                    aria-hidden
                  />
                  <ArrowRight
                    className="h-3.5 w-3.5 text-fg-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
                    strokeWidth={2}
                    aria-hidden
                  />
                </div>
                <span className="text-sm font-semibold text-fg-strong">
                  {s.label}
                </span>
                <span className="text-2xs text-fg-muted">{s.blurb}</span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
