"use client";

// ---------------------------------------------------------------------------
// /planning — Planning workspace command center.
//
// Goal: answer the planner's 5 daily questions at a glance.
//   1. Is the forecast current?
//   2. What did the last planning run produce?
//   3. How many blockers need attention?
//   4. Is LionWheel sync healthy?
//   5. Where do I go next?
//
// Layout:
//   - WorkflowHeader (eyebrow / title / description)
//   - 4 status tiles, each a clickable link-card
//   - Quick-nav row of 5 buttons to the section pages
//
// All decorative I-features (mood map, leaderboards, heatmaps, KPI strips,
// sparklines, etc.) were removed in 2026-05-08 simplification per Tom's UX
// pass. Only live-API tiles remain. Names not IDs. English/LTR throughout.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  AlertTriangle,
  BarChart2,
  Boxes,
  CalendarClock,
  CheckCircle2,
  Loader2,
  PlayCircle,
  Truck,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { FreshnessBadge } from "@/components/badges/FreshnessBadge";
import { Badge } from "@/components/badges/StatusBadge";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Section registry — quick-nav buttons at the bottom.
// ---------------------------------------------------------------------------
const PLANNING_SECTIONS = [
  {
    label: "Forecast",
    href: "/planning/forecast",
    icon: BarChart2,
    blurb: "Demand by month",
  },
  {
    label: "Runs",
    href: "/planning/runs",
    icon: PlayCircle,
    blurb: "Planning history",
  },
  {
    label: "Production plan",
    href: "/planning/production-plan",
    icon: CalendarClock,
    blurb: "This week's build",
  },
  {
    label: "Inventory",
    href: "/planning/inventory-flow",
    icon: Boxes,
    blurb: "Daily projection",
  },
  {
    label: "Blockers",
    href: "/planning/blockers",
    icon: AlertTriangle,
    blurb: "Items to fix",
  },
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

interface PlanningRunSummaryRow {
  run_id: string;
  executed_at: string;
  trigger_source: "manual" | "scheduled";
  planning_horizon_start_at: string;
  planning_horizon_weeks: number;
  status: "draft" | "running" | "completed" | "failed" | "superseded";
  summary: {
    fg_coverage_count: number;
    purchase_recs_count: number;
    production_recs_count: number;
    exceptions_count: number;
  };
}

interface BlockersResponse {
  total_blocker_count: number;
  run: { run_id: string | null; run_status: string | null };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

function fmtMonthYear(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function runStatusLabel(status: PlanningRunSummaryRow["status"]): string {
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  if (status === "running") return "Running";
  if (status === "superseded") return "Superseded";
  if (status === "draft") return "Queued";
  return status;
}

function runStatusTone(
  status: PlanningRunSummaryRow["status"],
): "success" | "warning" | "danger" | "neutral" {
  if (status === "completed") return "success";
  if (status === "running" || status === "draft") return "warning";
  if (status === "failed") return "danger";
  return "neutral";
}

// ---------------------------------------------------------------------------
// Tile primitive — clickable status card linking to a section page.
// ---------------------------------------------------------------------------
interface TileProps {
  href: string;
  eyebrow: string;
  icon: React.ReactNode;
  loading?: boolean;
  toneAccent?: "success" | "warning" | "danger" | "neutral";
  children: React.ReactNode;
  testId?: string;
}

function Tile({
  href,
  eyebrow,
  icon,
  loading,
  toneAccent = "neutral",
  children,
  testId,
}: TileProps) {
  const accentColor =
    toneAccent === "success"
      ? "bg-success"
      : toneAccent === "warning"
        ? "bg-warning"
        : toneAccent === "danger"
          ? "bg-danger"
          : "bg-border-strong";

  return (
    <Link
      href={href}
      data-testid={testId}
      className={cn(
        "group relative flex flex-col gap-3 overflow-hidden rounded-lg border border-border bg-bg-raised p-5 shadow-raised transition-all",
        "hover:border-accent/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
      )}
    >
      <span
        className={cn("absolute inset-y-0 left-0 w-[3px]", accentColor)}
        aria-hidden
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded border border-border/70 bg-bg text-fg-muted">
            {icon}
          </span>
          <span className="text-2xs font-semibold uppercase tracking-sops text-fg-muted">
            {eyebrow}
          </span>
        </div>
        <ArrowRight
          className="h-4 w-4 text-fg-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
          strokeWidth={2}
          aria-hidden
        />
      </div>
      <div className="min-h-[64px]">
        {loading ? (
          <div className="space-y-2">
            <div className="h-5 w-2/3 animate-pulse rounded bg-bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-bg-muted" />
          </div>
        ) : (
          children
        )}
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function PlanningLandingPage() {
  // Forecast freshness — most recent published version.
  const forecastQuery = useQuery<{ rows: ForecastVersionRow[] }>({
    queryKey: ["planning", "landing", "forecast"],
    queryFn: async () => {
      const res = await fetch("/api/forecasts/versions?status=published");
      if (!res.ok) throw new Error("Request failed");
      return res.json() as Promise<{ rows: ForecastVersionRow[] }>;
    },
    staleTime: 2 * 60 * 1000,
  });

  // Jobs — used for LionWheel sync health.
  const jobsQuery = useQuery<{ rows: JobRow[] }>({
    queryKey: ["planning", "landing", "jobs"],
    queryFn: async () => {
      const res = await fetch("/api/admin/jobs");
      if (!res.ok) throw new Error("Request failed");
      return res.json() as Promise<{ rows: JobRow[] }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Latest planning run.
  const runsQuery = useQuery<{ rows: PlanningRunSummaryRow[]; total: number }>({
    queryKey: ["planning", "landing", "runs"],
    queryFn: async () => {
      const res = await fetch("/api/planning/runs");
      if (!res.ok) throw new Error("Request failed");
      return res.json() as Promise<{
        rows: PlanningRunSummaryRow[];
        total: number;
      }>;
    },
    staleTime: 2 * 60 * 1000,
  });

  // Blockers count for the latest run.
  const blockersQuery = useQuery<BlockersResponse>({
    queryKey: ["planning", "landing", "blockers"],
    queryFn: async () => {
      const res = await fetch("/api/planning/blockers?page_size=1");
      if (!res.ok) throw new Error("Request failed");
      return res.json() as Promise<BlockersResponse>;
    },
    staleTime: 2 * 60 * 1000,
    retry: false,
  });

  // ----- derived state ------------------------------------------------------
  const latestForecast = forecastQuery.data?.rows?.[0] ?? null;
  const lionwheelJob =
    jobsQuery.data?.rows?.find(
      (j) =>
        j.job_name === "integration.lionwheel" ||
        j.job_name === "lionwheel_poll",
    ) ?? null;
  const latestRun = runsQuery.data?.rows?.[0] ?? null;
  const blockerCount = blockersQuery.data?.total_blocker_count ?? null;

  const queriesSettled =
    !forecastQuery.isLoading &&
    !jobsQuery.isLoading &&
    !runsQuery.isLoading &&
    !blockersQuery.isLoading;

  const hasWarning =
    queriesSettled &&
    (lionwheelJob?.last_status === "failed" ||
      latestRun?.status === "failed" ||
      !latestForecast ||
      (blockerCount !== null && blockerCount > 0));

  // ----- render -------------------------------------------------------------
  return (
    <>
      <WorkflowHeader
        eyebrow="Planning workspace"
        title="Planning"
        description="Forecast → run → produce. Status at a glance."
        meta={
          !queriesSettled ? (
            <Badge tone="neutral" dotted>
              Checking…
            </Badge>
          ) : hasWarning ? (
            <Badge tone="warning" dotted>
              Attention needed
            </Badge>
          ) : (
            <Badge tone="success" dotted>
              All systems green
            </Badge>
          )
        }
      />

      {/* ----- 4 status tiles ----- */}
      <section
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Planning status overview"
      >
        {/* Tile 1 — Forecast freshness */}
        <Tile
          href="/planning/forecast"
          eyebrow="Forecast"
          icon={<BarChart2 className="h-3.5 w-3.5" strokeWidth={2} />}
          loading={forecastQuery.isLoading}
          toneAccent={
            !latestForecast
              ? "danger"
              : latestForecast.published_at
                ? "success"
                : "warning"
          }
          testId="tile-forecast"
        >
          {!latestForecast ? (
            <div className="flex flex-col gap-1">
              <div className="text-base font-semibold text-fg-strong">
                No active forecast
              </div>
              <div className="text-xs text-fg-muted">
                Create one to drive planning.
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="text-base font-semibold text-fg-strong">
                {fmtMonthYear(latestForecast.horizon_start_at)}
                {latestForecast.horizon_weeks ? (
                  <span className="ml-1.5 text-sm font-normal text-fg-muted">
                    · {latestForecast.horizon_weeks}
                    {latestForecast.cadence === "monthly" ? "mo" : "w"}
                  </span>
                ) : null}
              </div>
              <FreshnessBadge
                lastAt={latestForecast.published_at ?? undefined}
                producer="forecast_published_at"
                warnAfterMinutes={60 * 24 * 14}
                failAfterMinutes={60 * 24 * 30}
                compact
              />
            </div>
          )}
        </Tile>

        {/* Tile 2 — Last planning run */}
        <Tile
          href={
            latestRun
              ? `/planning/runs/${encodeURIComponent(latestRun.run_id)}`
              : "/planning/runs"
          }
          eyebrow="Last run"
          icon={<PlayCircle className="h-3.5 w-3.5" strokeWidth={2} />}
          loading={runsQuery.isLoading}
          toneAccent={latestRun ? runStatusTone(latestRun.status) : "neutral"}
          testId="tile-last-run"
        >
          {!latestRun ? (
            <div className="flex flex-col gap-1">
              <div className="text-base font-semibold text-fg-strong">
                No runs yet
              </div>
              <div className="text-xs text-fg-muted">
                Trigger a planning run to generate recommendations.
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-fg-strong">
                  {runStatusLabel(latestRun.status)}
                </span>
                {latestRun.status === "completed" ? (
                  <CheckCircle2
                    className="h-4 w-4 text-success"
                    strokeWidth={2}
                    aria-hidden
                  />
                ) : latestRun.status === "failed" ? (
                  <XCircle
                    className="h-4 w-4 text-danger"
                    strokeWidth={2}
                    aria-hidden
                  />
                ) : latestRun.status === "running" ? (
                  <Loader2
                    className="h-4 w-4 animate-spin text-warning"
                    strokeWidth={2}
                    aria-hidden
                  />
                ) : null}
              </div>
              <div className="text-xs text-fg-muted">
                {latestRun.summary.purchase_recs_count +
                  latestRun.summary.production_recs_count}{" "}
                recommendations · {timeAgo(latestRun.executed_at)}
              </div>
            </div>
          )}
        </Tile>

        {/* Tile 3 — Blockers */}
        <Tile
          href="/planning/blockers"
          eyebrow="Blockers"
          icon={<AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} />}
          loading={blockersQuery.isLoading}
          toneAccent={
            blockerCount === null
              ? "neutral"
              : blockerCount === 0
                ? "success"
                : blockerCount <= 3
                  ? "warning"
                  : "danger"
          }
          testId="tile-blockers"
        >
          {blockersQuery.isError ? (
            <div className="flex flex-col gap-1">
              <div className="text-base font-semibold text-fg-strong">
                Unavailable
              </div>
              <div className="text-xs text-fg-muted">
                Could not load blocker count.
              </div>
            </div>
          ) : blockerCount === null ? (
            <div className="flex flex-col gap-1">
              <div className="text-base font-semibold text-fg-strong">—</div>
              <div className="text-xs text-fg-muted">No data yet.</div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="text-2xl font-semibold tabular-nums text-fg-strong">
                {blockerCount}
              </div>
              <div className="text-xs text-fg-muted">
                {blockerCount === 0
                  ? "No items need attention"
                  : blockerCount === 1
                    ? "item needs attention"
                    : "items need attention"}
              </div>
            </div>
          )}
        </Tile>

        {/* Tile 4 — LionWheel sync */}
        <Tile
          href="/planning/inventory-flow"
          eyebrow="LionWheel sync"
          icon={<Truck className="h-3.5 w-3.5" strokeWidth={2} />}
          loading={jobsQuery.isLoading}
          toneAccent={
            !lionwheelJob
              ? "neutral"
              : lionwheelJob.last_status === "failed"
                ? "danger"
                : Number(lionwheelJob.failed_count_24h) > 0
                  ? "warning"
                  : "success"
          }
          testId="tile-lionwheel"
        >
          {!lionwheelJob ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <WifiOff
                  className="h-4 w-4 text-fg-faint"
                  strokeWidth={2}
                  aria-hidden
                />
                <span className="text-base font-semibold text-fg-strong">
                  No data
                </span>
              </div>
              <div className="text-xs text-fg-muted">
                Job has not reported yet.
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                {lionwheelJob.last_status === "failed" ? (
                  <WifiOff
                    className="h-4 w-4 text-danger"
                    strokeWidth={2}
                    aria-hidden
                  />
                ) : (
                  <Wifi
                    className="h-4 w-4 text-success"
                    strokeWidth={2}
                    aria-hidden
                  />
                )}
                <span className="text-base font-semibold text-fg-strong">
                  {lionwheelJob.last_status === "failed" ? "Failed" : "Synced"}
                </span>
              </div>
              <FreshnessBadge
                lastAt={lionwheelJob.last_ended_at ?? undefined}
                producer="lionwheel_poll"
                warnAfterMinutes={30}
                failAfterMinutes={120}
                compact
              />
              {Number(lionwheelJob.failed_count_24h) > 0 ? (
                <div className="text-xs text-warning-fg">
                  {lionwheelJob.failed_count_24h} failure
                  {Number(lionwheelJob.failed_count_24h) !== 1 ? "s" : ""} in
                  24h
                </div>
              ) : null}
            </div>
          )}
        </Tile>
      </section>

      {/* ----- Quick-nav row ----- */}
      <section
        className="mt-8 flex flex-col gap-3"
        aria-label="Planning sections"
      >
        <h2 className="text-2xs font-semibold uppercase tracking-sops text-fg-muted">
          Jump to section
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {PLANNING_SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.href}
                href={s.href}
                data-testid={`quick-nav-${s.label.toLowerCase().replace(/\s+/g, "-")}`}
                className={cn(
                  "group flex flex-col gap-1 rounded-md border border-border bg-bg-raised px-4 py-3 transition-all",
                  "hover:border-accent/40 hover:bg-accent-soft/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
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
    </>
  );
}
