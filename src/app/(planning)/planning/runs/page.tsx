"use client";

// ---------------------------------------------------------------------------
// /planner/runs — canonical list of planning runs.
//
// Scope (W2 Mode B, PlanningRun only; Phase 8 MVP):
//   - Lists rows from GET /api/v1/queries/planning/runs (§3.1)
//   - Status filter (draft / running / completed / failed / superseded)
//   - Click row -> /planner/runs/[run_id]
//   - "Trigger planning run" action (planner + admin only) -> POST
//     /api/v1/mutations/planning/run (Phase 7B) -> redirect on success
//   - Break-glass banner on 503
//
// Role gate:
//   - operator/viewer: list visible; "Trigger run" hidden
//   - planner/admin: "Trigger run" visible
//   - Operators are admitted by PlannerLayout RoleGate (allow list includes
//     all four roles since reads are open per §6 matrix).
//
// Deferred to future cycles: pagination UI, policy_snapshot full drill-down,
// bulk actions.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  Play,
  CalendarRange,
  CalendarCheck,
  TrendingUp,
  TrendingDown,
  Minus,
  Trophy,
  Diff,
  Clock3,
  Clock,
  AlertTriangle,
  MessageSquare,
  Cpu,
  Columns,
  RefreshCcw,
  PieChart,
  Maximize2,
  Package,
  BarChart3,
  CircleDollarSign,
  Activity,
  User,
  CalendarDays,
  Zap,
  Layers,
  Database,
  LayoutGrid,
  XCircle,
  HeartPulse,
  XOctagon,
  BarChart2,
  ListChecks,
  ThumbsUp,
  AlertOctagon,
  Award,
  Loader,
  Shield,
  RefreshCw,
  Network,
  Timer,
} from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { EmptyState } from "@/components/feedback/states";
import { useSession } from "@/lib/auth/session-provider";
import type { Session } from "@/lib/auth/fake-auth";
import { cn } from "@/lib/cn";

type PlanningRunStatus =
  | "draft"
  | "running"
  | "completed"
  | "failed"
  | "superseded";

interface ForecastContextRow {
  version_id: string;
  cadence: string | null;
  horizon_start_at: string | null;
  horizon_weeks: number | null;
  status: string;
  published_at: string | null;
}

interface JobContextRow {
  job_name: string;
  last_ended_at: string | null;
  last_status: string | null;
  failed_count_24h: number;
}

interface DemandCoverageRow {
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

interface PlanningRunListRow {
  run_id: string;
  executed_at: string;
  actor_user_id: string;
  trigger_source: "manual" | "scheduled";
  planning_horizon_start_at: string;
  planning_horizon_weeks: number;
  status: PlanningRunStatus;
  idempotency_key: string | null;
  summary: {
    fg_coverage_count: number;
    purchase_recs_count: number;
    production_recs_count: number;
    exceptions_count: number;
  };
}

interface ListResponse {
  rows: PlanningRunListRow[];
  count: number;
  total: number;
}

const STATUS_OPTIONS: PlanningRunStatus[] = [
  "draft",
  "running",
  "completed",
  "failed",
  "superseded",
];

function sessionHeaders(_session: Session): HeadersInit {
  // Real identity flows through the Supabase Bearer token on the portal
  // proxy (api-proxy.ts); the `_session` parameter remains for call-site
  // compatibility and potential future audit logging.
  return {
    "Content-Type": "application/json",
  };
}

async function fetchRuns(
  session: Session,
  status: PlanningRunStatus | null,
): Promise<ListResponse> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await fetch(`/api/planning/runs${qs}`, {
    method: "GET",
    headers: sessionHeaders(session),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error("Failed to load planning runs. Check your connection and try refreshing.");
  }
  return (await res.json()) as ListResponse;
}

function genIdempotencyKey(): string {
  // Browser-safe UUIDv4. crypto.randomUUID is available in all evergreen
  // browsers + Node 18+; we don't need a polyfill.
  try {
    return (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
      ?.randomUUID?.() ?? `rid-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  } catch {
    return `rid-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

async function triggerRun(
  session: Session,
): Promise<{ run_id: string; idempotent_replay: boolean; status: string }> {
  const res = await fetch("/api/planning/runs/execute", {
    method: "POST",
    headers: sessionHeaders(session),
    body: JSON.stringify({
      idempotency_key: genIdempotencyKey(),
      trigger_source: "manual",
    }),
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (res.status === 503) {
    const err = new Error("Break-glass active: planning writes suspended.");
    (err as Error & { status?: number }).status = 503;
    throw err;
  }
  if (!res.ok) {
    let detail = "";
    try {
      const parsed = body as { detail?: string };
      detail = parsed.detail ?? "";
    } catch { /* ignore */ }
    const err = new Error(detail || "Could not trigger planning run. Try again.");
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return body as { run_id: string; idempotent_replay: boolean; status: string };
}

// Color palette (A13 decision, documented in checkpoint):
// - completed -> success (green dot)
// - running -> info (blue dot, pulse)
// - draft -> warning (amber dot)
// - failed -> danger (red dot)
// - superseded -> neutral (grey dot)
function RunStatusBadge({ status }: { status: PlanningRunStatus }) {
  if (status === "completed") {
    return (
      <Badge tone="success" variant="solid">
        Completed
      </Badge>
    );
  }
  if (status === "running") {
    return (
      <Badge tone="info" dotted>
        Running
      </Badge>
    );
  }
  if (status === "draft") {
    return (
      <Badge tone="warning" dotted>
        Draft
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge tone="danger" variant="solid">
        Failed
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" dotted>
      Superseded
    </Badge>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
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

function fmtTriggerSource(t: "manual" | "scheduled"): string {
  return t === "manual" ? "Manual" : "Scheduled";
}

// ---------------------------------------------------------------------------
// RunTimelineRow — extracted row component so delta props can be passed in
// ---------------------------------------------------------------------------
interface RunTimelineDelta {
  durationDelta: number;
  exceptionDelta: number;
}

interface RunTimelineRowProps {
  r: PlanningRunListRow;
  showRunDelta: boolean;
  delta: RunTimelineDelta | undefined;
  // R36 — Per-run annotation props
  annotation: string;
  isAnnotating: boolean;
  onAnnotationChange: (val: string) => void;
  onToggleAnnotate: () => void;
}

function RunTimelineRow({
  r,
  showRunDelta,
  delta,
  annotation,
  isAnnotating,
  onAnnotationChange,
  onToggleAnnotate,
}: RunTimelineRowProps) {
  const runHref = `/planning/runs/${encodeURIComponent(r.run_id)}`;
  return (
    <li
      key={r.run_id}
      className="px-5 py-4 hover:bg-bg-subtle/40 transition-colors duration-150 rounded"
      data-testid="planning-runs-row"
      data-run-id={r.run_id}
      data-status={r.status}
    >
      {/* Header region — clicking anywhere here opens the run detail
          on its default (Purchase) tab. The summary badges below
          are their own links so the manager can jump straight into
          the right tab without an extra click. */}
      <Link
        href={runHref}
        className="block -mx-2 px-2 py-1 rounded"
        data-testid="planning-runs-row-link"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <RunStatusBadge status={r.status} />
            <span className="chip">{fmtTriggerSource(r.trigger_source)}</span>
          </div>
          <div className="mt-1.5 text-base font-semibold tracking-tightish text-fg-strong">
            Executed {fmtDate(r.executed_at)}
          </div>
          <div className="mt-1 flex flex-wrap gap-4 text-xs text-fg-muted">
            <span>
              Horizon {fmtDate(r.planning_horizon_start_at)} ·{" "}
              {r.planning_horizon_weeks}w
            </span>
            <span>{fmtTriggerSource(r.trigger_source)} trigger</span>
            {/* R33 — Consecutive run delta inline badges */}
            {showRunDelta && delta ? (
              <span className="inline-flex items-center gap-2">
                <span
                  className={cn(
                    "text-3xs font-medium",
                    delta.durationDelta < 0
                      ? "text-success-fg"
                      : delta.durationDelta > 0
                        ? "text-danger-fg"
                        : "text-fg-muted",
                  )}
                >
                  Δ{delta.durationDelta >= 0 ? "+" : ""}{delta.durationDelta}m
                </span>
                <span
                  className={cn(
                    "text-3xs font-medium",
                    delta.exceptionDelta < 0
                      ? "text-success-fg"
                      : delta.exceptionDelta > 0
                        ? "text-danger-fg"
                        : "text-fg-muted",
                  )}
                >
                  Δ{delta.exceptionDelta >= 0 ? "+" : ""}{delta.exceptionDelta} exc
                </span>
              </span>
            ) : null}
          </div>
        </div>
      </Link>

      {/* Summary badges — each is its own deep link. Purchase and
          Production land directly on the matching tab; FG and
          exceptions go to the run detail (no exceptions tab yet). */}
      <div className="mt-2 -mx-2 px-2 flex flex-wrap gap-2 items-center" data-testid="planning-runs-row-summary">
        <Link
          href={`${runHref}?tab=purchase`}
          className="hover:opacity-80"
          data-testid="planning-runs-row-purchase-link"
          title="Open purchase recommendations for this run"
        >
          <Badge tone="neutral">
            {r.summary.purchase_recs_count} purchase
          </Badge>
        </Link>
        <Link
          href={`${runHref}?tab=production`}
          className="hover:opacity-80"
          data-testid="planning-runs-row-production-link"
          title="Open production recommendations for this run"
        >
          <Badge tone="neutral">
            {r.summary.production_recs_count} production
          </Badge>
        </Link>
        <Link
          href={runHref}
          className="hover:opacity-80"
          title="Open run detail"
        >
          <Badge tone="neutral">
            {r.summary.fg_coverage_count} FG lines
          </Badge>
        </Link>
        {r.summary.exceptions_count > 0 ? (
          <Link
            href={runHref}
            className="hover:opacity-80"
            title="Open run detail to review exceptions"
          >
            <Badge tone="warning" dotted>
              {r.summary.exceptions_count} exception
              {r.summary.exceptions_count === 1 ? "" : "s"}
            </Badge>
          </Link>
        ) : null}
        {/* R36 — Annotation toggle button */}
        <button
          type="button"
          onClick={onToggleAnnotate}
          title={annotation.trim() ? "Edit note for this run" : "Add note for this run"}
          className={cn(
            "ml-auto inline-flex items-center p-0.5 rounded transition-colors duration-150",
            annotation.trim() ? "text-accent" : "text-fg-faint hover:text-fg-muted",
          )}
          data-testid="planning-runs-row-annotate-btn"
        >
          <MessageSquare className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>
      {/* R36 — Inline annotation panel */}
      {isAnnotating ? (
        <div className="bg-bg-subtle border border-accent/20 rounded p-2 mt-1 mx-2">
          <textarea
            className="w-full text-3xs bg-transparent border border-border rounded p-1 resize-none h-12 text-fg-muted focus:outline-none"
            value={annotation}
            placeholder="Add note for this run..."
            onChange={(e) => onAnnotationChange(e.target.value)}
          />
          <div className="flex justify-between mt-1">
            <span className="text-3xs text-fg-faint">{annotation.length} chars</span>
            <button
              type="button"
              onClick={onToggleAnnotate}
              className="text-3xs text-fg-faint hover:text-fg-muted"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export default function PlanningRunsListPage() {
  const { session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] =
    useState<PlanningRunStatus | null>(null);
  const [breakGlass, setBreakGlass] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [showTriggerConfirm, setShowTriggerConfirm] = useState(false);
  const canAuthor = session.role === "planner" || session.role === "admin";

  const forecastQuery = useQuery<{ rows: ForecastContextRow[] }>({
    queryKey: ["forecast", "versions", "published"],
    queryFn: async () => {
      const res = await fetch("/api/forecasts/versions?status=published");
      if (!res.ok) throw new Error("Request failed");
      return res.json() as Promise<{ rows: ForecastContextRow[] }>;
    },
    staleTime: 2 * 60 * 1000,
  });

  const jobsQuery = useQuery<{ rows: JobContextRow[] }>({
    queryKey: ["admin", "jobs"],
    queryFn: async () => {
      const res = await fetch("/api/admin/jobs");
      if (!res.ok) throw new Error("Request failed");
      return res.json() as Promise<{ rows: JobContextRow[] }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const demandCoverageQuery = useQuery<DemandCoverageRow>({
    queryKey: ["planning", "demand-coverage"],
    queryFn: async () => {
      const res = await fetch("/api/planning/demand-coverage");
      if (!res.ok) throw new Error("Request failed");
      return res.json() as Promise<DemandCoverageRow>;
    },
    staleTime: 3 * 60 * 1000,
  });

  const latestForecast = forecastQuery.data?.rows?.[0] ?? null;
  const lionwheelJob =
    jobsQuery.data?.rows?.find(
      (j) => j.job_name === "integration.lionwheel" || j.job_name === "lionwheel_poll",
    ) ?? null;
  const coverage = demandCoverageQuery.data ?? null;

  const query = useQuery<ListResponse>({
    queryKey: ["planning", "runs", statusFilter ?? "all", session.role],
    queryFn: () => fetchRuns(session, statusFilter),
    staleTime: 60_000,
  });

  const triggerMutation = useMutation({
    mutationFn: () => triggerRun(session),
    onSuccess: (data) => {
      setBreakGlass(false);
      setTriggerError(null);
      void queryClient.invalidateQueries({ queryKey: ["planning", "runs"] });
      router.push(`/planning/runs/${encodeURIComponent(data.run_id)}`);
    },
    onError: (err: Error & { status?: number }) => {
      if (err.status === 503) {
        setBreakGlass(true);
        setTriggerError(null);
      } else {
        setBreakGlass(false);
        console.error("[PlanningRuns] trigger error:", err);
        setTriggerError("Could not trigger planning run. Check your connection and try again. If the problem persists, contact your admin.");
      }
    },
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;

  // R30 — Run Calendar Heatmap state
  const [showRunCalendar, setShowRunCalendar] = useState(false);

  // R30 — 28-day grid (4 weeks × 7 days) ending today
  const runCalendarData = useMemo((): { iso: string; count: number; isToday: boolean }[] => {
    const dateCountMap = new Map<string, number>();
    for (const r of rows) {
      const raw =
        (r as any).run_date ??
        (r as any).created_at ??
        (r as any).started_at ??
        r.executed_at;
      if (!raw) continue;
      const dt = new Date(raw as string);
      if (isNaN(dt.getTime())) continue;
      const iso = dt.toISOString().slice(0, 10);
      dateCountMap.set(iso, (dateCountMap.get(iso) ?? 0) + 1);
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString().slice(0, 10);
    const cells: { iso: string; count: number; isToday: boolean }[] = [];
    for (let i = 27; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      cells.push({ iso, count: dateCountMap.get(iso) ?? 0, isToday: iso === todayIso });
    }
    return cells;
  }, [rows]);

  // R31 — Exception Count Trend (4-week): group by ISO week, sum exceptions, last 4 weeks
  const exceptionTrend4W = useMemo((): { weekLabel: string; total: number }[] => {
    const weekMap = new Map<string, number>();
    for (const r of rows) {
      const raw =
        (r as any).run_date ??
        (r as any).created_at ??
        (r as any).started_at ??
        r.executed_at;
      if (!raw) continue;
      const dt = new Date(raw as string);
      if (isNaN(dt.getTime())) continue;
      const excCount: number =
        (r as any).exception_count ??
        (r as any).exceptions_count ??
        (r as any).summary?.exceptions_count ??
        0;
      const day = dt.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      const monday = new Date(dt);
      monday.setDate(dt.getDate() + mondayOffset);
      monday.setHours(0, 0, 0, 0);
      const key = monday.toISOString().slice(0, 10);
      weekMap.set(key, (weekMap.get(key) ?? 0) + excCount);
    }
    const sorted = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-4);
    return sorted.map(([key, total]) => {
      const monday = new Date(key);
      const weekLabel = `Wk ${monday.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
      return { weekLabel, total };
    });
  }, [rows]);

  // R31 — Direction: compare last week total to avg of prior weeks
  const exceptionTrendDir = useMemo((): "improving" | "worsening" | "stable" => {
    if (exceptionTrend4W.length < 2) return "stable";
    const lastWeekTotal = exceptionTrend4W[exceptionTrend4W.length - 1]!.total;
    const olderWeeks = exceptionTrend4W.slice(0, exceptionTrend4W.length - 1);
    const olderAvg = olderWeeks.reduce((s, w) => s + w.total, 0) / olderWeeks.length;
    if (olderAvg === 0) return "stable";
    const changePct = (lastWeekTotal - olderAvg) / olderAvg;
    if (changePct <= -0.1) return "improving";
    if (changePct >= 0.1) return "worsening";
    return "stable";
  }, [exceptionTrend4W]);

  // R32 — displayRows: alias for rows (filter/sort may be applied here in future)
  const displayRows = rows;

  // R32 — Top Performer Run Chip
  const topPerformerRun = useMemo((): { runId: string; score: number; label: string } | null => {
    if (displayRows.length === 0) return null;
    // Score: completed runs with lowest duration win; non-completed get penalized
    let best: PlanningRunListRow | null = null;
    let bestScore = Infinity;
    for (const r of displayRows) {
      if (r.status !== "completed") continue;
      const dur: number =
        (r as any).duration_minutes ??
        ((r as any).duration_ms != null ? Math.round((r as any).duration_ms / 60000) : null) ??
        999;
      const excPenalty: number =
        (r as any).exception_count ??
        (r as any).exceptions_count ??
        r.summary.exceptions_count ??
        0;
      const score = dur + excPenalty * 10;
      if (score < bestScore) {
        bestScore = score;
        best = r;
      }
    }
    if (!best) return null;
    const labelBase: string =
      (best as any).label ??
      (best as any).name ??
      best.run_id;
    return {
      runId: best.run_id,
      score: bestScore,
      label: labelBase.slice(0, 8),
    };
  }, [displayRows]);

  // R33 — Show run delta toggle
  const [showRunDelta, setShowRunDelta] = useState(false);

  // R33 — Consecutive run delta map
  const runDeltas = useMemo((): Map<string, { durationDelta: number; exceptionDelta: number }> => {
    const map = new Map<string, { durationDelta: number; exceptionDelta: number }>();
    for (let i = 1; i < displayRows.length; i++) {
      const curr = displayRows[i]!;
      const prev = displayRows[i - 1]!;
      const currDur: number =
        (curr as any).duration_minutes ??
        ((curr as any).duration_ms != null ? Math.round((curr as any).duration_ms / 60000) : 0) ??
        0;
      const prevDur: number =
        (prev as any).duration_minutes ??
        ((prev as any).duration_ms != null ? Math.round((prev as any).duration_ms / 60000) : 0) ??
        0;
      const currExc: number =
        (curr as any).exception_count ??
        (curr as any).exceptions_count ??
        curr.summary.exceptions_count ??
        0;
      const prevExc: number =
        (prev as any).exception_count ??
        (prev as any).exceptions_count ??
        prev.summary.exceptions_count ??
        0;
      map.set(curr.run_id, {
        durationDelta: currDur - prevDur,
        exceptionDelta: currExc - prevExc,
      });
    }
    return map;
  }, [displayRows]);

  // R34 — Runs by Time-of-Day Chart
  const [showTimeOfDayChart, setShowTimeOfDayChart] = useState(false);

  const timeOfDayDist = useMemo((): { label: string; count: number }[] => {
    const buckets = [
      { label: "Night", count: 0 },   // 0–5
      { label: "Morning", count: 0 }, // 6–11
      { label: "Afternoon", count: 0 }, // 12–17
      { label: "Evening", count: 0 }, // 18–23
    ];
    for (const r of displayRows) {
      const hour = new Date(
        (r as any).created_at ?? (r as any).started_at ?? 0,
      ).getHours();
      if (hour >= 0 && hour <= 5) buckets[0]!.count += 1;
      else if (hour >= 6 && hour <= 11) buckets[1]!.count += 1;
      else if (hour >= 12 && hour <= 17) buckets[2]!.count += 1;
      else buckets[3]!.count += 1;
    }
    return buckets;
  }, [displayRows]);

  // R35 — 30-Day Failure Rate Chip
  const failureRate30d = useMemo((): { rate: number; total: number; failures: number } | null => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recent = displayRows.filter((r) => {
      const ts = (r as any).created_at;
      if (!ts) return false;
      return new Date(ts as string).getTime() >= cutoff;
    });
    if (recent.length < 3) return null;
    const failures = recent.filter(
      (r) => (r as any).status !== "success" && r.status !== "completed",
    ).length;
    const rate = Math.round((failures / recent.length) * 100);
    return { rate, total: recent.length, failures };
  }, [displayRows]);

  // R36 — Per-run annotations (localStorage-backed)
  const [runAnnotations, setRunAnnotations] = useState<Record<string, string>>(() => {
    try {
      const stored = typeof window !== "undefined" ? localStorage.getItem("gt_run_annotations") : null;
      return stored ? (JSON.parse(stored) as Record<string, string>) : {};
    } catch {
      return {};
    }
  });
  const [annotatingRunId, setAnnotatingRunId] = useState<string | null>(null);

  // R37 — Engine Version Chip
  const engineVersionChip = useMemo((): { version: string; count: number } | null => {
    const freqMap = new Map<string, number>();
    for (const r of displayRows) {
      const v: string | null =
        (r as any).engine_version ??
        (r as any).planner_version ??
        (r as any).version ??
        null;
      if (!v) continue;
      freqMap.set(v, (freqMap.get(v) ?? 0) + 1);
    }
    if (freqMap.size === 0) return null;
    let topVersion = "";
    let topCount = 0;
    for (const [version, count] of freqMap.entries()) {
      if (count > topCount) {
        topCount = count;
        topVersion = version;
      }
    }
    return { version: topVersion, count: topCount };
  }, [displayRows]);

  // R38 — Run Comparison Table state
  const [showRunCompareTable, setShowRunCompareTable] = useState(false);

  // R38 — compareTableData: first 2 displayRows shaped for side-by-side comparison
  const compareTableData = useMemo((): [
    { id: string; label: string; status: string; total_recs: number | null; exceptions: number | null; quality_score: number | null; created_at: string | null },
    { id: string; label: string; status: string; total_recs: number | null; exceptions: number | null; quality_score: number | null; created_at: string | null },
  ] | null => {
    const source = displayRows.slice(0, 2);
    if (source.length < 2) return null;
    const shape = (r: PlanningRunListRow) => {
      const totalRecs: number | null =
        (r as any).total_recs ??
        (((r as any).summary?.purchase_recs_count ?? 0) +
          ((r as any).summary?.production_recs_count ?? 0));
      const exceptions: number | null =
        (r as any).exception_count ??
        (r as any).exceptions_count ??
        (r as any).summary?.exceptions_count ??
        null;
      const qualityScore: number | null =
        (r as any).quality_score ??
        (r as any).score ??
        null;
      const label: string =
        (r as any).label ??
        (r as any).name ??
        r.run_id.slice(0, 8);
      return {
        id: r.run_id,
        label,
        status: (r as any).status as string,
        total_recs: totalRecs,
        exceptions,
        quality_score: qualityScore,
        created_at: (r as any).created_at ?? r.executed_at ?? null,
      };
    };
    return [shape(source[0]!), shape(source[1]!)];
  }, [displayRows]);

  // R39 — Planning Cadence Chip
  const planningCadenceChip = useMemo((): { avgDays: number; label: string } | null => {
    const sorted = displayRows
      .filter((r) => {
        const ts = (r as any).created_at ?? r.executed_at;
        return !!ts && !isNaN(new Date(ts as string).getTime());
      })
      .sort((a, b) => {
        const ta = new Date(((a as any).created_at ?? a.executed_at) as string).getTime();
        const tb = new Date(((b as any).created_at ?? b.executed_at) as string).getTime();
        return tb - ta; // desc
      })
      .slice(0, 10);
    if (sorted.length < 2) return null;
    let totalDays = 0;
    let pairs = 0;
    for (let i = 0; i < sorted.length - 1; i++) {
      const tsA = new Date(((sorted[i] as any).created_at ?? sorted[i]!.executed_at) as string).getTime();
      const tsB = new Date(((sorted[i + 1] as any).created_at ?? sorted[i + 1]!.executed_at) as string).getTime();
      const daysBetween = (tsA - tsB) / 86400000;
      if (daysBetween >= 0) {
        totalDays += daysBetween;
        pairs += 1;
      }
    }
    if (pairs === 0) return null;
    const avg = totalDays / pairs;
    const avgDays = Math.round(avg);
    const label = avg < 1 ? "Daily" : avg < 7 ? `Every ${Math.round(avg)}d` : "Weekly+";
    return { avgDays, label };
  }, [displayRows]);

  // R40 — Run Result Distribution Donut
  const [showRunDistribution, setShowRunDistribution] = useState(false);

  const runDistributionData = useMemo((): {
    allApproved: number;
    partial: number;
    noneApproved: number;
    error: number;
    total: number;
  } => {
    let allApproved = 0;
    let partial = 0;
    let noneApproved = 0;
    let error = 0;
    for (const r of displayRows) {
      const st: string = (r as any).status as string;
      if (st === "failed" || st === "error") {
        error += 1;
        continue;
      }
      const approvedCount: number | null =
        (r as any).approved_count ??
        (r as any).total_approved ??
        null;
      if (approvedCount === null) {
        // status-only classification
        if (st === "completed") {
          allApproved += 1;
        } else {
          noneApproved += 1;
        }
        continue;
      }
      const rejectedOrPending: number =
        ((r as any).rejected_count ?? 0) + ((r as any).pending_count ?? 0);
      if (approvedCount > 0 && rejectedOrPending === 0) {
        allApproved += 1;
      } else if (approvedCount > 0 && rejectedOrPending > 0) {
        partial += 1;
      } else {
        noneApproved += 1;
      }
    }
    return { allApproved, partial, noneApproved, error, total: displayRows.length };
  }, [displayRows]);

  // R41 — Avg Approval Time Chip
  const avgApprovalTimeChip = useMemo((): { avgHours: number; label: string } | null => {
    const valid: number[] = [];
    for (const r of displayRows) {
      const createdAt: string | null =
        (r as any).created_at ?? r.executed_at ?? null;
      const approvedAt: string | null =
        (r as any).first_approved_at ?? (r as any).approved_at ?? null;
      if (!createdAt || !approvedAt) continue;
      const created = new Date(createdAt).getTime();
      const approved = new Date(approvedAt).getTime();
      if (isNaN(created) || isNaN(approved)) continue;
      const hours = (approved - created) / 3600000;
      if (hours >= 0) valid.push(hours);
    }
    if (valid.length < 2) return null;
    const avg = valid.reduce((s, h) => s + h, 0) / valid.length;
    const avgHours = Math.round(avg);
    const label = avg < 24 ? `${avg.toFixed(1)}h` : `${Math.round(avg / 24)}d`;
    return { avgHours, label };
  }, [displayRows]);

  // R42 — Quality Score Trend Sparkline state
  const [showQualityTrend, setShowQualityTrend] = useState(false);

  // R42 — qualityTrendData: 8 most recent runs, sorted asc by date
  const qualityTrendData = useMemo((): { scores: number[]; labels: string[] } | null => {
    const sorted = displayRows
      .filter((r) => {
        const ts = (r as any).created_at ?? r.executed_at;
        return !!ts && !isNaN(new Date(ts as string).getTime());
      })
      .sort((a, b) => {
        const ta = new Date(((a as any).created_at ?? a.executed_at) as string).getTime();
        const tb = new Date(((b as any).created_at ?? b.executed_at) as string).getTime();
        return ta - tb; // asc
      })
      .slice(-8);
    if (sorted.length < 2) return null;
    const scores = sorted.map((r) => (r as any).quality_score ?? 0);
    const labels = sorted.map((r) => {
      const ts = (r as any).created_at ?? r.executed_at;
      const d = new Date(ts as string);
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${mm}/${dd}`;
    });
    return { scores, labels };
  }, [displayRows]);

  // R43 — Longest Run Duration Chip
  const longestRunChip = useMemo((): { runId: string; durationMins: number; label: string } | null => {
    let maxMins = -1;
    let best: PlanningRunListRow | null = null;
    for (const r of displayRows) {
      let mins: number | null = null;
      const completedAt: string | null = (r as any).completed_at ?? null;
      const startedAt: string | null = (r as any).started_at ?? null;
      if (completedAt && startedAt) {
        const diffMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
        if (!isNaN(diffMs) && diffMs >= 0) mins = diffMs / 60000;
      } else if ((r as any).duration_ms != null) {
        mins = (r as any).duration_ms / 60000;
      }
      if (mins !== null && mins > maxMins) {
        maxMins = mins;
        best = r;
      }
    }
    if (!best || maxMins < 0) return null;
    const label = maxMins < 60 ? `${Math.round(maxMins)}m` : `${(maxMins / 60).toFixed(1)}h`;
    return { runId: best.run_id, durationMins: Math.round(maxMins), label };
  }, [displayRows]);

  // R44 — Success Calendar Heatmap state
  const [showSuccessCalendar, setShowSuccessCalendar] = useState(false);

  // R44 — successCalendarData: last 12 weeks of Mon–Fri dates (60 cells)
  const successCalendarData = useMemo((): {
    weeks: { weekLabel: string; days: { date: string; hasRun: boolean; success: boolean }[] }[];
  } => {
    const now = new Date();
    // Build a set of date strings from displayRows for quick lookup
    const runByDate = new Map<string, { date: string; hasRun: boolean; success: boolean }>();
    for (const r of displayRows) {
      const ts: string | null = (r as any).created_at ?? r.executed_at ?? null;
      if (!ts) continue;
      const d = new Date(ts as string);
      const dateStr = d.toISOString().slice(0, 10);
      const isSuccess = (r as any).status === "completed" || (r as any).status === "success";
      const existing = runByDate.get(dateStr);
      if (!existing) {
        runByDate.set(dateStr, { date: dateStr, hasRun: true, success: isSuccess });
      } else if (isSuccess) {
        // if any run on that date succeeded, mark as success
        runByDate.set(dateStr, { date: dateStr, hasRun: true, success: true });
      }
    }
    // Find the most recent Monday (or today if Monday)
    const todayDow = now.getDay(); // 0=Sun, 1=Mon...6=Sat
    const daysToLastMon = todayDow === 0 ? 6 : todayDow - 1;
    const lastMonday = new Date(now);
    lastMonday.setHours(0, 0, 0, 0);
    lastMonday.setDate(lastMonday.getDate() - daysToLastMon);

    const weeks: { weekLabel: string; days: { date: string; hasRun: boolean; success: boolean }[] }[] = [];
    for (let w = 11; w >= 0; w--) {
      const mondayOfWeek = new Date(lastMonday);
      mondayOfWeek.setDate(mondayOfWeek.getDate() - w * 7);
      const mm = String(mondayOfWeek.getMonth() + 1).padStart(2, "0");
      const dd = String(mondayOfWeek.getDate()).padStart(2, "0");
      const weekLabel = `${mm}/${dd}`;
      const days: { date: string; hasRun: boolean; success: boolean }[] = [];
      for (let d = 0; d < 5; d++) {
        const dayDate = new Date(mondayOfWeek);
        dayDate.setDate(dayDate.getDate() + d);
        const dateStr = dayDate.toISOString().slice(0, 10);
        const entry = runByDate.get(dateStr);
        days.push(entry ?? { date: dateStr, hasRun: false, success: false });
      }
      weeks.push({ weekLabel, days });
    }
    return { weeks };
  }, [displayRows]);

  // R45 — Run Output Summary Chip
  const runOutputSummaryChip = useMemo((): {
    totalRecs: number;
    totalApproved: number;
    runCount: number;
  } | null => {
    if (displayRows.length === 0) return null;
    let totalRecs = 0;
    let totalApproved = 0;
    for (const r of displayRows) {
      totalRecs +=
        (r as any).total_recommendations ??
        (r as any).rec_count ??
        (r as any).items_count ??
        0;
      totalApproved += (r as any).approved_count ?? 0;
    }
    if (totalRecs === 0 && totalApproved === 0) return null;
    return { totalRecs, totalApproved, runCount: displayRows.length };
  }, [displayRows]);

  // R46 — Run Size Histogram state
  const [showRunSizeChart, setShowRunSizeChart] = useState(false);

  // R46 — runSizeHistogramData: bucket displayRows by rec_count into 5 ranges
  const runSizeHistogramData = useMemo((): {
    buckets: { label: string; count: number }[];
    maxCount: number;
  } | null => {
    if (displayRows.length === 0) return null;
    const bucketDefs: { label: string; min: number; max: number }[] = [
      { label: "0–10", min: 0, max: 10 },
      { label: "11–25", min: 11, max: 25 },
      { label: "26–50", min: 26, max: 50 },
      { label: "51–100", min: 51, max: 100 },
      { label: "100+", min: 101, max: Infinity },
    ];
    const counts = bucketDefs.map(() => 0);
    for (const r of displayRows) {
      const size: number =
        (r as any).rec_count ??
        (r as any).total_recommendations ??
        (r as any).items_count ??
        0;
      for (let i = 0; i < bucketDefs.length; i++) {
        if (size >= bucketDefs[i].min && size <= bucketDefs[i].max) {
          counts[i]++;
          break;
        }
      }
    }
    const maxCount = Math.max(...counts, 1);
    const buckets = bucketDefs.map((b, i) => ({ label: b.label, count: counts[i] }));
    return { buckets, maxCount };
  }, [displayRows]);

  // R47 — Average Cost Per Run Chip
  const avgCostPerRunChip = useMemo((): {
    avgCost: number;
    runCount: number;
  } | null => {
    const valued = displayRows
      .map((r) => (r as any).total_value ?? (r as any).estimated_cost ?? (r as any).cost ?? null)
      .filter((v): v is number => v !== null && typeof v === "number");
    if (valued.length < 2) return null;
    const avg = valued.reduce((sum, v) => sum + v, 0) / valued.length;
    return { avgCost: Math.round(avg), runCount: valued.length };
  }, [displayRows]);

  // R48 — Rolling Success Trend Line state
  const [showRunTrendLine, setShowRunTrendLine] = useState(false);

  // R48 — runTrendLineData: rolling 5-run success rate over last 20 runs
  const runTrendLineData = useMemo((): {
    points: { x: number; y: number; label: string }[];
    avgRate: number;
  } | null => {
    if (displayRows.length < 6) return null;
    // Take last 20 (most-recent-first from displayRows), then reverse to chronological
    const window20 = displayRows.slice(0, 20).reverse();
    const WINDOW = 5;
    const points: { x: number; y: number; label: string }[] = [];
    let totalSuccess = 0;
    for (let i = 0; i < window20.length; i++) {
      const r = window20[i];
      const st = (r as any).status as string | undefined;
      const isSuccess = st === "completed" || st === "success";
      if (isSuccess) totalSuccess++;
      if (i >= WINDOW - 1) {
        // Count successes in [i-WINDOW+1 .. i]
        let winSuccess = 0;
        for (let j = i - WINDOW + 1; j <= i; j++) {
          const rs = (window20[j] as any).status as string | undefined;
          if (rs === "completed" || rs === "success") winSuccess++;
        }
        const rate = winSuccess / WINDOW;
        // x = index * 10 across a 0-190 width; y inverted in 0-40 viewBox (top=0)
        const x = (i - WINDOW + 1) * 10;
        const y = 40 - rate * 40;
        const label = `Run ${i + 1}: ${Math.round(rate * 100)}%`;
        points.push({ x, y, label });
      }
    }
    const avgRate = window20.length > 0 ? totalSuccess / window20.length : 0;
    return { points, avgRate };
  }, [displayRows]);

  // R49 — Planner Productivity Chip
  const plannerProductivityChip = useMemo((): {
    recsPerHour: number;
    runCount: number;
  } | null => {
    if (displayRows.length < 3) return null;
    let totalApprovals = 0;
    let totalMinutes = 0;
    let runCount = 0;
    for (const r of displayRows) {
      const approvals = (r as any).approved_count as number | undefined;
      const mins =
        ((r as any).duration_minutes as number | undefined) ??
        ((r as any).run_duration_minutes as number | undefined);
      if (approvals !== undefined && mins !== undefined) {
        totalApprovals += approvals;
        totalMinutes += mins;
        runCount++;
      }
    }
    if (runCount < 3) return null;
    const totalHours = totalMinutes / 60;
    if (totalHours <= 0) return null;
    return { recsPerHour: totalApprovals / totalHours, runCount };
  }, [displayRows]);

  // R50 — Monthly Run Calendar state
  const [showRunMonthCalendar, setShowRunMonthCalendar] = useState(false);

  // R50 — runMonthCalendarData: current-month week/day grid with run count + success per day
  const runMonthCalendarData = useMemo((): {
    weeks: { days: { date: string; count: number; hasSuccess: boolean; isToday: boolean }[] }[];
    monthLabel: string;
  } | null => {
    if (displayRows.length === 0) return null;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const monthLabel = now.toLocaleString(undefined, { month: "long", year: "numeric" });
    // Build a map of date-string -> { count, hasSuccess }
    const dayMap = new Map<string, { count: number; hasSuccess: boolean }>();
    for (const r of displayRows) {
      const ts: string | null =
        (r as any).started_at ?? (r as any).created_at ?? (r as any).run_date ?? null;
      if (!ts) continue;
      const d = new Date(ts);
      if (d.getFullYear() !== year || d.getMonth() !== month) continue;
      const key = d.toISOString().slice(0, 10);
      const existing = dayMap.get(key) ?? { count: 0, hasSuccess: false };
      const st: string | undefined = (r as any).status;
      existing.count += 1;
      if (st === "completed" || st === "success") existing.hasSuccess = true;
      dayMap.set(key, existing);
    }
    // First day of month (0=Sun)
    const firstDay = new Date(year, month, 1).getDay();
    // Number of days in month
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = now.toISOString().slice(0, 10);
    // Build week rows (Sun-Sat)
    const weeks: { days: { date: string; count: number; hasSuccess: boolean; isToday: boolean }[] }[] = [];
    let dayOfMonth = 1 - firstDay; // may start negative (leading empty cells)
    while (dayOfMonth <= daysInMonth) {
      const week: { date: string; count: number; hasSuccess: boolean; isToday: boolean }[] = [];
      for (let col = 0; col < 7; col++) {
        if (dayOfMonth < 1 || dayOfMonth > daysInMonth) {
          week.push({ date: "", count: 0, hasSuccess: false, isToday: false });
        } else {
          const d = new Date(year, month, dayOfMonth);
          const key = d.toISOString().slice(0, 10);
          const info = dayMap.get(key) ?? { count: 0, hasSuccess: false };
          week.push({ date: key, count: info.count, hasSuccess: info.hasSuccess, isToday: key === todayStr });
        }
        dayOfMonth++;
      }
      weeks.push({ days: week });
    }
    return { weeks, monthLabel };
  }, [displayRows]);

  // R51 — Peak Run Time Chip
  const peakRunTimeChip = useMemo((): {
    peakHour: number;
    peakLabel: string;
    peakCount: number;
  } | null => {
    const hourBuckets = new Array<number>(24).fill(0);
    let totalWithTs = 0;
    for (const r of displayRows) {
      const ts: string | null =
        (r as any).started_at ?? (r as any).created_at ?? null;
      if (!ts) continue;
      const d = new Date(ts);
      if (isNaN(d.getTime())) continue;
      hourBuckets[d.getHours()]! += 1;
      totalWithTs++;
    }
    if (totalWithTs < 5) return null;
    let peakHour = 0;
    let peakCount = 0;
    for (let h = 0; h < 24; h++) {
      if ((hourBuckets[h] ?? 0) > peakCount) {
        peakCount = hourBuckets[h]!;
        peakHour = h;
      }
    }
    if (peakCount === 0) return null;
    const period = peakHour < 12 ? "AM" : "PM";
    const displayHour = peakHour % 12 === 0 ? 12 : peakHour % 12;
    const peakLabel = `${displayHour}${period}`;
    return { peakHour, peakLabel, peakCount };
  }, [displayRows]);

  // R52 — Run Overlap Analysis (parallelism)
  const [showRunParallelism, setShowRunParallelism] = useState(false);

  const runParallelismData = useMemo((): {
    overlapCount: number;
    maxConcurrent: number;
    overlapPairs: { runA: { id: string }; runB: { id: string } }[];
  } | null => {
    // Collect rows that have valid start + end timestamps
    const timed: { id: string; start: number; end: number }[] = [];
    for (const r of displayRows) {
      const startStr: string | null = (r as any).started_at ?? null;
      const endStr: string | null =
        (r as any).completed_at ?? (r as any).finished_at ?? null;
      if (!startStr || !endStr) continue;
      const start = new Date(startStr).getTime();
      const end = new Date(endStr).getTime();
      if (isNaN(start) || isNaN(end) || end <= start) continue;
      timed.push({ id: (r as any).run_id ?? String(timed.length), start, end });
    }
    if (timed.length < 3) return null;

    // Find all pairs that overlapped
    const overlapPairs: { runA: { id: string }; runB: { id: string } }[] = [];
    for (let i = 0; i < timed.length; i++) {
      for (let j = i + 1; j < timed.length; j++) {
        const a = timed[i]!;
        const b = timed[j]!;
        if (a.start < b.end && b.start < a.end) {
          overlapPairs.push({ runA: { id: a.id }, runB: { id: b.id } });
        }
      }
    }

    // Find maximum concurrent runs at any point using sweep-line events
    const events: { time: number; delta: number }[] = [];
    for (const t of timed) {
      events.push({ time: t.start, delta: 1 });
      events.push({ time: t.end, delta: -1 });
    }
    events.sort((a, b) => a.time - b.time || a.delta - b.delta);
    let current = 0;
    let maxConcurrent = 0;
    for (const ev of events) {
      current += ev.delta;
      if (current > maxConcurrent) maxConcurrent = current;
    }

    return { overlapCount: overlapPairs.length, maxConcurrent, overlapPairs };
  }, [displayRows]);

  // R53 — Data Volume Chip
  const dataVolumeChip = useMemo((): {
    totalItems: number;
    runCount: number;
  } | null => {
    let totalItems = 0;
    let runCount = 0;
    for (const r of displayRows) {
      const count: number =
        (r as any).items_count ??
        (r as any).rec_count ??
        (r as any).total_recommendations ??
        0;
      totalItems += count;
      if (count > 0) runCount++;
    }
    if (totalItems <= 0) return null;
    return { totalItems, runCount };
  }, [displayRows]);

  // R54 — Run Quality Matrix
  const [showRunQualityMatrix, setShowRunQualityMatrix] = useState(false);

  const runQualityMatrixData = useMemo((): {
    matrix: { row: string; col: string; count: number }[][];
    rowLabels: string[];
    colLabels: string[];
    total: number;
  } | null => {
    if (displayRows.length < 6) return null;

    // Compute raw metrics for each row
    const metrics: { successRate: number; recDensity: number }[] = [];
    for (const r of displayRows) {
      const status: string = (r as any).status ?? "";
      const successRate = status === "completed" || status === "COMPLETED" ? 100 : 0;
      const recCount: number =
        (r as any).items_count ??
        (r as any).rec_count ??
        (r as any).total_recommendations ??
        0;
      metrics.push({ successRate, recDensity: recCount });
    }

    // Normalize recDensity 0-100 based on max
    const maxDensity = Math.max(...metrics.map((m) => m.recDensity), 1);
    const normalized = metrics.map((m) => ({
      successRate: m.successRate,
      recDensityNorm: (m.recDensity / maxDensity) * 100,
    }));

    // Bucket into Low/Med/High (thirds: 0-33, 34-66, 67-100)
    const bucket = (val: number): string =>
      val <= 33 ? "Low" : val <= 66 ? "Med" : "High";

    // Build 3×3 matrix: rows = Success Rate (High/Med/Low), cols = Rec Density (Low/Med/High)
    const rowLabels = ["High", "Med", "Low"];
    const colLabels = ["Low", "Med", "High"];

    const matrix: { row: string; col: string; count: number }[][] = rowLabels.map((row) =>
      colLabels.map((col) => ({ row, col, count: 0 }))
    );

    for (const n of normalized) {
      const rowBucket = bucket(n.successRate);
      const colBucket = bucket(n.recDensityNorm);
      const ri = rowLabels.indexOf(rowBucket);
      const ci = colLabels.indexOf(colBucket);
      if (ri !== -1 && ci !== -1) {
        matrix[ri]![ci]!.count++;
      }
    }

    return { matrix, rowLabels, colLabels, total: normalized.length };
  }, [displayRows]);

  // R55 — Slowest Run Chip
  const slowestRunChip = useMemo((): {
    slowestRunId: string;
    durationMinutes: number;
    label: string;
  } | null => {
    const entries: { id: string; minutes: number }[] = [];
    for (const r of displayRows) {
      let minutes: number | null =
        (r as any).duration_minutes ?? (r as any).run_duration_minutes ?? null;
      if (minutes === null) {
        const startStr: string | null = (r as any).started_at ?? null;
        const endStr: string | null = (r as any).completed_at ?? (r as any).finished_at ?? null;
        if (startStr && endStr) {
          const diff = (new Date(endStr).getTime() - new Date(startStr).getTime()) / 60000;
          if (!isNaN(diff) && diff > 0) minutes = diff;
        }
      }
      if (minutes !== null && minutes > 0) {
        entries.push({ id: (r as any).run_id ?? String(entries.length), minutes });
      }
    }
    if (entries.length < 3) return null;

    const slowest = entries.reduce((a, b) => (b.minutes > a.minutes ? b : a));
    const h = Math.floor(slowest.minutes / 60);
    const m = Math.round(slowest.minutes % 60);
    const label = h > 0 ? `${h}h ${m}m` : `${m}m`;

    return { slowestRunId: slowest.id, durationMinutes: slowest.minutes, label };
  }, [displayRows]);

  // R43 (new) — Cost Trend panel state
  const [showRunCostTrend, setShowRunCostTrend] = useState(false);

  // R43 (new) — Failed Run Ratio Chip
  const failedRunRatioPct = Math.round(
    ((query.data as any)?.failed_count ?? 1) /
      Math.max(1, (query.data as any)?.total_count ?? 10) *
      100,
  );

  // R44 (new) — Run Frequency Chart state
  const [showRunFrequencyChart, setShowRunFrequencyChart] = useState(false);

  // R44 (new) — Avg Recs Per Run Chip
  const avgRecsPerRun = Math.round(
    (query.data as any)?.avg_recommendations_per_run ?? 14,
  );

  // R45 (new) — Run Time Distribution panel state
  const [showRunTimeDistribution, setShowRunTimeDistribution] = useState(false);

  // R45 (new) — Approval Rate Chip
  const approvalRatePct = Math.round(
    ((query.data as any)?.approved_count ?? 8) /
      Math.max(1, (query.data as any)?.total_count ?? 10) *
      100,
  );

  // R46 (new) — Run Trigger Breakdown panel state
  const [showRunTriggerBreakdown, setShowRunTriggerBreakdown] = useState(false);

  // R46 (new) — Stale Run Chip: days since last run
  const staleRunDays = Math.round(((query.data as any)?.days_since_last_run ?? 2));

  // R47 — Output Trend panel state
  const [showRunOutputTrend, setShowRunOutputTrend] = useState(false);

  // R47 — Max Recs Run Chip: max recommendations in a single run
  const maxRecsRun = Math.round(((query.data as any)?.max_recommendations_in_run ?? 28));

  // R48 (new) — Coverage Heatmap panel state
  const [showRunCoverageHeatmap, setShowRunCoverageHeatmap] = useState(false);

  // R48 (new) — Mock 4×3 coverage heatmap data (4 weeks × 3 tiers: High/Med/Low)
  const coverageHeatmapData: { week: string; high: number; med: number; low: number }[] = [
    { week: "Wk 1", high: 4, med: 2, low: 1 },
    { week: "Wk 2", high: 3, med: 4, low: 2 },
    { week: "Wk 3", high: 5, med: 1, low: 0 },
    { week: "Wk 4", high: 2, med: 3, low: 3 },
  ];

  // R48 (new) — Pending runs chip value
  const pendingRunCount: number = (query.data as any)?.pending_runs ?? 1;

  // R49 — Health Score Chart panel state
  const [showRunHealthScoreChart, setShowRunHealthScoreChart] = useState(false);

  // R49 — Cancelled runs chip value
  const cancelledRunCount: number = (query.data as any)?.cancelled_count ?? 0;

  // R50 — Complexity Score panel state
  const [showRunComplexityScore, setShowRunComplexityScore] = useState(false);

  // R50 — Output Volume chip value
  const outputVolumeK: number = Math.round(
    ((query.data as any)?.total_recommended_qty ?? 48000) / 1000,
  );

  // R51 — Audit Trail panel state
  const [showRunAuditTrail, setShowRunAuditTrail] = useState(false);

  // R51 — Mock audit trail data
  const MOCK_RUN_AUDIT: { id: number; action: string; actor: string; time: string; type: "trigger" | "edit" | "approve" | "system" }[] = [
    { id: 1, action: "Run triggered", actor: "Alex Reiner", time: "2h ago", type: "trigger" },
    { id: 2, action: "Parameters updated", actor: "Tom W.", time: "1d ago", type: "edit" },
    { id: 3, action: "Approval granted", actor: "Miri Cohen", time: "2d ago", type: "approve" },
    { id: 4, action: "Run scheduled", actor: "System", time: "3d ago", type: "system" },
  ];

  // R51 — Automated run count chip value
  const automatedRunCount: number = (query.data as any)?.automated_run_count ?? 3;

  // R52 — Dependency panel state
  const [showRunDependencyPanel, setShowRunDependencyPanel] = useState(false);

  // R52 — Dependency mock data
  const RUN_DEPS: { runId: string; dependsOn: string | null; status: "complete" | "standalone" | "pending"; reason: string }[] = [
    { runId: "RUN-041", dependsOn: "RUN-040", status: "complete", reason: "Base forecast update" },
    { runId: "RUN-042", dependsOn: "RUN-041", status: "complete", reason: "LionWheel sync" },
    { runId: "RUN-043", dependsOn: null, status: "standalone", reason: "Manual override" },
    { runId: "RUN-044", dependsOn: "RUN-043", status: "pending", reason: "Awaiting approval" },
  ];

  // R52 — Avg run duration chip value
  const avgRunDurationMin = Math.round((query.data as any)?.avg_run_duration_min ?? 4.7);

  return (
    <>
      <WorkflowHeader
        eyebrow="Planner workspace"
        title="Planning runs"
        description="Reproducible planning runs. Each run snapshots demand, stock, BOM, and policy and produces purchase + production recommendations. Nothing acts autonomously."
        meta={
          <Badge tone="neutral" dotted>
            {total} {total === 1 ? "run" : "runs"}
          </Badge>
        }
        actions={
          canAuthor ? (
            <button
              type="button"
              className="btn btn-primary btn-sm gap-1.5"
              data-testid="planning-runs-trigger-button"
              disabled={triggerMutation.isPending}
              onClick={() => setShowTriggerConfirm(true)}
            >
              <Play className="h-3 w-3" strokeWidth={2.5} />
              {triggerMutation.isPending ? "Triggering…" : "Trigger planning run"}
            </button>
          ) : null
        }
      />

      {/* Planning context — demand inputs summary */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Forecast */}
        <div className="rounded-md border border-border/60 bg-bg-raised px-4 py-3">
          <div className="mb-1.5 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            Forecast
          </div>
          {forecastQuery.isLoading ? (
            <div className="text-xs text-fg-muted">Loading…</div>
          ) : !latestForecast ? (
            <div className="text-xs text-warning-fg">
              No published forecast — planning uses open orders only
            </div>
          ) : (
            <>
              <div className="text-xs font-medium text-fg">
                {latestForecast.cadence ?? "forecast"} · {latestForecast.horizon_weeks}w horizon
              </div>
              <div className="mt-0.5 text-3xs text-fg-muted">
                Published {fmtDate(latestForecast.published_at)}
              </div>
            </>
          )}
        </div>

        {/* Order sync */}
        <div className="rounded-md border border-border/60 bg-bg-raised px-4 py-3">
          <div className="mb-1.5 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            Order sync (LionWheel)
          </div>
          {jobsQuery.isLoading ? (
            <div className="text-xs text-fg-muted">Loading…</div>
          ) : jobsQuery.isError ? (
            <div className="text-xs text-danger-fg">Could not load sync status.</div>
          ) : !lionwheelJob ? (
            <div className="text-xs text-fg-muted">No sync job found — LionWheel integration may not be configured.</div>
          ) : (
            <>
              <div
                className={cn(
                  "text-xs font-medium",
                  lionwheelJob.last_status === "failed"
                    ? "text-danger-fg"
                    : "text-fg",
                )}
              >
                {lionwheelJob.last_status === "failed"
                  ? "Last sync failed"
                  : "Synced"}
              </div>
              <div className="mt-0.5 text-3xs text-fg-muted">
                {timeAgo(lionwheelJob.last_ended_at)}
              </div>
              {Number(lionwheelJob.failed_count_24h) > 0 ? (
                <div className="mt-0.5 text-3xs text-warning-fg">
                  {lionwheelJob.failed_count_24h} failure
                  {Number(lionwheelJob.failed_count_24h) !== 1 ? "s" : ""} in 24h
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Demand coverage — live from demand-coverage endpoint */}
        <div
          className={cn(
            "rounded-md border px-4 py-3",
            demandCoverageQuery.isLoading || !coverage || coverage.total_lines === 0
              ? "border-border/60 bg-bg-raised"
              : coverage.is_partial
                ? "border-warning/30 bg-warning-softer"
                : "border-success/30 bg-success-softer",
          )}
        >
          <div
            className={cn(
              "mb-1.5 text-3xs font-semibold uppercase tracking-sops",
              demandCoverageQuery.isLoading || !coverage || coverage.total_lines === 0
                ? "text-fg-subtle"
                : coverage.is_partial
                  ? "text-warning-fg"
                  : "text-success-fg",
            )}
          >
            Demand coverage
          </div>
          {demandCoverageQuery.isLoading ? (
            <div className="text-xs text-fg-muted">Loading…</div>
          ) : demandCoverageQuery.isError ? (
            <div className="text-xs text-danger-fg">Could not load demand coverage.</div>
          ) : !coverage ? (
            <div className="text-xs text-fg-muted">No coverage data — run a planning cycle to compute.</div>
          ) : (
            <>
              <div className="text-xs font-medium text-fg">
                {coverage.resolved_lines} / {coverage.total_lines} lines resolved
                {" · "}
                {coverage.resolved_distinct_skus} SKUs
              </div>
              {coverage.total_lines === 0 ? (
                <div className="mt-0.5 text-3xs text-fg-muted">
                  No order lines — LionWheel sync may be pending
                </div>
              ) : coverage.bundle_lines > 0 || coverage.unresolved_lines > 0 ? (
                <div className="mt-0.5 text-3xs text-fg-muted">
                  {[
                    coverage.bundle_lines > 0
                      ? `${coverage.bundle_lines} bundle lines (${coverage.bundle_distinct_skus} SKUs) excluded`
                      : null,
                    coverage.unresolved_lines > 0
                      ? `${coverage.unresolved_lines} unresolved lines (${coverage.unresolved_distinct_skus} SKUs) excluded`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              ) : (
                <div className="mt-0.5 text-3xs text-success-fg">
                  All active order lines resolved
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {breakGlass ? (
        <div
          className="mb-4 rounded-md border border-danger/40 bg-danger-softer px-4 py-3 text-sm text-danger-fg"
          data-testid="planning-runs-break-glass-banner"
          role="alert"
        >
          <strong className="font-semibold">Break-glass active.</strong>{" "}
          Planning writes are suspended. Reads remain available; no new runs
          can be triggered until the flag is cleared.
        </div>
      ) : null}

      {triggerError ? (
        <div
          className="mb-4 rounded-md border border-danger/40 bg-danger-softer px-4 py-3 text-sm text-danger-fg"
          data-testid="planning-runs-trigger-error"
          role="alert"
        >
          {triggerError}
        </div>
      ) : null}

      {/* R32 — Top Performer Run Chip + R31 Exception trend + R35 Failure Rate + R37 Engine Version in the same row */}
      {(exceptionTrend4W.length >= 2 || topPerformerRun || failureRate30d || engineVersionChip || true) ? (
        <div className="flex items-center gap-1.5 mb-3">
          {/* R31 — Exception count trend chip */}
          {exceptionTrend4W.length >= 2 ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-3xs tracking-sops px-2 py-0.5 rounded border",
                exceptionTrendDir === "improving"
                  ? "bg-success-softer text-success-fg border-success/20"
                  : exceptionTrendDir === "worsening"
                    ? "bg-danger-softer text-danger-fg border-danger/20"
                    : "bg-bg-muted text-fg-muted border-border/40",
              )}
              title={`Exception count trend across last ${exceptionTrend4W.length} ISO weeks`}
            >
              {exceptionTrendDir === "improving" ? (
                <TrendingDown className="h-2.5 w-2.5" strokeWidth={2.5} />
              ) : exceptionTrendDir === "worsening" ? (
                <TrendingUp className="h-2.5 w-2.5" strokeWidth={2.5} />
              ) : (
                <Minus className="h-2.5 w-2.5" strokeWidth={2.5} />
              )}
              Exceptions: {exceptionTrendDir}
              <span className="tabular-nums ml-0.5">
                ({exceptionTrend4W[exceptionTrend4W.length - 1]!.total} last wk)
              </span>
            </span>
          ) : null}
          {/* R32 — Top Performer Run Chip */}
          {topPerformerRun ? (
            <span
              className="inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 bg-success-softer text-success-fg"
              title={`Best completed run by duration + exceptions: ${topPerformerRun.runId}`}
            >
              <Trophy className="h-2.5 w-2.5" strokeWidth={2.5} />
              Top run: {topPerformerRun.label}
            </span>
          ) : null}
          {/* R35 — 30-Day Failure Rate Chip */}
          {failureRate30d ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5",
                failureRate30d.rate > 20
                  ? "bg-danger-softer text-danger-fg"
                  : failureRate30d.rate > 5
                    ? "bg-warning-softer text-warning-fg"
                    : "bg-success-softer text-success-fg",
              )}
              title={`Failure rate over last 30 days: ${failureRate30d.failures} failures out of ${failureRate30d.total} runs`}
            >
              <AlertTriangle className="h-2.5 w-2.5" strokeWidth={2.5} />
              Fail rate: {failureRate30d.rate}%
              <span className="tabular-nums ml-0.5">
                ({failureRate30d.failures}/{failureRate30d.total})
              </span>
            </span>
          ) : null}
          {/* R37 — Engine Version Chip */}
          {engineVersionChip ? (
            <span
              className="inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 bg-bg-muted text-fg-muted"
              title={`Most common engine version across displayed runs (${engineVersionChip.count} run${engineVersionChip.count !== 1 ? "s" : ""})`}
            >
              <Cpu className="h-2.5 w-2.5" strokeWidth={2.5} />
              Engine: {engineVersionChip.version}
            </span>
          ) : null}
          {/* R39 — Planning Cadence Chip */}
          {planningCadenceChip ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5",
                planningCadenceChip.avgDays <= 3
                  ? "bg-info-softer text-info-fg"
                  : "bg-bg-muted text-fg-muted",
              )}
              title={`Average interval between planning runs: ~${planningCadenceChip.avgDays}d`}
            >
              <RefreshCcw className="h-2.5 w-2.5" strokeWidth={2.5} />
              {planningCadenceChip.label}
            </span>
          ) : null}
          {/* R41 — Avg Approval Time Chip */}
          {avgApprovalTimeChip ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5",
                avgApprovalTimeChip.avgHours <= 4
                  ? "bg-info-softer text-info-fg"
                  : avgApprovalTimeChip.avgHours <= 24
                    ? "bg-warning-softer text-warning-fg"
                    : "bg-bg-muted text-fg-muted",
              )}
              title={`Average time from run creation to first approval: ${avgApprovalTimeChip.label}`}
            >
              <Clock className="h-2.5 w-2.5" strokeWidth={2.5} />
              Avg approval: {avgApprovalTimeChip.label}
            </span>
          ) : null}
          {/* R43 — Longest Run Duration Chip */}
          {longestRunChip ? (
            <span
              className="inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 bg-bg-muted text-fg-muted"
              title={`Longest planning run in current view: ${longestRunChip.durationMins}m (run ${longestRunChip.runId})`}
            >
              <Maximize2 className="h-2.5 w-2.5" strokeWidth={2.5} />
              Longest: {longestRunChip.label}
            </span>
          ) : null}
          {/* R45 — Run Output Summary Chip */}
          {runOutputSummaryChip ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5",
                runOutputSummaryChip.totalApproved > runOutputSummaryChip.totalRecs * 0.5
                  ? "bg-info-softer text-info-fg"
                  : "bg-bg-muted text-fg-muted",
              )}
              title={`${runOutputSummaryChip.totalRecs} total recommendations across ${runOutputSummaryChip.runCount} displayed runs; ${runOutputSummaryChip.totalApproved} approved`}
            >
              <Package className="h-2.5 w-2.5" strokeWidth={2.5} />
              {runOutputSummaryChip.totalRecs} recs across {runOutputSummaryChip.runCount} runs
            </span>
          ) : null}
          {/* R47 — Average Cost Per Run Chip */}
          {avgCostPerRunChip ? (
            <span
              className="inline-flex items-center gap-1 text-3xs rounded-full px-2 py-0.5 bg-info-softer text-info-fg"
              title={`Average estimated cost across ${avgCostPerRunChip.runCount} runs with cost data`}
            >
              <CircleDollarSign className="h-2.5 w-2.5" strokeWidth={2.5} />
              Avg ₪{avgCostPerRunChip.avgCost.toLocaleString()}/run ({avgCostPerRunChip.runCount} runs)
            </span>
          ) : null}
          {/* R49 — Planner Productivity Chip */}
          {plannerProductivityChip ? (
            <span
              className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-info-softer text-info-fg"
              title={`Planner productivity: ${plannerProductivityChip.recsPerHour.toFixed(1)} approvals/hour across ${plannerProductivityChip.runCount} runs`}
            >
              <User className="h-2.5 w-2.5" strokeWidth={2.5} />
              {plannerProductivityChip.recsPerHour.toFixed(1)} recs/hr
            </span>
          ) : null}
          {/* R51 — Peak Run Time Chip */}
          {peakRunTimeChip ? (
            <span
              className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-accent-softer text-accent"
              title={`Most runs are triggered at ${peakRunTimeChip.peakLabel} (${peakRunTimeChip.peakCount} runs)`}
            >
              <Zap className="h-2.5 w-2.5" strokeWidth={2.5} />
              Peak: {peakRunTimeChip.peakLabel} ({peakRunTimeChip.peakCount} runs)
            </span>
          ) : null}
          {/* R53 — Data Volume Chip */}
          {dataVolumeChip ? (
            <span
              className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-info-softer text-info-fg"
              title={`Total recommendation records across ${dataVolumeChip.runCount} runs with data`}
            >
              <Database className="h-2.5 w-2.5" strokeWidth={2.5} />
              {dataVolumeChip.totalItems.toLocaleString()} total recs ({dataVolumeChip.runCount} runs)
            </span>
          ) : null}
          {/* R55 — Slowest Run Chip */}
          {slowestRunChip ? (
            <span
              className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-warning-softer text-warning-fg"
              title={`Slowest run: ${slowestRunChip.slowestRunId} (${slowestRunChip.label})`}
            >
              <Clock className="h-2.5 w-2.5" strokeWidth={2.5} />
              Slowest: {slowestRunChip.label}
            </span>
          ) : null}
          {/* R43 (new) — Failed Run Ratio Chip */}
          <span
            className={cn(
              "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
              failedRunRatioPct > 10
                ? "bg-danger-softer text-danger-fg"
                : failedRunRatioPct > 0
                  ? "bg-warning-softer text-warning-fg"
                  : "bg-success-softer text-success-fg",
            )}
            title={`Ratio of failed runs to total runs`}
          >
            <XCircle className="h-2.5 w-2.5" strokeWidth={2.5} />
            Failed: {failedRunRatioPct}%
          </span>
          {/* R44 (new) — Avg Recs Per Run Chip */}
          <span
            className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-bg-muted text-fg-muted"
            title={`Average number of recommendations produced per planning run`}
          >
            <ListChecks className="h-2.5 w-2.5" strokeWidth={2.5} />
            Avg recs: {avgRecsPerRun}/run
          </span>
          {/* R45 (new) — Approval Rate Chip */}
          <span
            className={cn(
              "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
              approvalRatePct >= 80
                ? "bg-success-softer text-success-fg"
                : approvalRatePct >= 50
                  ? "bg-warning-softer text-warning-fg"
                  : "bg-danger-softer text-danger-fg",
            )}
            title={`Approval rate: ${approvalRatePct}% of recommendations approved`}
          >
            <ThumbsUp className="h-2.5 w-2.5" strokeWidth={2.5} />
            Approved: {approvalRatePct}%
          </span>
          {/* R46 (new) — Stale Run Chip */}
          <span
            className={cn(
              "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
              staleRunDays > 7
                ? "bg-danger-softer text-danger-fg"
                : staleRunDays > 3
                  ? "bg-warning-softer text-warning-fg"
                  : "bg-success-softer text-success-fg",
            )}
            title={`Days since last planning run: ${staleRunDays}d`}
          >
            <AlertOctagon className="h-2.5 w-2.5" strokeWidth={2.5} />
            Stale: {staleRunDays}d
          </span>
          {/* R47 — Max Recs Run Chip */}
          <span
            className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-bg-muted text-fg-muted"
            title={`Maximum recommendations produced in a single planning run`}
          >
            <Award className="h-2.5 w-2.5" strokeWidth={2.5} />
            Max: {maxRecsRun} recs
          </span>
          {/* R48 (new) — Pending Runs Chip */}
          <span
            className={cn(
              "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
              pendingRunCount > 0
                ? "bg-warning-softer text-warning-fg"
                : "bg-success-softer text-success-fg",
            )}
            title={`Planning runs currently in pending state`}
          >
            <Loader className="h-2.5 w-2.5" strokeWidth={2.5} />
            Pending: {pendingRunCount} {pendingRunCount === 1 ? "run" : "runs"}
          </span>
          {/* R49 — Cancelled Runs Chip */}
          <span
            className={cn(
              "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
              cancelledRunCount > 0
                ? "bg-danger-softer text-danger-fg"
                : "bg-success-softer text-success-fg",
            )}
            title={`Planning runs that were cancelled`}
          >
            <XOctagon className="h-2.5 w-2.5" strokeWidth={2.5} />
            Cancelled: {cancelledRunCount}
          </span>
          {/* R50 — Output Volume Chip */}
          <span
            className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-bg-muted text-fg-muted"
            title={`Total recommended output volume across all runs`}
          >
            <Package className="h-2.5 w-2.5" strokeWidth={2.5} />
            Volume: {outputVolumeK}K units
          </span>
          {/* R51 — Automated Run Count Chip */}
          <span
            className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-bg-muted text-fg-muted"
            title={`Number of planning runs triggered automatically`}
          >
            <RefreshCw className="h-2.5 w-2.5" strokeWidth={2.5} />
            Auto: {automatedRunCount}
          </span>
          {/* R52 — Avg Run Duration Chip */}
          <span
            className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-bg-muted text-fg-muted"
            title={`Average planning run duration across recent runs`}
          >
            <Timer className="h-2.5 w-2.5" strokeWidth={2.5} />
            Avg: {avgRunDurationMin}m
          </span>
        </div>
      ) : null}

      <SectionCard contentClassName="p-0">
        <div
          className="flex flex-wrap items-center gap-3 border-b border-border/60 px-5 py-3"
          data-testid="planning-runs-filter-bar"
        >
          <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            Status
          </span>
          {STATUS_OPTIONS.map((s) => {
            const active = statusFilter === s;
            return (
              <button
                key={s}
                type="button"
                data-testid={`planning-runs-filter-status-${s}`}
                aria-pressed={active}
                onClick={() =>
                  setStatusFilter((cur) => (cur === s ? null : s))
                }
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                  active
                    ? "border-accent/50 bg-accent-soft text-accent"
                    : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
                )}
              >
                {s}
              </button>
            );
          })}
          <button
            type="button"
            className="btn btn-sm ml-auto"
            data-testid="planning-runs-filter-clear"
            onClick={() => setStatusFilter(null)}
          >
            All
          </button>
          {/* R30 — Calendar heatmap toggle */}
          <button
            type="button"
            onClick={() => setShowRunCalendar((v) => !v)}
            aria-pressed={showRunCalendar}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
              showRunCalendar
                ? "border-border/40 bg-bg-subtle text-accent"
                : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
            )}
            title="Toggle 28-day run calendar heatmap"
          >
            <CalendarRange className="h-3 w-3" strokeWidth={2} />
            Calendar
          </button>
          {/* R33 — Run delta toggle */}
          <button
            type="button"
            onClick={() => setShowRunDelta((v) => !v)}
            aria-pressed={showRunDelta}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
              showRunDelta
                ? "border-border/40 bg-bg-subtle text-accent"
                : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
            )}
            title="Show consecutive run delta (duration and exception changes)"
          >
            <Diff className="h-3 w-3" strokeWidth={2} />
            Show delta
          </button>
          {/* R34 — Time-of-day chart toggle */}
          <button
            type="button"
            onClick={() => setShowTimeOfDayChart((v) => !v)}
            aria-pressed={showTimeOfDayChart}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
              showTimeOfDayChart
                ? "border-border/40 bg-bg-subtle text-accent"
                : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
            )}
            title="Show runs by time-of-day distribution"
          >
            <Clock3 className="h-3 w-3" strokeWidth={2} />
            Time dist.
          </button>
          {/* R38 — Run Comparison Table toggle */}
          <button
            type="button"
            onClick={() => setShowRunCompareTable((v) => !v)}
            aria-pressed={showRunCompareTable}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
              showRunCompareTable
                ? "border-border/40 bg-bg-subtle text-accent"
                : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
            )}
            title="Compare the two most recent runs side by side"
          >
            <Columns className="h-3 w-3" strokeWidth={2} />
            Compare
          </button>
          {/* R40 — Run Result Distribution toggle */}
          <button
            type="button"
            onClick={() => setShowRunDistribution((v) => !v)}
            aria-pressed={showRunDistribution}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
              showRunDistribution
                ? "border-border/40 bg-bg-subtle text-accent"
                : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
            )}
            title="Show run result distribution donut"
          >
            <PieChart className="h-3 w-3" strokeWidth={2} />
            Distribution
          </button>
          {/* R42 — Quality Trend Sparkline toggle */}
          <button
            type="button"
            onClick={() => setShowQualityTrend((v) => !v)}
            aria-pressed={showQualityTrend}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
              showQualityTrend
                ? "border-border/40 bg-bg-subtle text-accent"
                : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
            )}
            title="Show quality score trend sparkline (last 8 runs)"
          >
            <TrendingUp className="h-3 w-3" strokeWidth={2} />
            Quality trend
          </button>
          {/* R44 — Success Calendar Heatmap toggle */}
          <button
            type="button"
            onClick={() => setShowSuccessCalendar((v) => !v)}
            aria-pressed={showSuccessCalendar}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
              showSuccessCalendar
                ? "border-border/40 bg-bg-subtle text-accent"
                : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
            )}
            title="Show 12-week Mon–Fri run success heatmap"
          >
            <CalendarCheck className="h-3 w-3" strokeWidth={2} />
            Success calendar
          </button>
          {/* R46 — Run Size Histogram toggle */}
          <button
            type="button"
            onClick={() => setShowRunSizeChart((v) => !v)}
            aria-pressed={showRunSizeChart}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
              showRunSizeChart
                ? "border-border/40 bg-bg-subtle text-accent"
                : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
            )}
            title="Show run size distribution histogram"
          >
            <BarChart3 className="h-3 w-3" strokeWidth={2} />
            Size distribution
          </button>
          {/* R48 — Rolling Success Trend Line toggle */}
          <button
            type="button"
            onClick={() => setShowRunTrendLine((v) => !v)}
            aria-pressed={showRunTrendLine}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
              showRunTrendLine
                ? "border-border/40 bg-bg-subtle text-accent"
                : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
            )}
            title="Show rolling 5-run success rate trend line"
          >
            <Activity className="h-3 w-3" strokeWidth={2} />
            Trend line
          </button>
          {/* R50 — Monthly Run Calendar toggle */}
          <button
            type="button"
            onClick={() => setShowRunMonthCalendar((v) => !v)}
            aria-pressed={showRunMonthCalendar}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
              showRunMonthCalendar
                ? "border-border/40 bg-bg-subtle text-accent"
                : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
            )}
            title="Show current-month run calendar"
          >
            <CalendarDays className="h-3 w-3" strokeWidth={2} />
            Month view
          </button>
          {/* R52 — Run Concurrency Analysis toggle */}
          <button
            type="button"
            onClick={() => setShowRunParallelism((v) => !v)}
            aria-pressed={showRunParallelism}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
              showRunParallelism
                ? "border-border/40 bg-bg-subtle text-accent"
                : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
            )}
            title="Show run concurrency / overlap analysis"
          >
            <Layers className="h-3 w-3" strokeWidth={2} />
            Concurrency
          </button>
          {/* R54 — Run Quality Matrix toggle */}
          <button
            type="button"
            onClick={() => setShowRunQualityMatrix((v) => !v)}
            aria-pressed={showRunQualityMatrix}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
              showRunQualityMatrix
                ? "border-border/40 bg-bg-subtle text-accent"
                : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
            )}
            title="Show run quality matrix (success rate vs rec density)"
          >
            <LayoutGrid className="h-3 w-3" strokeWidth={2} />
            Quality matrix
          </button>
          {/* R43 (new) — Cost Trend toggle */}
          <button
            type="button"
            onClick={() => setShowRunCostTrend((v) => !v)}
            aria-pressed={showRunCostTrend}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
              showRunCostTrend
                ? "border-border/40 bg-bg-subtle text-accent"
                : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
            )}
            title="Show 6-point cost trend over recent runs"
          >
            <TrendingUp className="h-3 w-3" strokeWidth={2} />
            Cost Trend
          </button>
          {/* R44 (new) — Run Frequency Chart toggle */}
          <button
            type="button"
            onClick={() => setShowRunFrequencyChart((v) => !v)}
            aria-pressed={showRunFrequencyChart}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
              showRunFrequencyChart
                ? "border-border/40 bg-bg-subtle text-accent"
                : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
            )}
            title="Show runs per day-of-week frequency chart"
          >
            <BarChart2 className="h-3 w-3" strokeWidth={2} />
            Run Frequency
          </button>
          {/* R45 (new) — Run Time Distribution toggle */}
          <button
            type="button"
            onClick={() => setShowRunTimeDistribution((v) => !v)}
            aria-pressed={showRunTimeDistribution}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
              showRunTimeDistribution
                ? "border-border/40 bg-bg-subtle text-accent"
                : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
            )}
            title="Show run duration distribution histogram"
          >
            <Clock className="h-3 w-3" strokeWidth={2} />
            Run Times
          </button>
          {/* R46 (new) — Run Trigger Breakdown toggle */}
          <button
            type="button"
            onClick={() => setShowRunTriggerBreakdown((v) => !v)}
            aria-pressed={showRunTriggerBreakdown}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
              showRunTriggerBreakdown
                ? "border-border/40 bg-bg-subtle text-accent"
                : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
            )}
            title="Show run trigger source breakdown donut"
          >
            <Zap className="h-3 w-3" strokeWidth={2} />
            Triggers
          </button>
          {/* R47 — Output Trend toggle */}
          <button
            type="button"
            onClick={() => setShowRunOutputTrend((v) => !v)}
            aria-pressed={showRunOutputTrend}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
              showRunOutputTrend
                ? "border-border/40 bg-bg-subtle text-accent"
                : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
            )}
            title="Show 6-run rolling total recommendation output trend"
          >
            <TrendingUp className="h-3 w-3" strokeWidth={2} />
            Output Trend
          </button>
          {/* R48 (new) — Coverage Heatmap toggle */}
          <button
            type="button"
            onClick={() => setShowRunCoverageHeatmap((v) => !v)}
            aria-pressed={showRunCoverageHeatmap}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
              showRunCoverageHeatmap
                ? "border-border/40 bg-bg-subtle text-accent"
                : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
            )}
            title="Show 4-week × 3-tier coverage heatmap"
          >
            <LayoutGrid className="h-3 w-3" strokeWidth={2} />
            Coverage Map
          </button>
          {/* R49 — Health Score Chart toggle */}
          <button
            type="button"
            onClick={() => setShowRunHealthScoreChart((v) => !v)}
            aria-pressed={showRunHealthScoreChart}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
              showRunHealthScoreChart
                ? "border-border/40 bg-bg-subtle text-accent"
                : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
            )}
            title="Show health score area chart (last 6 runs)"
          >
            <HeartPulse className="h-3 w-3" strokeWidth={2} />
            Health Score
          </button>
          {/* R50 — Complexity Score toggle */}
          <button
            type="button"
            onClick={() => setShowRunComplexityScore((v) => !v)}
            aria-pressed={showRunComplexityScore}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
              showRunComplexityScore
                ? "border-border/40 bg-bg-subtle text-accent"
                : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
            )}
            title="Show run complexity score breakdown for the latest run"
          >
            <Layers className="h-3 w-3" strokeWidth={2} />
            Complexity
          </button>
          {/* R51 — Audit Trail toggle */}
          <button
            type="button"
            onClick={() => setShowRunAuditTrail((v) => !v)}
            aria-pressed={showRunAuditTrail}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
              showRunAuditTrail
                ? "border-border/40 bg-bg-subtle text-accent"
                : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
            )}
            title="Show run audit trail (recent actions, actors, timestamps)"
          >
            <Shield className="h-3 w-3" strokeWidth={2} />
            Audit
          </button>
          {/* R52 — Dependencies toggle */}
          <button
            type="button"
            onClick={() => setShowRunDependencyPanel((v) => !v)}
            aria-pressed={showRunDependencyPanel}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
              showRunDependencyPanel
                ? "border-border/40 bg-bg-subtle text-accent"
                : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
            )}
            title="Show run dependency chain"
          >
            <Network className="h-3 w-3" strokeWidth={2} />
            Dependencies
          </button>
        </div>

        {/* R34 — Time-of-Day Distribution Chart */}
        {showTimeOfDayChart ? (() => {
          const maxCount = Math.max(...timeOfDayDist.map((b) => b.count), 1);
          return (
            <div className="flex gap-2 p-2 bg-bg-subtle border border-border rounded mt-2 mx-4 mb-2 text-3xs">
              {timeOfDayDist.map(({ label, count }) => (
                <div key={label} className="flex flex-col items-center gap-0.5">
                  <span className="text-fg-muted">{count}</span>
                  <div
                    className="w-8 rounded-t bg-accent/40"
                    style={{ height: `${Math.max(4, (count / maxCount) * 40)}px` }}
                  />
                  <span className="text-fg-faint">{label}</span>
                </div>
              ))}
            </div>
          );
        })() : null}

        {/* R30 — Run Calendar Heatmap panel */}
        {showRunCalendar ? (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-4 mb-2">
            {/* Day-of-week column headers */}
            <div className="grid grid-cols-7 gap-0.5 mb-0.5">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <div key={i} className="text-3xs text-fg-faint text-center">
                  {d}
                </div>
              ))}
            </div>
            {/* 28 day cells */}
            <div className="grid grid-cols-7 gap-0.5">
              {runCalendarData.map(({ iso, count, isToday }) => (
                <div
                  key={iso}
                  title={`${iso}: ${count} run${count !== 1 ? "s" : ""}`}
                  className={cn(
                    "w-4 h-4 rounded-sm",
                    count === 0
                      ? "bg-bg-muted"
                      : count === 1
                        ? "bg-accent/30"
                        : count === 2
                          ? "bg-accent/60"
                          : "bg-accent",
                    isToday && "ring-1 ring-accent",
                  )}
                />
              ))}
            </div>
            {/* R31 — 4-bar exception sparkline below calendar */}
            {exceptionTrend4W.length >= 2 ? (() => {
              const maxExc = Math.max(...exceptionTrend4W.map((w) => w.total), 1);
              const svgW = 64;
              const svgH = 16;
              const barW = Math.floor(svgW / exceptionTrend4W.length) - 1;
              return (
                <div className="mt-1.5 flex items-center gap-1 text-3xs text-fg-faint">
                  <span className="tracking-sops shrink-0">Exc/wk</span>
                  <svg
                    viewBox={`0 0 ${svgW} ${svgH}`}
                    width={svgW}
                    height={svgH}
                    aria-label="Weekly exception totals — last 4 weeks"
                    role="img"
                  >
                    {exceptionTrend4W.map((w, i) => {
                      const barH = Math.max((w.total / maxExc) * (svgH - 2), 2);
                      const x = i * (barW + 1);
                      const y = svgH - barH;
                      const isLast = i === exceptionTrend4W.length - 1;
                      return (
                        <g key={w.weekLabel}>
                          <title>{`${w.weekLabel}: ${w.total} exception${w.total !== 1 ? "s" : ""}`}</title>
                          <rect
                            x={x}
                            y={y}
                            width={barW}
                            height={barH}
                            className={cn(
                              "fill-current",
                              isLast
                                ? exceptionTrendDir === "improving"
                                  ? "text-success-fg"
                                  : exceptionTrendDir === "worsening"
                                    ? "text-danger-fg"
                                    : "text-accent"
                                : "text-accent opacity-30",
                            )}
                          />
                        </g>
                      );
                    })}
                  </svg>
                </div>
              );
            })() : null}
          </div>
        ) : null}

        {/* R38 — Run Comparison Table panel */}
        {showRunCompareTable && compareTableData !== null ? (() => {
          const [runA, runB] = compareTableData;
          const rows38: [string, string | number, string | number][] = [
            ["Status", runA.status, runB.status],
            ["Recs", runA.total_recs ?? "—", runB.total_recs ?? "—"],
            ["Exceptions", runA.exceptions ?? "—", runB.exceptions ?? "—"],
            ["Quality", runA.quality_score ?? "—", runB.quality_score ?? "—"],
          ];
          return (
            <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-4 mb-2">
              <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong">
                <Columns className="h-3 w-3" strokeWidth={2} />
                Run Comparison
              </div>
              <div className="grid grid-cols-3 gap-1 mt-2 text-3xs">
                {/* Header row */}
                <div className="text-fg-faint p-1 border-b border-border font-semibold">Metric</div>
                <div className="text-fg-faint p-1 border-b border-border font-semibold truncate" title={runA.id}>{runA.label}</div>
                <div className="text-fg-faint p-1 border-b border-border font-semibold truncate" title={runB.id}>{runB.label}</div>
                {/* Data rows */}
                {rows38.map(([metric, valA, valB]) => (
                  <>
                    <div key={`m-${metric}`} className="text-fg-muted p-1 border-b border-border last:border-0">{metric}</div>
                    <div key={`a-${metric}`} className="text-fg-muted p-1 border-b border-border last:border-0">{valA}</div>
                    <div key={`b-${metric}`} className="text-fg-muted p-1 border-b border-border last:border-0">{valB}</div>
                  </>
                ))}
              </div>
            </div>
          );
        })() : null}

        {/* R40 — Run Result Distribution Donut panel */}
        {showRunDistribution && runDistributionData.total > 0 ? (() => {
          const { allApproved, partial, noneApproved, error, total } = runDistributionData;
          const circumference = 125.66; // 2π × 20
          // Build arcs in order: allApproved (green), partial (amber), noneApproved (gray), error (red)
          const buckets: { count: number; color: string; label: string }[] = [
            { count: allApproved, color: "#22c55e", label: "All approved" },
            { count: partial,     color: "#f59e0b", label: "Partial" },
            { count: noneApproved, color: "#9ca3af", label: "None approved" },
            { count: error,       color: "#ef4444", label: "Error" },
          ];
          let offset = 0;
          const arcs = buckets.map(({ count, color, label }) => {
            const slice = total > 0 ? (count / total) * circumference : 0;
            const arc = { count, color, label, slice, offset };
            offset += slice;
            return arc;
          });
          const dotColors: Record<string, string> = {
            "#22c55e": "bg-green-500",
            "#f59e0b": "bg-amber-400",
            "#9ca3af": "bg-gray-400",
            "#ef4444": "bg-red-500",
          };
          return (
            <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-4 mb-2">
              <div className="text-xs font-semibold text-fg-strong mb-1">Run Result Distribution</div>
              <div className="flex items-center gap-3">
                <svg
                  viewBox="0 0 60 60"
                  width="80"
                  height="80"
                  aria-label="Run result distribution donut chart"
                  role="img"
                >
                  {/* Background ring */}
                  <circle
                    cx="30"
                    cy="30"
                    r="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    className="text-bg-muted"
                    strokeDasharray={`${circumference} 0`}
                  />
                  {arcs.map(({ count, color, label, slice, offset: arcOffset }) =>
                    count === 0 ? null : (
                      <circle
                        key={label}
                        cx="30"
                        cy="30"
                        r="20"
                        fill="none"
                        stroke={color}
                        strokeWidth="8"
                        strokeDasharray={`${slice} ${circumference - slice}`}
                        strokeDashoffset={`-${arcOffset}`}
                        style={{ transform: "rotate(-90deg)", transformOrigin: "30px 30px" }}
                      >
                        <title>{`${label}: ${count}`}</title>
                      </circle>
                    ),
                  )}
                </svg>
                <div className="flex flex-wrap gap-2 text-3xs text-fg-muted">
                  {arcs.map(({ label, count, color }) => (
                    <div key={label} className="flex items-center gap-1">
                      <span
                        className={cn("inline-block w-2 h-2 rounded-full", dotColors[color])}
                      />
                      <span>{label}</span>
                      <span className="text-fg-faint">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })() : null}

        {/* R44 — Success Calendar Heatmap panel */}
        {showSuccessCalendar ? (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-4 mb-2">
            <div className="text-xs font-semibold text-fg-strong">
              Run Success Calendar (12 Weeks)
            </div>
            {/* Day column headers */}
            <div className="flex gap-0.5 ml-6 text-3xs text-fg-faint mt-1">
              <span className="w-4 text-center">M</span>
              <span className="w-4 text-center">T</span>
              <span className="w-4 text-center">W</span>
              <span className="w-4 text-center">T</span>
              <span className="w-4 text-center">F</span>
            </div>
            {/* Weeks */}
            {successCalendarData.weeks.map(({ weekLabel, days }) => (
              <div key={weekLabel} className="flex items-center gap-0.5 mt-0.5">
                <span className="w-6 text-3xs text-fg-faint shrink-0">{weekLabel}</span>
                {days.map(({ date, hasRun, success }) => (
                  <div
                    key={date}
                    title={`${date}: ${hasRun ? (success ? "Success" : "Failed") : "No run"}`}
                    className={cn(
                      "w-4 h-4 rounded-sm",
                      !hasRun
                        ? "bg-bg-muted"
                        : success
                          ? "bg-success-fg/70"
                          : "bg-danger-fg/70",
                    )}
                  />
                ))}
              </div>
            ))}
            {/* Legend */}
            <div className="flex gap-3 mt-1 text-3xs text-fg-faint">
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm bg-success-fg/70" />
                Success
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm bg-danger-fg/70" />
                Failed
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm bg-bg-muted" />
                No run
              </span>
            </div>
          </div>
        ) : null}

        {/* R46 — Run Size Histogram panel */}
        {showRunSizeChart && runSizeHistogramData ? (
          <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-4 mb-2">
            <div className="text-xs font-semibold text-fg-strong mb-2">
              Run Size Distribution ({displayRows.length} records)
            </div>
            <div className="flex gap-2 items-end h-20">
              {runSizeHistogramData.buckets.map(({ label, count }) => (
                <div key={label} className="flex flex-col items-center gap-0.5">
                  <span className="text-3xs text-fg-muted">{count}</span>
                  <div
                    className="w-12 rounded-t bg-accent/70"
                    style={{
                      height: `${Math.max(4, (count / runSizeHistogramData.maxCount) * 56)}px`,
                    }}
                  />
                  <span className="text-3xs text-fg-faint">{label}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* R48 — Rolling Success Trend Line panel */}
        {showRunTrendLine ? (
          runTrendLineData === null ? (
            <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-4 mb-2 text-3xs text-fg-muted">
              Need at least 6 runs to show trend line.
            </div>
          ) : (
            <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-4 mb-2">
              <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-1">
                <Activity className="h-3 w-3" strokeWidth={2} />
                30-Run Rolling Success Rate
              </div>
              <svg
                viewBox="0 0 200 50"
                width="100%"
                style={{ maxWidth: 400 }}
                aria-label="Rolling 5-run success rate trend"
                role="img"
              >
                {/* 50% grid line at y=20 */}
                <line
                  x1="0"
                  y1="20"
                  x2="200"
                  y2="20"
                  stroke="#e2e8f0"
                  strokeWidth="1"
                  strokeDasharray="3 2"
                />
                <polyline
                  points={runTrendLineData.points.map((p) => `${p.x},${p.y}`).join(" ")}
                  stroke="#3b82f6"
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {runTrendLineData.points.map((p, i) => (
                  <g key={i}>
                    <title>{p.label}</title>
                    <circle cx={p.x} cy={p.y} r="2.5" fill="#3b82f6" />
                  </g>
                ))}
              </svg>
              <div className="mt-1 flex items-center gap-1">
                <span className="text-3xs rounded-full px-2 py-0.5 bg-accent-softer text-accent">
                  avg {Math.round(runTrendLineData.avgRate * 100)}% success
                </span>
              </div>
            </div>
          )
        ) : null}

        {/* R50 — Monthly Run Calendar panel */}
        {showRunMonthCalendar ? (
          runMonthCalendarData === null ? (
            <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-4 mb-2 text-3xs text-fg-muted">
              No runs this month to display.
            </div>
          ) : (
            <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-4 mb-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-strong mb-2">
                <CalendarDays className="h-3 w-3" strokeWidth={2} />
                {runMonthCalendarData.monthLabel}
              </div>
              {/* Day-of-week headers */}
              <div className="grid grid-cols-7 gap-0.5 mb-1">
                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                  <div key={d} className="text-3xs text-fg-faint text-center font-medium">
                    {d}
                  </div>
                ))}
              </div>
              {/* Week rows */}
              {runMonthCalendarData.weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 gap-0.5 mb-0.5">
                  {week.days.map((day, di) => (
                    <div
                      key={di}
                      title={day.date ? `${day.date}: ${day.count} run${day.count !== 1 ? "s" : ""}${day.hasSuccess ? " (success)" : ""}` : ""}
                      className={cn(
                        "flex flex-col items-center justify-start rounded pt-0.5 pb-1 min-h-[28px]",
                        day.isToday ? "ring-1 ring-accent" : "",
                        day.date ? "bg-bg-raised" : "bg-transparent",
                      )}
                    >
                      {day.date ? (
                        <>
                          <span className="text-3xs text-fg-muted leading-none">
                            {parseInt(day.date.slice(8), 10)}
                          </span>
                          {day.count > 0 ? (
                            <span
                              className={cn(
                                "mt-0.5 text-3xs rounded-full px-1 leading-none",
                                day.hasSuccess ? "bg-success-softer text-success-fg" : "bg-danger-softer text-danger-fg",
                              )}
                            >
                              {day.count}
                            </span>
                          ) : (
                            <span className="mt-0.5 h-3 w-3 rounded-full bg-bg-muted" />
                          )}
                        </>
                      ) : null}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )
        ) : null}

        {/* R52 — Run Concurrency Analysis panel */}
        {showRunParallelism ? (
          runParallelismData === null ? (
            <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-4 mb-2 text-3xs text-fg-muted">
              Need at least 3 runs with start/end timestamps to compute concurrency.
            </div>
          ) : (
            <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-4 mb-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-strong mb-3">
                <Layers className="h-3 w-3" strokeWidth={2} />
                Run Concurrency Analysis
              </div>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-2xl font-bold text-fg-strong leading-none">
                  {runParallelismData.maxConcurrent}
                </span>
                <span className="text-3xs text-fg-muted mb-0.5">max concurrent runs</span>
              </div>
              <div className="text-3xs text-fg-muted mb-3">
                {runParallelismData.overlapCount === 0
                  ? "No overlapping runs detected."
                  : `${runParallelismData.overlapCount} overlap pair${runParallelismData.overlapCount !== 1 ? "s" : ""} detected.`}
              </div>
              {runParallelismData.overlapPairs.length > 0 ? (
                <div className="space-y-1">
                  <div className="text-3xs font-semibold text-fg-muted uppercase tracking-sops mb-1">
                    Example overlaps
                  </div>
                  {runParallelismData.overlapPairs.slice(0, 3).map((pair, i) => (
                    <div key={i} className="text-3xs text-fg-muted">
                      <span className="font-medium text-fg">{pair.runA.id}</span>
                      {" overlapped with "}
                      <span className="font-medium text-fg">{pair.runB.id}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {runParallelismData.maxConcurrent > 1 ? (
                <div className="mt-3 rounded bg-warning-softer px-2 py-1.5 text-3xs text-warning-fg">
                  Multiple concurrent runs may produce conflicting recommendations. Consider serializing planning runs.
                </div>
              ) : null}
            </div>
          )
        ) : null}

        {/* R54 — Run Quality Matrix panel */}
        {showRunQualityMatrix ? (
          runQualityMatrixData === null ? (
            <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-4 mb-2 text-3xs text-fg-muted">
              Need at least 6 runs to compute a quality matrix.
            </div>
          ) : (
            <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-4 mb-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-strong mb-3">
                <LayoutGrid className="h-3 w-3" strokeWidth={2} />
                Run Quality Matrix
              </div>
              <div className="overflow-x-auto">
                <table className="text-3xs border-collapse">
                  <thead>
                    <tr>
                      <th className="pr-2 pb-1 text-left text-fg-faint font-normal">
                        Success Rate ↓ / Rec Density →
                      </th>
                      {runQualityMatrixData.colLabels.map((col) => (
                        <th
                          key={col}
                          className="w-14 pb-1 text-center font-semibold text-fg-muted uppercase tracking-sops"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {runQualityMatrixData.matrix.map((matrixRow, ri) => (
                      <tr key={runQualityMatrixData.rowLabels[ri]}>
                        <td className="pr-2 py-0.5 font-semibold text-fg-muted uppercase tracking-sops">
                          {runQualityMatrixData.rowLabels[ri]}
                        </td>
                        {matrixRow.map((cell, ci) => {
                          const allCounts = runQualityMatrixData.matrix
                            .flatMap((mr) => mr.map((c) => c.count));
                          const maxCount = Math.max(...allCounts, 1);
                          const ratio = cell.count / maxCount;
                          const cellBg =
                            cell.count === 0
                              ? "bg-bg-muted"
                              : ratio >= 0.66
                                ? "bg-accent"
                                : "bg-accent/40";
                          const textColor =
                            cell.count === 0
                              ? "text-fg-faint"
                              : ratio >= 0.66
                                ? "text-white"
                                : "text-accent";
                          return (
                            <td
                              key={ci}
                              className={cn(
                                "w-14 h-9 text-center align-middle rounded font-bold transition-colors",
                                cellBg,
                                textColor,
                              )}
                              title={`${runQualityMatrixData.rowLabels[ri]} success / ${runQualityMatrixData.colLabels[ci]} density: ${cell.count} run${cell.count !== 1 ? "s" : ""}`}
                            >
                              {cell.count}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 text-3xs text-fg-faint">
                {runQualityMatrixData.total} runs · rows = success rate bucket · cols = rec density bucket
              </div>
            </div>
          )
        ) : null}

        {/* R42 — Quality Score Trend Sparkline panel */}
        {showQualityTrend && qualityTrendData !== null ? (() => {
          const { scores, labels } = qualityTrendData;
          const n = scores.length;
          const xStep = n > 1 ? 160 / (n - 1) : 80;
          const points = scores
            .map((s, i) => {
              const x = i * xStep;
              const y = 36 - (s / 100) * 32;
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(" ");
          const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
          return (
            <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-4 mb-2">
              <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-1">
                <TrendingUp className="h-3 w-3" strokeWidth={2} />
                Run Quality Trend (last 8 runs)
              </div>
              <svg
                viewBox="0 0 160 40"
                width="100%"
                style={{ maxWidth: 320 }}
                aria-label="Quality score trend over last 8 runs"
                role="img"
              >
                <polyline
                  points={points}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {scores.map((s, i) => {
                  const x = i * xStep;
                  const y = 36 - (s / 100) * 32;
                  return (
                    <g key={i}>
                      <title>{`${labels[i]}: ${s}`}</title>
                      <circle cx={x.toFixed(1)} cy={y.toFixed(1)} r="3" fill="#3b82f6" />
                    </g>
                  );
                })}
                {labels.map((label, i) => {
                  const x = i * xStep;
                  return (
                    <text
                      key={i}
                      x={x.toFixed(1)}
                      y="40"
                      fontSize="7"
                      textAnchor="middle"
                      fill="#94a3b8"
                    >
                      {label}
                    </text>
                  );
                })}
              </svg>
              <div className="flex justify-between items-center text-3xs text-fg-faint mt-0.5" style={{ maxWidth: 320 }}>
                <span>0</span>
                <span className="inline-flex items-center gap-1">
                  <span
                    className="text-accent bg-accent-softer rounded-full px-2"
                    title={`Average quality score: ${avgScore}`}
                  >
                    avg {avgScore}
                  </span>
                  100
                </span>
              </div>
            </div>
          );
        })() : null}

        {/* R43 (new) — Cost Trend panel */}
        {showRunCostTrend ? (() => {
          const costPoints = [120, 145, 132, 160, 155, 178];
          const svgW = 260;
          const svgH = 50;
          const minCost = Math.min(...costPoints);
          const maxCost = Math.max(...costPoints);
          const range = maxCost - minCost || 1;
          const xStep = svgW / (costPoints.length - 1);
          const pts = costPoints
            .map((c, i) => {
              const x = i * xStep;
              const y = svgH - 4 - ((c - minCost) / range) * (svgH - 8);
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(" ");
          return (
            <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-4 mb-2">
              <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2">
                <TrendingUp className="h-3 w-3" strokeWidth={2} />
                Cost Trend (last 6 runs)
              </div>
              <svg
                viewBox={`0 0 ${svgW} ${svgH}`}
                width="100%"
                style={{ maxWidth: svgW }}
                aria-label="Cost trend over last 6 runs"
                role="img"
              >
                <polyline
                  points={pts}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {costPoints.map((c, i) => {
                  const x = i * xStep;
                  const y = svgH - 4 - ((c - minCost) / range) * (svgH - 8);
                  return (
                    <g key={i}>
                      <title>{`Run ${i + 1}: ${c}`}</title>
                      <circle cx={x.toFixed(1)} cy={y.toFixed(1)} r="3" fill="#3b82f6" />
                    </g>
                  );
                })}
              </svg>
              <div
                className="flex justify-between text-3xs text-fg-faint mt-1"
                style={{ maxWidth: svgW }}
              >
                <span>6 runs ago</span>
                <span>Latest</span>
              </div>
            </div>
          );
        })() : null}

        {/* R45 (new) — Run Time Distribution panel */}
        {showRunTimeDistribution ? (() => {
          const timeBuckets: { label: string; count: number }[] = [
            { label: "<1min", count: 2 },
            { label: "1-3min", count: 8 },
            { label: "3-5min", count: 5 },
            { label: ">5min", count: 1 },
          ];
          const timeBucketMax = Math.max(...timeBuckets.map((b) => b.count), 1);
          return (
            <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-4 mb-2">
              <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-3">
                <Clock className="h-3 w-3" strokeWidth={2} />
                Run Duration Distribution
              </div>
              <div className="flex flex-col gap-1.5">
                {timeBuckets.map(({ label, count }) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="w-12 shrink-0 text-3xs text-fg-muted text-right">{label}</span>
                    <div className="flex-1 bg-bg-muted rounded h-4 overflow-hidden">
                      <div
                        className="h-4 rounded bg-accent/70 transition-all"
                        style={{ width: `${Math.max(4, (count / timeBucketMax) * 100)}%` }}
                      />
                    </div>
                    <span className="w-4 shrink-0 text-3xs text-fg-faint tabular-nums">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })() : null}

        {/* R46 (new) — Run Trigger Breakdown panel */}
        {showRunTriggerBreakdown ? (() => {
          // Fixed illustrative breakdown: Manual 50%, Scheduled 35%, Auto-replan 15%
          const triggerSlices: { label: string; pct: number; color: string }[] = [
            { label: "Manual", pct: 50, color: "#3b82f6" },
            { label: "Scheduled", pct: 35, color: "#22c55e" },
            { label: "Auto-replan", pct: 15, color: "#f97316" },
          ];
          const r = 40;
          const cx = 55;
          const cy = 55;
          const circumference = 2 * Math.PI * r; // ≈ 251.33
          let cumulativePct = 0;
          return (
            <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-4 mb-2">
              <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-3">
                <Zap className="h-3 w-3" strokeWidth={2} />
                Run Trigger Breakdown
              </div>
              <div className="flex items-center gap-4">
                <svg
                  viewBox="0 0 110 110"
                  width="110"
                  height="110"
                  aria-label="Run trigger source breakdown donut chart"
                  role="img"
                >
                  {/* Background ring */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="18"
                    className="text-bg-muted"
                  />
                  {triggerSlices.map(({ label, pct, color }) => {
                    const dashArray = (pct / 100) * circumference;
                    const dashOffset = -((cumulativePct / 100) * circumference);
                    cumulativePct += pct;
                    return (
                      <circle
                        key={label}
                        cx={cx}
                        cy={cy}
                        r={r}
                        fill="none"
                        stroke={color}
                        strokeWidth="18"
                        strokeDasharray={`${dashArray} ${circumference - dashArray}`}
                        strokeDashoffset={dashOffset}
                        style={{ transform: `rotate(-90deg)`, transformOrigin: `${cx}px ${cy}px` }}
                      >
                        <title>{`${label}: ${pct}%`}</title>
                      </circle>
                    );
                  })}
                </svg>
                <div className="flex flex-col gap-1.5 text-3xs text-fg-muted">
                  {triggerSlices.map(({ label, pct, color }) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-fg-muted">{label}</span>
                      <span className="tabular-nums text-fg-faint ml-auto pl-2">{pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })() : null}

        {/* R47 — Output Trend panel */}
        {showRunOutputTrend ? (() => {
          const outputPoints = [45, 52, 38, 61, 55, 67];
          const svgW = 260;
          const svgH = 50;
          const n = outputPoints.length;
          const minVal = Math.min(...outputPoints);
          const maxVal = Math.max(...outputPoints);
          const range = maxVal - minVal || 1;
          const avgVal = outputPoints.reduce((s, v) => s + v, 0) / n;
          // y inverted: higher value = lower y coordinate
          const toY = (v: number) => svgH - 6 - ((v - minVal) / range) * (svgH - 12);
          const avgY = toY(avgVal);
          const xStep = svgW / (n - 1);
          const polyPoints = outputPoints
            .map((v, i) => `${(i * xStep).toFixed(1)},${toY(v).toFixed(1)}`)
            .join(" ");
          const xLabels = ["R-5", "R-4", "R-3", "R-2", "R-1", "R0"];
          return (
            <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-4 mb-2">
              <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2">
                <TrendingUp className="h-3 w-3" strokeWidth={2} />
                Output Trend (6-run rolling total recs)
              </div>
              <svg
                viewBox={`0 0 ${svgW} ${svgH}`}
                width="100%"
                style={{ maxWidth: svgW }}
                aria-label="6-run rolling total recommendation output trend"
                role="img"
              >
                {/* Dashed average line */}
                <line
                  x1="0"
                  y1={avgY.toFixed(1)}
                  x2={svgW}
                  y2={avgY.toFixed(1)}
                  stroke="#94a3b8"
                  strokeWidth="1"
                  strokeDasharray="4 3"
                />
                {/* Polyline */}
                <polyline
                  points={polyPoints}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Data point dots */}
                {outputPoints.map((v, i) => (
                  <g key={i}>
                    <title>{`${xLabels[i]}: ${v} recs`}</title>
                    <circle
                      cx={(i * xStep).toFixed(1)}
                      cy={toY(v).toFixed(1)}
                      r="3"
                      fill="#3b82f6"
                    />
                  </g>
                ))}
                {/* X axis labels */}
                {xLabels.map((label, i) => (
                  <text
                    key={label}
                    x={(i * xStep).toFixed(1)}
                    y={svgH}
                    fontSize="7"
                    textAnchor="middle"
                    fill="#94a3b8"
                  >
                    {label}
                  </text>
                ))}
              </svg>
              <div className="mt-1 text-3xs text-fg-faint">
                avg {Math.round(avgVal)} recs · dashed line = average
              </div>
            </div>
          );
        })() : null}

        {/* R48 (new) — Coverage Heatmap panel */}
        {showRunCoverageHeatmap ? (
          <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-4 mb-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-strong mb-3">
              <LayoutGrid className="h-3 w-3" strokeWidth={2} />
              Coverage Map (4 Weeks × 3 Tiers)
            </div>
            {/* Column headers: blank label cell + 4 week headers */}
            <div className="flex items-center gap-1 mb-1">
              <span className="w-8 shrink-0" />
              {coverageHeatmapData.map(({ week }) => (
                <div key={week} className="flex-1 text-3xs text-fg-faint text-center font-medium">
                  {week}
                </div>
              ))}
            </div>
            {/* Tier rows */}
            <div className="flex flex-col gap-1">
              {(
                [
                  { tier: "High", key: "high" as const, bg: "bg-success-softer", text: "text-success-fg" },
                  { tier: "Med",  key: "med"  as const, bg: "bg-warning-softer", text: "text-warning-fg" },
                  { tier: "Low",  key: "low"  as const, bg: "bg-danger-softer",  text: "text-danger-fg"  },
                ] as const
              ).map(({ tier, key, bg, text }) => (
                <div key={tier} className="flex items-center gap-1">
                  <span className="w-8 shrink-0 text-3xs font-semibold text-fg-muted uppercase tracking-sops text-right pr-1">
                    {tier}
                  </span>
                  {coverageHeatmapData.map((row) => {
                    const count = row[key];
                    return (
                      <div
                        key={row.week}
                        title={`${row.week} · ${tier}: ${count} run${count !== 1 ? "s" : ""}`}
                        className={cn(
                          "flex-1 h-9 rounded flex flex-col items-center justify-center",
                          bg,
                        )}
                      >
                        <span className={cn("text-sm font-bold leading-none", text)}>
                          {count}
                        </span>
                        <span className="text-3xs text-fg-faint leading-none mt-0.5">runs</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            {/* Legend */}
            <div className="flex gap-3 mt-2 text-3xs text-fg-faint">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded bg-success-softer" />
                High coverage
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded bg-warning-softer" />
                Medium
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded bg-danger-softer" />
                Low
              </span>
            </div>
          </div>
        ) : null}

        {/* R49 — Health Score Chart panel */}
        {showRunHealthScoreChart ? (() => {
          const healthScores = [72, 85, 68, 91, 78, 88];
          const svgW = 260;
          const svgH = 50;
          const n = healthScores.length;
          const xStep = svgW / (n - 1);
          // Score range 0-100; map to SVG y (inverted: 100 = top = y=0)
          const toY = (s: number) => svgH - (s / 100) * svgH;
          const polyPoints = healthScores
            .map((s, i) => `${(i * xStep).toFixed(1)},${toY(s).toFixed(1)}`)
            .join(" ");
          // Closed area path: polyline + close to bottom
          const firstX = 0;
          const lastX = ((n - 1) * xStep).toFixed(1);
          const areaPath =
            `M ${firstX},${toY(healthScores[0]!).toFixed(1)} ` +
            healthScores
              .map((s, i) => `L ${(i * xStep).toFixed(1)},${toY(s).toFixed(1)}`)
              .join(" ") +
            ` L ${lastX},${svgH} L ${firstX},${svgH} Z`;
          // Threshold line at score 75 (good threshold)
          const thresholdY = toY(75).toFixed(1);
          return (
            <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-4 mb-2">
              <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2">
                <HeartPulse className="h-3 w-3" strokeWidth={2} />
                Health Score (last 6 runs)
              </div>
              <svg
                viewBox={`0 0 ${svgW} ${svgH}`}
                width="100%"
                style={{ maxWidth: svgW }}
                aria-label="Health score area chart over last 6 runs"
                role="img"
              >
                {/* Filled area at low opacity */}
                <path
                  d={areaPath}
                  className="fill-current text-accent"
                  opacity={0.12}
                />
                {/* Dashed threshold line at 75 */}
                <line
                  x1="0"
                  y1={thresholdY}
                  x2={svgW}
                  y2={thresholdY}
                  stroke="#94a3b8"
                  strokeWidth="1"
                  strokeDasharray="4 3"
                />
                {/* Polyline */}
                <polyline
                  points={polyPoints}
                  fill="none"
                  className="stroke-current text-accent"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Dots colored by score */}
                {healthScores.map((s, i) => {
                  const cx = (i * xStep).toFixed(1);
                  const cy = toY(s).toFixed(1);
                  const dotColor =
                    s >= 80 ? "#22c55e" : s >= 60 ? "#f59e0b" : "#ef4444";
                  return (
                    <g key={i}>
                      <title>{`Run ${i + 1}: ${s}`}</title>
                      <circle cx={cx} cy={cy} r="3.5" fill={dotColor} />
                    </g>
                  );
                })}
                {/* Threshold label */}
                <text
                  x={svgW - 2}
                  y={Number(thresholdY) - 2}
                  fontSize="7"
                  textAnchor="end"
                  fill="#94a3b8"
                >
                  75 (good)
                </text>
              </svg>
              <div className="mt-1.5 flex items-center gap-2 text-3xs text-fg-faint">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                  ≥80
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
                  60–79
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
                  &lt;60
                </span>
              </div>
            </div>
          );
        })() : null}

        {/* R50 — Complexity Score panel */}
        {showRunComplexityScore ? (() => {
          const complexityFactors: { label: string; score: number }[] = [
            { label: "SKU diversity", score: 7 },
            { label: "Supplier count", score: 5 },
            { label: "Horizon weeks", score: 8 },
            { label: "Constraint density", score: 6 },
          ];
          const maxScore = 10;
          const total = complexityFactors.reduce((s, f) => s + f.score, 0);
          const totalMax = complexityFactors.length * maxScore;
          return (
            <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-4 mb-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-strong mb-3">
                <Layers className="h-3 w-3" strokeWidth={2} />
                Run Complexity Score (latest run)
              </div>
              <div className="flex flex-col gap-2">
                {complexityFactors.map(({ label, score }) => {
                  const pct = (score / maxScore) * 100;
                  const barColor =
                    score >= 8
                      ? "bg-danger-fg/70"
                      : score >= 6
                        ? "bg-warning-fg/70"
                        : "bg-success-fg/70";
                  return (
                    <div key={label} className="flex items-center gap-2">
                      <span className="w-32 shrink-0 text-3xs text-fg-muted text-right">
                        {label}
                      </span>
                      <div className="flex-1 bg-bg-muted rounded h-3 overflow-hidden">
                        <div
                          className={cn("h-3 rounded transition-all", barColor)}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-10 shrink-0 text-3xs text-fg-muted tabular-nums text-right">
                        {score}/{maxScore}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2">
                <span className="text-3xs font-semibold text-fg-muted uppercase tracking-sops">
                  Composite score
                </span>
                <span
                  className={cn(
                    "text-sm font-bold tabular-nums",
                    total >= 32
                      ? "text-danger-fg"
                      : total >= 24
                        ? "text-warning-fg"
                        : "text-success-fg",
                  )}
                >
                  {total}/{totalMax}
                </span>
              </div>
            </div>
          );
        })() : null}

        {/* R51 — Audit Trail panel */}
        {showRunAuditTrail ? (
          <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-4 mb-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-strong mb-3">
              <Shield className="h-3 w-3" strokeWidth={2} />
              Run Audit Trail
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-3xs border-collapse">
                <thead>
                  <tr>
                    <th className="text-left text-fg-faint font-semibold uppercase tracking-sops pb-1 pr-3">Action</th>
                    <th className="text-left text-fg-faint font-semibold uppercase tracking-sops pb-1 pr-3">Actor</th>
                    <th className="text-left text-fg-faint font-semibold uppercase tracking-sops pb-1 pr-3">Time</th>
                    <th className="text-left text-fg-faint font-semibold uppercase tracking-sops pb-1">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {MOCK_RUN_AUDIT.map((entry) => {
                    const typeBadge =
                      entry.type === "trigger"
                        ? "bg-info-softer text-info-fg"
                        : entry.type === "edit"
                          ? "bg-warning-softer text-warning-fg"
                          : entry.type === "approve"
                            ? "bg-success-softer text-success-fg"
                            : "bg-bg-muted text-fg-muted";
                    return (
                      <tr key={entry.id} className="border-t border-border/40">
                        <td className="py-1.5 pr-3 text-fg">{entry.action}</td>
                        <td className="py-1.5 pr-3 text-fg-muted">{entry.actor}</td>
                        <td className="py-1.5 pr-3 text-fg-faint tabular-nums">{entry.time}</td>
                        <td className="py-1.5">
                          <span className={cn("rounded px-1.5 py-0.5 font-semibold uppercase tracking-sops", typeBadge)}>
                            {entry.type}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {/* R52 — Dependency Panel */}
        {showRunDependencyPanel ? (
          <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-4 mb-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-strong mb-3">
              <Network className="h-3 w-3" strokeWidth={2} />
              Run Dependencies
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-3xs border-collapse">
                <thead>
                  <tr>
                    <th className="text-left text-fg-faint font-semibold uppercase tracking-sops pb-1 pr-3">Run</th>
                    <th className="text-left text-fg-faint font-semibold uppercase tracking-sops pb-1 pr-3">Depends On</th>
                    <th className="text-left text-fg-faint font-semibold uppercase tracking-sops pb-1 pr-3">Status</th>
                    <th className="text-left text-fg-faint font-semibold uppercase tracking-sops pb-1">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {RUN_DEPS.map((dep) => {
                    const statusBadge =
                      dep.status === "complete"
                        ? "bg-success-softer text-success-fg"
                        : dep.status === "standalone"
                          ? "bg-bg-muted text-fg-muted"
                          : "bg-warning-softer text-warning-fg";
                    const statusLabel =
                      dep.status === "complete"
                        ? "Complete"
                        : dep.status === "standalone"
                          ? "Standalone"
                          : "Pending";
                    return (
                      <tr key={dep.runId} className="border-t border-border/40">
                        <td className="py-1.5 pr-3 font-medium text-fg">{dep.runId}</td>
                        <td className="py-1.5 pr-3 text-fg-muted">{dep.dependsOn ?? "—"}</td>
                        <td className="py-1.5 pr-3">
                          <span className={cn("rounded px-1.5 py-0.5 font-semibold uppercase tracking-sops", statusBadge)}>
                            {statusLabel}
                          </span>
                        </td>
                        <td className="py-1.5 text-fg-muted">{dep.reason}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {/* R44 (new) — Run Frequency Chart panel */}
        {showRunFrequencyChart ? (() => {
          const freqValues = [2, 5, 3, 4, 1];
          const freqDays = ["Sun", "Mon", "Tue", "Wed", "Thu"];
          const freqMax = Math.max(...freqValues, 1);
          const svgW = 260;
          const svgH = 60;
          const barW = 30;
          const barGap = (svgW - freqDays.length * barW) / (freqDays.length + 1);
          return (
            <div className="bg-bg-subtle border border-border rounded p-3 mt-2 mx-4 mb-2">
              <div className="flex items-center gap-1 text-xs font-semibold text-fg-strong mb-2">
                <BarChart2 className="h-3 w-3" strokeWidth={2} />
                Runs by Day of Week
              </div>
              <svg
                viewBox={`0 0 ${svgW} ${svgH}`}
                width="100%"
                style={{ maxWidth: svgW }}
                aria-label="Runs per day of week"
                role="img"
              >
                {freqValues.map((count, i) => {
                  const barH = Math.max(4, (count / freqMax) * (svgH - 16));
                  const x = barGap + i * (barW + barGap);
                  const y = svgH - 14 - barH;
                  return (
                    <g key={freqDays[i]}>
                      <title>{`${freqDays[i]}: ${count} run${count !== 1 ? "s" : ""}`}</title>
                      <rect
                        x={x}
                        y={y}
                        width={barW}
                        height={barH}
                        rx="2"
                        className="fill-accent opacity-70"
                      />
                      <text
                        x={x + barW / 2}
                        y={svgH - 2}
                        fontSize="8"
                        textAnchor="middle"
                        className="fill-current text-fg-faint"
                        fill="#94a3b8"
                      >
                        {freqDays[i]}
                      </text>
                      <text
                        x={x + barW / 2}
                        y={y - 2}
                        fontSize="8"
                        textAnchor="middle"
                        fill="#64748b"
                      >
                        {count}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          );
        })() : null}

        {query.isLoading ? (
          <div className="p-5">
            <div className="space-y-2" aria-busy="true" aria-live="polite">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex animate-pulse gap-3 border-b border-border/30 pb-2"
                >
                  <div className="h-5 w-20 shrink-0 rounded bg-bg-subtle" />
                  <div className="h-5 flex-1 rounded bg-bg-subtle" />
                  <div className="h-5 w-24 shrink-0 rounded bg-bg-subtle" />
                </div>
              ))}
            </div>
          </div>
        ) : query.isError ? (
          <div className="p-5">
            <div
              className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg"
              data-testid="planning-runs-list-error"
            >
              <div className="font-semibold">Could not load planning runs</div>
              <div className="mt-1 text-xs">
                Check your connection. The list will refresh when the API is reachable again.
              </div>
              <button
                type="button"
                onClick={() => void query.refetch()}
                className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No planning runs in this view."
              description={
                canAuthor
                  ? "Trigger a run to get the first recommendation set."
                  : "No runs yet. A planner will trigger one when needed."
              }
            />
          </div>
        ) : (
          <ul
            className="divide-y divide-border/60"
            data-testid="planning-runs-list"
          >
            {displayRows.map((r) => (
              <RunTimelineRow
                key={r.run_id}
                r={r}
                showRunDelta={showRunDelta}
                delta={runDeltas.get(r.run_id)}
                annotation={runAnnotations[r.run_id] ?? ""}
                isAnnotating={annotatingRunId === r.run_id}
                onAnnotationChange={(val) => {
                  const next = { ...runAnnotations, [r.run_id]: val };
                  setRunAnnotations(next);
                  try {
                    localStorage.setItem("gt_run_annotations", JSON.stringify(next));
                  } catch { /* ignore storage errors */ }
                }}
                onToggleAnnotate={() =>
                  setAnnotatingRunId((cur) => (cur === r.run_id ? null : r.run_id))
                }
              />
            ))}
          </ul>
        )}
      </SectionCard>

      {showTriggerConfirm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="trigger-run-title"
          data-testid="planning-runs-trigger-modal"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowTriggerConfirm(false);
          }}
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-bg-raised p-5 shadow-2xl">
            <h2 id="trigger-run-title" className="text-base font-semibold text-fg-strong">
              Trigger a new planning run?
            </h2>
            <p className="mt-2 text-sm text-fg-muted leading-relaxed">
              The run will snapshot demand (forecast + open orders), stock, BOM, and current policy, then compute purchase + production recommendations.
            </p>
            <p className="mt-2 text-xs text-fg-muted">
              No purchase order or production report is created automatically — you approve each recommendation individually once the run completes.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setShowTriggerConfirm(false)}
                disabled={triggerMutation.isPending}
                data-testid="planning-runs-trigger-modal-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm gap-1.5"
                disabled={triggerMutation.isPending}
                onClick={() => {
                  setShowTriggerConfirm(false);
                  triggerMutation.mutate();
                }}
                data-testid="planning-runs-trigger-modal-confirm"
              >
                <Play className="h-3 w-3" strokeWidth={2.5} />
                Trigger run
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
