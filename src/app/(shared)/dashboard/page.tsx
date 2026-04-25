"use client";

// ---------------------------------------------------------------------------
// /dashboard — Control Tower landing (Tranche C §E of
// portal-full-production-refactor).
//
// Replaces the Tranche-A interim LIVE_MODULES hardcoded link list with a
// real operational signals dashboard. Seven signal blocks + a role-adapted
// quick-action launcher.
//
// Data strategy (per dispatch Step 3):
//   - TanStack Query `useQueries` with staleTime = 30_000 ms (DR-1).
//   - Per-source fetchers under src/features/dashboard/client.ts return
//     Signal<T> discriminated union so every panel has a honest state:
//       "ok" | "unavailable" | "pending_tranche_i".
//   - Inbox summary reuses the ["inbox","all_rows"] cache from Tranche B
//     — no duplicate fetch. If the cache is cold, panel renders a
//     "visit /inbox once to populate" hint.
//
// Role-adapted quick actions use authorizeCapability() verbatim — same gate
// as RoleGate + SideNav.
//
// All hrefs are canonical domain-first URLs per plan §B.1. The
// scripts/check-no-persona-in-urls.mjs guard fails CI on route-group leakage.
// ---------------------------------------------------------------------------

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  Info,
  ShieldAlert,
  Signal as SignalIcon,
} from "lucide-react";

import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { useSession } from "@/lib/auth/session-provider";
import { authorizeCapability } from "@/lib/auth/authorize";
import { cn } from "@/lib/cn";

import {
  fetchBreakGlassState,
  fetchIntegrationFreshness,
  fetchJobsHealth24h,
  fetchLatestForecast,
  fetchLatestPlanningRun,
  fetchParityCheck,
  fetchRuntimeReadyRegistry,
  fetchStockTruth,
  summarizeInbox,
  truncateLastError,
} from "@/features/dashboard/client";
import type { Signal } from "@/features/dashboard/types";
import { QUICK_ACTIONS } from "@/features/dashboard/quick-actions";
import type { InboxRow } from "@/features/inbox/types";

// ---------------------------------------------------------------------------
// Cache keys. Dashboard queries are segregated from the inbox's to avoid
// accidental cross-source invalidation. The single exception is the inbox
// summary which READS (not writes) the ["inbox","all_rows"] cache seeded by
// /inbox page on visit.
// ---------------------------------------------------------------------------
const QK_PLANNING_RUN = ["dashboard", "latest_planning_run"] as const;
const QK_FORECAST = ["dashboard", "latest_forecast"] as const;
const QK_BREAK_GLASS = ["dashboard", "break_glass"] as const;
const QK_PARITY_CHECK = ["dashboard", "parity_check"] as const;
const QK_STOCK_TRUTH = ["dashboard", "stock_truth"] as const;
const QK_FRESHNESS = ["dashboard", "integration_freshness"] as const;
const QK_JOBS_HEALTH = ["dashboard", "jobs_health_24h"] as const;
const QK_RUNTIME_READY = ["dashboard", "runtime_ready"] as const;

const INBOX_CACHE_KEY = ["inbox", "all_rows"] as const;

// All dashboard signals share the same cadence per DR-1. No server cache.
const DASHBOARD_STALE_TIME_MS = 30_000;

// Health-check signals (parity, break-glass) refresh every 60s per Loop 15 spec.
const HEALTH_STALE_TIME_MS = 60_000;

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------
function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short", day: "2-digit", year: "numeric",
    });
  } catch { return iso; }
}

function ageHumanized(iso: string | null | undefined, now: Date): string {
  if (!iso) return "—";
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return iso;
  const deltaMs = now.getTime() - ts;
  if (deltaMs < 0) return "in the future";
  const mins = Math.max(0, Math.round(deltaMs / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function roleBadgeTone(
  role: "operator" | "planner" | "admin" | "viewer",
): "accent" | "success" | "info" | "neutral" {
  switch (role) {
    case "admin":
      return "accent";
    case "planner":
      return "info";
    case "operator":
      return "success";
    default:
      return "neutral";
  }
}

// ---------------------------------------------------------------------------
// Generic signal renderers.
// ---------------------------------------------------------------------------

function PendingBadge({ note }: { note: string }) {
  return (
    <div
      className="flex items-start gap-2 rounded border border-border/60 bg-bg-subtle px-3 py-2 text-xs text-fg-muted"
      data-testid="dashboard-pending-tranche-i"
    >
      <CircleDashed
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-faint"
        strokeWidth={2}
      />
      <div className="min-w-0">
        <div className="font-semibold text-fg-muted">Not yet available</div>
        <div className="mt-0.5 leading-relaxed">{note}</div>
      </div>
    </div>
  );
}

function UnavailableBadge({ reason }: { reason: string }) {
  return (
    <div
      className="flex items-start gap-2 rounded border border-warning/40 bg-warning-softer px-3 py-2 text-xs text-warning-fg"
      data-testid="dashboard-signal-unavailable"
    >
      <AlertTriangle
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning"
        strokeWidth={2}
      />
      <div className="min-w-0">
        <div className="font-semibold">Signal unavailable</div>
        <div className="mt-0.5 leading-relaxed">{reason}</div>
      </div>
    </div>
  );
}

function StatPill({
  label,
  value,
  tone,
  sub,
  href,
  icon,
  testid,
}: {
  label: string;
  value: ReactNode;
  tone: "danger" | "warning" | "info" | "success" | "neutral" | "accent";
  sub?: ReactNode;
  href?: string;
  icon?: ReactNode;
  testid?: string;
}) {
  const TONE_BG: Record<typeof tone, string> = {
    danger: "border-danger/40 bg-danger-softer",
    warning: "border-warning/40 bg-warning-softer",
    info: "border-info/40 bg-info-softer",
    success: "border-success/40 bg-success-softer",
    neutral: "border-border/70 bg-bg-raised",
    accent: "border-accent/40 bg-accent-soft",
  };
  const TONE_TITLE: Record<typeof tone, string> = {
    danger: "text-danger-fg",
    warning: "text-warning-fg",
    info: "text-info-fg",
    success: "text-success-fg",
    neutral: "text-fg-strong",
    accent: "text-accent",
  };
  const inner = (
    <div
      className={cn(
        "flex h-full flex-col gap-2 rounded border p-4",
        TONE_BG[tone],
      )}
      data-testid={testid}
    >
      <div className="flex items-center gap-2 text-3xs font-semibold uppercase tracking-sops text-fg-muted">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          "text-2xl font-semibold tracking-tighter",
          TONE_TITLE[tone],
        )}
      >
        {value}
      </div>
      {sub ? (
        <div className="text-xs leading-relaxed text-fg-muted">{sub}</div>
      ) : null}
    </div>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="group flex h-full transition-opacity hover:opacity-90"
      >
        {inner}
      </Link>
    );
  }
  return inner;
}

// ---------------------------------------------------------------------------
// Page.
// ---------------------------------------------------------------------------
export default function DashboardPage() {
  const { session, isLoading: sessionLoading, loadError } = useSession();
  const queryClient = useQueryClient();
  const now = useMemo(() => new Date(), []);

  // -------------------------------------------------------------------------
  // Parallel dashboard queries. Each signal has its own key so a future
  // tranche can invalidate independently. staleTime = 30s per DR-1.
  // -------------------------------------------------------------------------
  const queries = useQueries({
    queries: [
      {
        queryKey: QK_PLANNING_RUN,
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          fetchLatestPlanningRun(signal),
        staleTime: DASHBOARD_STALE_TIME_MS,
      },
      {
        queryKey: QK_FORECAST,
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          fetchLatestForecast(signal),
        staleTime: DASHBOARD_STALE_TIME_MS,
      },
      {
        queryKey: QK_BREAK_GLASS,
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          fetchBreakGlassState(signal),
        staleTime: HEALTH_STALE_TIME_MS,
      },
      {
        queryKey: QK_PARITY_CHECK,
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          fetchParityCheck(signal),
        staleTime: HEALTH_STALE_TIME_MS,
      },
      {
        queryKey: QK_STOCK_TRUTH,
        queryFn: () => fetchStockTruth(),
        staleTime: DASHBOARD_STALE_TIME_MS,
      },
      {
        queryKey: QK_FRESHNESS,
        queryFn: () => fetchIntegrationFreshness(),
        staleTime: DASHBOARD_STALE_TIME_MS,
      },
      {
        queryKey: QK_JOBS_HEALTH,
        queryFn: () => fetchJobsHealth24h(),
        staleTime: DASHBOARD_STALE_TIME_MS,
      },
      {
        queryKey: QK_RUNTIME_READY,
        queryFn: () => fetchRuntimeReadyRegistry(),
        staleTime: DASHBOARD_STALE_TIME_MS,
      },
    ],
  });

  const [
    planningRunQ,
    forecastQ,
    breakGlassQ,
    parityCheckQ,
    stockTruthQ,
    freshnessQ,
    jobsHealthQ,
    runtimeReadyQ,
  ] = queries;

  // Reuse Tranche B's inbox cache — no duplicate fetch per dispatch Step 3.
  const inboxRows = queryClient.getQueryData<InboxRow[]>(INBOX_CACHE_KEY);
  const inboxSummary = summarizeInbox(inboxRows);

  // -------------------------------------------------------------------------
  // Role-adapted quick actions.
  // -------------------------------------------------------------------------
  const quickActions = useMemo(
    () =>
      QUICK_ACTIONS.filter((action) =>
        authorizeCapability(session.role, action.required),
      ),
    [session.role],
  );

  // -------------------------------------------------------------------------
  // Render — header + greeting + 7 signal blocks + quick-actions launcher.
  // -------------------------------------------------------------------------
  const displayName = session.display_name.split(" (")[0] || session.email || "";
  const greeting = sessionLoading
    ? "Dashboard"
    : displayName
      ? `Welcome, ${displayName}`
      : "Dashboard";

  return (
    <>
      <WorkflowHeader
        eyebrow="GT Factory OS"
        title={greeting}
        description="Live operational signals. Click any tile to go to the relevant page."
        meta={
          <>
            <Badge tone={roleBadgeTone(session.role)} dotted>
              {session.role}
            </Badge>
            {loadError ? (
              <Badge tone="danger" variant="outline">
                session load error
              </Badge>
            ) : null}
          </>
        }
      />

      {/* -------------------------------------------------------------- */}
      {/* Block 1 — Top-row stat strip                                   */}
      {/* -------------------------------------------------------------- */}
      <SectionCard
        eyebrow="Status"
        title="Right now"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <InboxTotalCard summary={inboxSummary} />
          <CriticalExceptionsCard summary={inboxSummary} />
          <LatestPlanningRunCard signal={planningRunQ.data} now={now} />
          <BreakGlassCard signal={breakGlassQ.data} />
        </div>
      </SectionCard>

      {/* -------------------------------------------------------------- */}
      {/* Block 2 — Stock truth + parity check                          */}
      {/* -------------------------------------------------------------- */}
      <SectionCard
        eyebrow="Stock"
        title="Stock parity"
        description="Projection vs. ledger rebuild. Zero drift means stock counts can be trusted."
        className="mt-6"
      >
        <div className="space-y-4">
          <ParityCheckBlock signal={parityCheckQ.data} now={now} />
          <StockTruthBlock signal={stockTruthQ.data} now={now} />
        </div>
      </SectionCard>

      {/* -------------------------------------------------------------- */}
      {/* Block 3 — Integration freshness (hidden when pending)           */}
      {/* -------------------------------------------------------------- */}
      {freshnessQ.data && freshnessQ.data.state !== "pending_tranche_i" ? (
        <SectionCard
          eyebrow="Integrations"
          title="Data freshness"
          description="How recently each external data source was successfully synced."
          className="mt-6"
        >
          <IntegrationFreshnessBlock signal={freshnessQ.data} now={now} />
        </SectionCard>
      ) : null}

      {/* -------------------------------------------------------------- */}
      {/* Block 4 — Jobs 24h health                                      */}
      {/* -------------------------------------------------------------- */}
      <SectionCard
        eyebrow="Scheduled jobs"
        title="Last 24 hours"
        className="mt-6"
      >
        <JobsHealth24hBlock signal={jobsHealthQ.data} />
      </SectionCard>

      {/* -------------------------------------------------------------- */}
      {/* Block 5 — Latest forecast                                      */}
      {/* -------------------------------------------------------------- */}
      <SectionCard
        eyebrow="Forecast"
        title="Active forecast"
        description="The published forecast used by the planning engine."
        className="mt-6"
      >
        <LatestForecastBlock signal={forecastQ.data} now={now} />
      </SectionCard>

      {/* -------------------------------------------------------------- */}
      {/* Block 6 — RUNTIME_READY registry (hidden when pending)          */}
      {/* -------------------------------------------------------------- */}
      {runtimeReadyQ.data && runtimeReadyQ.data.state !== "pending_tranche_i" ? (
        <SectionCard
          eyebrow="Forms"
          title="Operational forms"
          description="Which forms are active and ready to use."
          className="mt-6"
        >
          <RuntimeReadyBlock signal={runtimeReadyQ.data} now={now} />
        </SectionCard>
      ) : null}

      {/* -------------------------------------------------------------- */}
      {/* Block 7 — Role-adapted quick-action launcher                   */}
      {/* -------------------------------------------------------------- */}
      <SectionCard
        eyebrow="Quick actions"
        title="Common tasks"
        className="mt-6"
      >
        {quickActions.length === 0 ? (
          <div className="text-sm text-fg-muted">
            No actions available for your current role.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {quickActions.map((a) => {
              const Icon = a.icon;
              return (
                <Link
                  key={a.href}
                  href={a.href}
                  className="group flex items-start gap-3 rounded border border-border/70 bg-bg-raised p-4 transition-colors hover:border-accent/50 hover:bg-accent-soft/40"
                  data-testid={`dashboard-quick-action-${a.category}`}
                >
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded border border-border/70 bg-bg text-accent">
                    <Icon className="h-4 w-4" strokeWidth={2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-semibold text-fg-strong">
                        {a.label}
                      </div>
                      <ArrowRight
                        className="h-3 w-3 shrink-0 text-fg-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
                        strokeWidth={2}
                      />
                    </div>
                    <div className="mt-1 text-xs leading-relaxed text-fg-muted">
                      {a.blurb}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </SectionCard>
    </>
  );
}

// ---------------------------------------------------------------------------
// Top-row stat strip cards.
// ---------------------------------------------------------------------------

function InboxTotalCard({
  summary,
}: {
  summary: Signal<{ total: number; critical: number; warning: number; info: number }>;
}) {
  if (summary.state === "unavailable") {
    return (
      <StatPill
        label="Inbox"
        value="—"
        tone="neutral"
        icon={<SignalIcon className="h-3 w-3" strokeWidth={2} />}
        sub={<span className="text-fg-muted">{summary.reason}</span>}
        testid="dashboard-stat-inbox-total"
      />
    );
  }
  if (summary.state === "pending_tranche_i") {
    return (
      <StatPill
        label="Inbox"
        value="—"
        tone="neutral"
        sub={<span className="text-fg-muted">{summary.note}</span>}
        testid="dashboard-stat-inbox-total"
      />
    );
  }
  const s = summary.data;
  const tone = s.critical > 0 ? "danger" : s.warning > 0 ? "warning" : s.total === 0 ? "success" : "neutral";
  return (
    <StatPill
      label="Inbox"
      value={s.total.toLocaleString()}
      tone={tone}
      href="/inbox"
      icon={<SignalIcon className="h-3 w-3" strokeWidth={2} />}
      sub={
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="danger" variant="soft" dotted>
            {s.critical} crit
          </Badge>
          <Badge tone="warning" variant="soft" dotted>
            {s.warning} warn
          </Badge>
          <Badge tone="info" variant="soft" dotted>
            {s.info} info
          </Badge>
        </div>
      }
      testid="dashboard-stat-inbox-total"
    />
  );
}

function CriticalExceptionsCard({
  summary,
}: {
  summary: Signal<{ total: number; critical: number; warning: number; info: number }>;
}) {
  if (summary.state === "unavailable") {
    return (
      <StatPill
        label="Critical exceptions"
        value="—"
        tone="neutral"
        icon={<AlertOctagon className="h-3 w-3" strokeWidth={2} />}
        sub={<span className="text-fg-muted">{summary.reason}</span>}
        testid="dashboard-stat-critical-exceptions"
      />
    );
  }
  if (summary.state === "pending_tranche_i") {
    return (
      <StatPill
        label="Critical exceptions"
        value="—"
        tone="neutral"
        icon={<AlertOctagon className="h-3 w-3" strokeWidth={2} />}
        sub={<span className="text-fg-muted">{summary.note}</span>}
        testid="dashboard-stat-critical-exceptions"
      />
    );
  }
  const c = summary.data.critical;
  return (
    <StatPill
      label="Critical exceptions"
      value={c.toLocaleString()}
      tone={c > 0 ? "danger" : "success"}
      href="/inbox?view=exceptions&sort=severity_then_age"
      icon={<AlertOctagon className="h-3 w-3" strokeWidth={2} />}
      sub={
        c > 0 ? (
          <span className="text-danger-fg">Triage on the inbox.</span>
        ) : (
          <span className="text-success-fg">Nothing critical right now.</span>
        )
      }
      testid="dashboard-stat-critical-exceptions"
    />
  );
}

function LatestPlanningRunCard({
  signal,
  now,
}: {
  signal: Signal<{
    run_id: string;
    executed_at: string;
    status: string;
    exceptions_count: number | null;
  }> | undefined;
  now: Date;
}) {
  if (!signal) {
    return (
      <StatPill
        label="Latest planning run"
        value="…"
        tone="neutral"
        sub={<span className="text-fg-muted">Loading.</span>}
        icon={<ListChecksIcon />}
        testid="dashboard-stat-latest-planning-run"
      />
    );
  }
  if (signal.state === "unavailable") {
    return (
      <StatPill
        label="Latest planning run"
        value="—"
        tone="neutral"
        icon={<ListChecksIcon />}
        sub={<span className="text-fg-muted">{signal.reason}</span>}
        testid="dashboard-stat-latest-planning-run"
      />
    );
  }
  if (signal.state === "pending_tranche_i") {
    return (
      <StatPill
        label="Latest planning run"
        value="—"
        tone="neutral"
        icon={<ListChecksIcon />}
        sub={<span className="text-fg-muted">{signal.note}</span>}
        testid="dashboard-stat-latest-planning-run"
      />
    );
  }
  const d = signal.data;
  if (!d.run_id) {
    return (
      <StatPill
        label="Latest planning run"
        value="—"
        tone="neutral"
        icon={<ListChecksIcon />}
        sub={<span className="text-fg-muted">No runs yet.</span>}
        testid="dashboard-stat-latest-planning-run"
      />
    );
  }
  const tone =
    d.status === "completed"
      ? "success"
      : d.status === "failed"
        ? "danger"
        : "info";
  const statusLabel =
    d.status === "completed" ? "Completed"
    : d.status === "failed" ? "Failed"
    : d.status === "running" ? "Running"
    : d.status === "draft" ? "Queued"
    : d.status === "superseded" ? "Superseded"
    : d.status;
  // DR-11 — exceptions_count from summary projection.
  const sub = (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge tone={tone} variant="soft">
        {statusLabel}
      </Badge>
      <span className="text-fg-muted">{ageHumanized(d.executed_at, now)}</span>
      {typeof d.exceptions_count === "number" ? (
        <Badge
          tone={d.exceptions_count > 0 ? "warning" : "neutral"}
          variant="outline"
        >
          {d.exceptions_count} {d.exceptions_count === 1 ? "exception" : "exceptions"}
        </Badge>
      ) : (
        <Badge tone="neutral" variant="outline">
          — exceptions
        </Badge>
      )}
    </div>
  );
  return (
    <StatPill
      label="Latest planning run"
      value={statusLabel}
      tone={tone}
      href={`/planning/runs/${encodeURIComponent(d.run_id)}`}
      icon={<ListChecksIcon />}
      sub={sub}
      testid="dashboard-stat-latest-planning-run"
    />
  );
}

function BreakGlassCard({
  signal,
}: {
  signal:
    | Signal<{ active: boolean; jobs_paused: boolean; set_at?: string; set_by?: string }>
    | undefined;
}) {
  if (!signal) {
    return (
      <StatPill
        label="Break-glass"
        value="…"
        tone="neutral"
        icon={<ShieldAlert className="h-3 w-3" strokeWidth={2} />}
        sub={<span className="text-fg-muted">Loading.</span>}
        testid="dashboard-stat-break-glass"
      />
    );
  }
  if (signal.state === "pending_tranche_i") {
    return (
      <StatPill
        label="Break-glass"
        value="—"
        tone="neutral"
        icon={<ShieldAlert className="h-3 w-3" strokeWidth={2} />}
        sub={<span className="text-fg-muted">{signal.note}</span>}
        testid="dashboard-stat-break-glass"
      />
    );
  }
  if (signal.state === "unavailable") {
    return (
      <StatPill
        label="Break-glass"
        value="—"
        tone="neutral"
        icon={<ShieldAlert className="h-3 w-3" strokeWidth={2} />}
        sub={<span className="text-fg-muted">{signal.reason}</span>}
        testid="dashboard-stat-break-glass"
      />
    );
  }
  const d = signal.data;
  // Priority: break_glass_active > jobs_paused > normal.
  const label = d.active
    ? "Read-Only Mode"
    : d.jobs_paused
      ? "Jobs Paused"
      : "Normal";
  const tone = d.active ? "danger" : d.jobs_paused ? "warning" : "success";
  return (
    <StatPill
      label="Break-glass"
      value={label}
      tone={tone}
      icon={<ShieldAlert className="h-3 w-3" strokeWidth={2} />}
      sub={
        <div className="text-xs text-fg-muted">
          {d.set_at ? (
            <div>
              Since: <span className="font-mono">{d.set_at}</span>
            </div>
          ) : null}
          {d.set_by ? (
            <div>
              By: <span className="font-mono">{d.set_by}</span>
            </div>
          ) : null}
          {!d.set_at && !d.set_by && !d.active && !d.jobs_paused ? (
            <span className="text-success-fg">All systems operational.</span>
          ) : null}
        </div>
      }
      testid="dashboard-stat-break-glass"
    />
  );
}

function ListChecksIcon() {
  return (
    <BadgeCheck className="h-3 w-3" strokeWidth={2} />
  );
}

// ---------------------------------------------------------------------------
// Parity check block (Loop 15 — live endpoint).
// ---------------------------------------------------------------------------
function ParityCheckBlock({
  signal,
  now,
}: {
  signal:
    | Signal<{ parity_ok: boolean; drift_count: number; checked_at: string }>
    | undefined;
  now: Date;
}) {
  if (!signal) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatPill
          label="Parity"
          value="…"
          tone="neutral"
          sub={<span className="text-fg-muted">Loading.</span>}
        />
      </div>
    );
  }
  if (signal.state === "pending_tranche_i") {
    return <PendingBadge note={signal.note} />;
  }
  if (signal.state === "unavailable") {
    return <UnavailableBadge reason={signal.reason} />;
  }
  const d = signal.data;
  const parityTone = d.parity_ok ? "success" : "danger";
  const parityLabel = d.parity_ok ? "Parity OK" : "Parity Drift";
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <StatPill
        label="Rebuild / parity"
        value={parityLabel}
        tone={parityTone}
        sub={
          d.parity_ok ? (
            <span className="text-success-fg">
              0 drift rows — projection matches ledger rebuild.
            </span>
          ) : (
            <span className="text-danger-fg">
              {d.drift_count.toLocaleString()} row
              {d.drift_count !== 1 ? "s" : ""} of drift — investigate before
              trusting stock.
            </span>
          )
        }
        testid="dashboard-stat-parity-status"
      />
      <StatPill
        label="Last parity check"
        value={ageHumanized(d.checked_at, now)}
        tone="neutral"
        sub={
          <span className="font-mono text-fg-muted">
            {(() => {
              try {
                return new Date(d.checked_at).toLocaleString(undefined, {
                  month: "short", day: "2-digit",
                  hour: "2-digit", minute: "2-digit",
                });
              } catch {
                return d.checked_at;
              }
            })()}
          </span>
        }
        testid="dashboard-stat-parity-checked-at"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stock truth block.
// ---------------------------------------------------------------------------
function StockTruthBlock({
  signal,
  now,
}: {
  signal:
    | Signal<{
        rebuild_verifier_drift: number | null;
        anchors_count?: number;
        last_parity_check_at?: string;
      }>
    | undefined;
  now: Date;
}) {
  if (!signal) return null;
  if (signal.state === "pending_tranche_i") return null;
  if (signal.state === "unavailable") {
    return <UnavailableBadge reason={signal.reason} />;
  }
  const d = signal.data;
  const drift = d.rebuild_verifier_drift ?? null;
  const driftTone = drift === null ? "neutral" : drift === 0 ? "success" : "danger";
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatPill
        label="Stock parity drift"
        value={drift === null ? "—" : drift.toLocaleString()}
        tone={driftTone}
        sub={
          drift === 0 ? (
            <span className="text-success-fg">
              Live projection matches ledger rebuild exactly.
            </span>
          ) : drift && drift > 0 ? (
            <span className="text-danger-fg">
              {drift} row{drift === 1 ? "" : "s"} of drift — review before trusting stock.
            </span>
          ) : (
            <span className="text-fg-muted">Not yet available.</span>
          )
        }
      />
      <StatPill
        label="Anchors"
        value={
          typeof d.anchors_count === "number"
            ? d.anchors_count.toLocaleString()
            : "—"
        }
        tone="neutral"
        sub={
          typeof d.anchors_count === "number" ? (
            <span className="text-fg-muted">
              Canonical balance points the projection rebuilds from.
            </span>
          ) : (
            <span className="text-fg-muted">Not yet exposed.</span>
          )
        }
      />
      <StatPill
        label="Last parity check"
        value={d.last_parity_check_at ? ageHumanized(d.last_parity_check_at, now) : "—"}
        tone="neutral"
        sub={
          d.last_parity_check_at ? (
            <span className="font-mono text-fg-muted">
              {d.last_parity_check_at}
            </span>
          ) : (
            <span className="text-fg-muted">Not yet exposed.</span>
          )
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Integration freshness block.
// ---------------------------------------------------------------------------
function IntegrationFreshnessBlock({
  signal,
  now,
}: {
  signal:
    | Signal<{
        rows: Array<{
          producer: string;
          last_success_at: string | null;
          state: string;
        }>;
      }>
    | undefined;
  now: Date;
}) {
  if (!signal) return null;
  if (signal.state === "pending_tranche_i") return null;
  if (signal.state === "unavailable") {
    return <UnavailableBadge reason={signal.reason} />;
  }
  const rows = signal.data.rows;
  if (rows.length === 0) {
    return (
      <div className="text-sm text-fg-muted">No producers registered yet.</div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((r) => {
        const tone =
          r.state === "fresh"
            ? "success"
            : r.state === "warning"
              ? "warning"
              : r.state === "critical" || r.state === "never_ran"
                ? "danger"
                : "neutral";
        const stateLabel =
          r.state === "fresh" ? "Fresh"
          : r.state === "warning" ? "Stale"
          : r.state === "critical" ? "Critical"
          : r.state === "never_ran" ? "Never ran"
          : r.state;
        return (
          <StatPill
            key={r.producer}
            label={r.producer}
            value={stateLabel}
            tone={tone}
            icon={<CalendarClock className="h-3 w-3" strokeWidth={2} />}
            sub={
              <div className="text-fg-muted">
                Last success:{" "}
                <span className="font-mono">
                  {r.last_success_at ? ageHumanized(r.last_success_at, now) : "never"}
                </span>
              </div>
            }
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Jobs 24h health block.
// ---------------------------------------------------------------------------
function JobsHealth24hBlock({
  signal,
}: {
  signal:
    | Signal<{
        successes: number;
        failures: number;
        skipped: number;
        last_failure_reason?: string;
      }>
    | undefined;
}) {
  if (!signal) return <span className="text-fg-muted text-sm">Loading.</span>;
  if (signal.state === "pending_tranche_i") {
    return <PendingBadge note={signal.note} />;
  }
  if (signal.state === "unavailable") {
    return <UnavailableBadge reason={signal.reason} />;
  }
  const d = signal.data;
  // DR-12 truncation applied on the last_failure_reason string.
  const lastErr = truncateLastError(d.last_failure_reason ?? null);
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatPill
          label="Successes"
          value={d.successes.toLocaleString()}
          tone="success"
        />
        <StatPill
          label="Failures"
          value={d.failures.toLocaleString()}
          tone={d.failures > 0 ? "danger" : "neutral"}
        />
        <StatPill
          label="Skipped"
          value={d.skipped.toLocaleString()}
          tone="neutral"
          sub={
            <span className="text-fg-muted">
              Break-glass / precondition skips — not a failure.
            </span>
          }
        />
      </div>
      {lastErr ? (
        <div className="mt-3 rounded border border-danger/30 bg-danger-softer px-3 py-2 text-xs">
          <div className="font-semibold text-danger-fg">
            Last failure reason
          </div>
          <div
            className="mt-1 whitespace-pre-wrap break-words font-mono text-danger-fg"
            data-testid="dashboard-jobs-last-error"
          >
            {lastErr}
          </div>
        </div>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Latest forecast block.
// ---------------------------------------------------------------------------
function LatestForecastBlock({
  signal,
  now,
}: {
  signal:
    | Signal<{
        version_id: string;
        cadence: string | null;
        horizon_weeks: number | null;
        horizon_start_at: string | null;
        published_at: string | null;
        status: string;
      }>
    | undefined;
  now: Date;
}) {
  if (!signal) return <span className="text-fg-muted text-sm">Loading.</span>;
  if (signal.state === "pending_tranche_i") {
    return <PendingBadge note={signal.note} />;
  }
  if (signal.state === "unavailable") {
    return <UnavailableBadge reason={signal.reason} />;
  }
  const d = signal.data;
  if (!d.version_id) {
    return (
      <div className="text-sm text-fg-muted">No published forecast yet.</div>
    );
  }
  // DR-7: read `cadence` column verbatim; display em-dash when null.
  const cadenceDisplay = d.cadence ?? "—";
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatPill
        label="Version"
        value={
          <span
            className="font-mono text-sm"
            data-testid="dashboard-forecast-version-id"
            title={d.version_id}
          >
            {d.version_id.slice(0, 8)}…
          </span>
        }
        tone="neutral"
        href={`/planning/forecast/${encodeURIComponent(d.version_id)}`}
      />
      <StatPill
        label="Cadence"
        value={cadenceDisplay}
        tone="info"
      />
      <StatPill
        label="Horizon"
        value={d.horizon_weeks ? `${d.horizon_weeks}w` : "—"}
        tone="neutral"
        sub={
          d.horizon_start_at ? (
            <span className="text-fg-muted">
              starting {fmtDateShort(d.horizon_start_at)}
            </span>
          ) : null
        }
      />
      <StatPill
        label="Published"
        value={ageHumanized(d.published_at, now)}
        tone="neutral"
        sub={
          d.published_at ? (
            <span className="text-fg-muted">{fmtDateShort(d.published_at)}</span>
          ) : null
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// RUNTIME_READY registry block.
// ---------------------------------------------------------------------------
function RuntimeReadyBlock({
  signal,
  now,
}: {
  signal:
    | Signal<{
        rows: Array<{ signal_name: string; emitted_at: string }>;
      }>
    | undefined;
  now: Date;
}) {
  if (!signal) return <span className="text-fg-muted text-sm">Loading.</span>;
  if (signal.state === "pending_tranche_i") {
    return <PendingBadge note={signal.note} />;
  }
  if (signal.state === "unavailable") {
    return <UnavailableBadge reason={signal.reason} />;
  }
  const rows = signal.data.rows;
  if (rows.length === 0) {
    return <div className="text-sm text-fg-muted">No forms cleared for use yet.</div>;
  }
  return (
    <ul className="divide-y divide-border/60 rounded border border-border/60">
      {rows.map((r) => {
        const label = r.signal_name
          .replace(/^RUNTIME_READY\(/, "")
          .replace(/\)$/, "")
          .replace(/([A-Z])/g, " $1")
          .trim();
        return (
          <li
            key={r.signal_name}
            className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success-fg" strokeWidth={2} />
              <span className="font-medium text-fg">{label}</span>
            </div>
            <span className="text-xs text-fg-muted" title={r.emitted_at}>
              cleared {ageHumanized(r.emitted_at, now)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
