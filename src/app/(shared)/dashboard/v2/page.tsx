"use client";

// ---------------------------------------------------------------------------
// /dashboard/v2 — Control Tower v2 morning view (MVP).
//
// Authored under Mode B-Planning-Corridor for tranche
// "dashboard-v2-critical-today-and-slipped-plans" (2026-05-02), authorized by:
//   - signal #23 RUNTIME_READY(DashboardCriticalToday) (W1, 2026-05-02T03:35Z)
//   - signal #24 RUNTIME_READY(DashboardSlippedPlans)  (W1, 2026-05-02T03:36Z)
//
// Per W4 dashboard control tower v2 spec
// (docs/integrations/dashboard_control_tower_v2_coverage_requirements.md):
//   - §4.1 Critical Today block — LIVE (consumes /api/dashboard/critical-today)
//   - §4.4 Slipped Plans block  — LIVE (consumes /api/dashboard/slipped-plans)
//   - §4.2/§4.3/§4.5/§4.6/§4.7/§4.8/§4.9 — placeholder cards
//     ("Coming next" + "Awaiting read-model" badge) until the corresponding
//     W1 read-model is exposed via a portal proxy. Honest empty-not-fake state.
//   - §7 Quick actions row — LIVE, links to existing surfaces.
//   - §5.12 Universal break-glass banner — LIVE (consumes /api/system/break-glass).
//   - DCT2-8 default: ships at NEW route /dashboard/v2; existing /dashboard
//     7-block page remains untouched.
//
// 2026-05-02 P1-1 closure — placeholder dominance fix:
//   - 7 placeholder cards moved below the two live blocks into a
//     default-collapsed disclosure ("7 dashboard blocks awaiting read-model").
//   - Above-the-fold real estate now belongs to: header + quick actions +
//     break-glass banner (if any) + Critical Today + Slipped Plans.
//   - Operator answers "what needs my attention today" in <5 seconds.
//
// English-only, LTR. Mobile usable @ 390px (vertical reflow; no horizontal
// scroll except where authorized in §6.5).
//
// No backend authoring. Mirror-only proxies under src/app/api/dashboard/**.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Clock,
  ExternalLink,
  Flame,
  Inbox as InboxIcon,
  Layers,
  ListChecks,
  PackageOpen,
  Plug,
  RefreshCw,
  ShieldAlert,
  TrendingDown,
} from "lucide-react";

import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { useSession } from "@/lib/auth/session-provider";
import { authorizeCapability } from "@/lib/auth/authorize";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Cadence — keep low for the morning view; refresh on tab focus is the default.
// ---------------------------------------------------------------------------
const STALE_TIME_MS = 60_000;

// ---------------------------------------------------------------------------
// Cache keys — namespaced under dashboard-v2 so they never collide with
// the existing /dashboard cache.
// ---------------------------------------------------------------------------
const QK_CRITICAL_TODAY = ["dashboard-v2", "critical-today"] as const;
const QK_SLIPPED_PLANS = ["dashboard-v2", "slipped-plans"] as const;
const QK_BREAK_GLASS = ["dashboard-v2", "break-glass"] as const;

// ---------------------------------------------------------------------------
// Response types — mirror the W1 schemas at api/src/dashboard/schemas.ts
// verbatim. detail_jsonb is intentionally `unknown` (PBR-3 opaque payload).
// ---------------------------------------------------------------------------
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
// Time helpers — relative ("3h ago") + absolute tooltip.
// ---------------------------------------------------------------------------
function fmtRelative(iso: string | null | undefined, now: Date): string {
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

function fmtPlanDate(yyyymmdd: string): string {
  // plan_date is delivered as 'YYYY-MM-DD' string. Render as e.g. "Apr 28".
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyymmdd)) return yyyymmdd;
  try {
    const [y, m, d] = yyyymmdd.split("-").map((s) => parseInt(s, 10));
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.toLocaleDateString(undefined, {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  } catch {
    return yyyymmdd;
  }
}

// ---------------------------------------------------------------------------
// Fetch helpers — mirror the existing dashboard pattern (return null on error
// so blocks render their own error state, not throw).
// ---------------------------------------------------------------------------
async function fetchJson<T>(
  url: string,
  signal?: AbortSignal,
): Promise<T | null> {
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) {
    // Throw so TanStack Query records the error and we can render error state.
    const text = await res.text().catch(() => "");
    throw new Error(
      `HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
    );
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Critical-today helpers — render hints derived from trigger_kind +
// detail_jsonb. detail_jsonb is opaque (PBR-3); we pull a small set of
// well-known optional keys per trigger_kind without inventing values.
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
      const body = category
        ? `Planning blocker: ${category}.`
        : "Planning fail-hard exception.";
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
      const body = flagKey
        ? `Active flag: ${flagKey}.`
        : "Break-glass mode is active.";
      return {
        body,
        link: {
          href: "/admin/integrations#break-glass",
          label: "Open break-glass",
        },
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
// Skeleton row.
// ---------------------------------------------------------------------------
function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 rounded border border-border/60 bg-bg-subtle px-3 py-3">
      <div className="h-3 w-20 animate-pulse rounded bg-border/60" />
      <div className="h-3 w-40 flex-1 animate-pulse rounded bg-border/60" />
      <div className="h-3 w-16 animate-pulse rounded bg-border/60" />
    </div>
  );
}

function ErrorState({
  label,
  onRetry,
}: {
  label: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="flex items-start gap-3 rounded border border-danger/40 bg-danger-softer px-3 py-3 text-xs text-danger-fg"
      role="alert"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{label}</div>
        <div className="mt-0.5 leading-relaxed text-fg-muted">
          Try again.
        </div>
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

function EmptyState({
  icon,
  title,
  description,
  tone = "info",
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  tone?: "info" | "success";
}) {
  const TONE: Record<typeof tone, string> = {
    info: "border-info/40 bg-info-softer text-info-fg",
    success: "border-success/40 bg-success-softer text-success-fg",
  };
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded border px-3 py-3 text-xs",
        TONE[tone],
      )}
    >
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="font-semibold">{title}</div>
        <div className="mt-0.5 leading-relaxed text-fg-muted">
          {description}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Critical Today block (§4.1).
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
      eyebrow="§4.1"
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
            Source: <code className="font-mono">api_read.v_critical_today</code> ·
            updated {fmtRelative(asOf, now)}
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
        <ErrorState
          label="Critical issues unavailable."
          onRetry={() => query.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          tone="success"
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
                  <div className="text-sm font-semibold text-fg-strong">
                    {row.display_name}
                  </div>
                  {hint.body ? (
                    <div className="mt-0.5 text-xs leading-relaxed text-fg-muted">
                      {hint.body}
                    </div>
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
// Slipped Plans block (§4.4).
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
      eyebrow="§4.4"
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
        <ErrorState
          label="Slipped plans unavailable."
          onRetry={() => query.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          tone="success"
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
              row.days_overdue === 1
                ? "1 day overdue"
                : `${row.days_overdue} days overdue`;
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
                    Planned: <span className="font-mono">{row.planned_qty}</span>{" "}
                    {row.uom}
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
// Placeholder card for the seven blocks not yet wired to a read-model.
// Honest empty-not-fake state per §5 + §10 of the dashboard spec — no mock
// data, no fabricated counts.
// ---------------------------------------------------------------------------
function PlaceholderBlock({
  section,
  title,
  description,
  icon,
}: {
  section: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <SectionCard
      eyebrow={section}
      title={
        <span className="inline-flex items-center gap-2 text-fg-muted">
          {icon}
          {title}
        </span>
      }
      description={description}
    >
      <div className="flex items-start gap-3 rounded border border-border/60 bg-bg-subtle px-3 py-3 text-xs text-fg-muted">
        <CircleDashed
          className="mt-0.5 h-4 w-4 shrink-0 text-fg-faint"
          strokeWidth={2}
        />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-fg-muted">Coming next.</div>
          <div className="mt-0.5 leading-relaxed">
            This block will light up when its read-model is exposed on the
            portal proxy. No mock data is shown until then.
          </div>
        </div>
        <Badge tone="neutral" variant="outline">
          Awaiting read-model
        </Badge>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Quick-action button (§7.1). Visibility-based role gate (hide, do not disable).
// ---------------------------------------------------------------------------
interface QuickAction {
  href: string;
  label: string;
  icon: React.ReactNode;
  capability: Parameters<typeof authorizeCapability>[1];
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    href: "/planning/runs",
    label: "Run planning",
    icon: <ListChecks className="h-4 w-4" strokeWidth={2} />,
    capability: "planning:execute",
  },
  {
    href: "/planning/production-plan",
    label: "Production plan",
    icon: <Layers className="h-4 w-4" strokeWidth={2} />,
    capability: "planning:read",
  },
  {
    href: "/exceptions",
    label: "Exceptions",
    icon: <ShieldAlert className="h-4 w-4" strokeWidth={2} />,
    capability: "viewer:read",
  },
  {
    href: "/inbox",
    label: "Inbox",
    icon: <InboxIcon className="h-4 w-4" strokeWidth={2} />,
    capability: "viewer:read",
  },
];

// ---------------------------------------------------------------------------
// Page.
// ---------------------------------------------------------------------------
export default function DashboardV2Page() {
  const { session } = useSession();
  const now = useMemo(() => new Date(), []);

  const role = session?.role ?? "viewer";
  const visibleActions = QUICK_ACTIONS.filter((a) =>
    authorizeCapability(role, a.capability),
  );

  // P1-1 closure — placeholder grid is default-collapsed below the live
  // blocks so above-the-fold belongs to Critical Today + Slipped Plans.
  // Tom answers "what needs my attention today" in <5 seconds.
  const [placeholderOpen, setPlaceholderOpen] = useState(false);

  // Universal break-glass surface (§5.12 + DCT2-2 dual-surface rule). Reads
  // the existing /api/system/break-glass proxy. The break-glass *row* in the
  // §4.1 block is the operational double-surface; this banner is the
  // session-persistent affirmation.
  const breakGlassQuery = useQuery({
    queryKey: QK_BREAK_GLASS,
    queryFn: ({ signal }) =>
      fetchJson<BreakGlassResponse>("/api/system/break-glass", signal),
    staleTime: STALE_TIME_MS,
  });
  const bg = breakGlassQuery.data;
  const breakGlassActive =
    bg?.break_glass_active === true || bg?.jobs_paused === true;

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <WorkflowHeader
        eyebrow="Control tower v2"
        title="Control tower"
        description="Morning view · what needs your attention today."
        meta={
          <>
            <Badge tone="info" variant="soft" dotted>
              v2 · partial coverage
            </Badge>
            <Badge tone="neutral" variant="outline">
              2 live blocks · 7 awaiting read-model
            </Badge>
          </>
        }
        actions={
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 text-xs font-semibold text-fg-muted hover:underline"
          >
            Back to v1 dashboard
            <ExternalLink className="h-3 w-3" strokeWidth={2} />
          </Link>
        }
      >
        {visibleActions.length > 0 ? (
          <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0">
            {visibleActions.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="inline-flex shrink-0 items-center gap-2 rounded border border-border/70 bg-bg-raised px-3 py-2 text-xs font-semibold text-fg-strong hover:border-accent/60 hover:bg-accent-soft hover:text-accent"
              >
                {a.icon}
                {a.label}
              </Link>
            ))}
          </div>
        ) : null}
      </WorkflowHeader>

      {breakGlassActive ? (
        <div
          className="flex items-start gap-3 rounded border border-warning/60 bg-warning-softer px-4 py-3 text-sm text-warning-fg"
          role="alert"
        >
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0 text-warning"
            strokeWidth={2}
          />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">
              System is in break-glass read-only mode.
            </div>
            <div className="mt-0.5 text-xs leading-relaxed text-fg-muted">
              Writes paused. Jobs paused. Reads continue. See the Critical today
              block for the trigger row, or open Integrations to release.
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
      ) : null}

      {/* Live blocks — above the fold. */}
      <CriticalTodayBlock now={now} />
      <SlippedPlansBlock now={now} />

      {/* Placeholder cards — collapsed by default. P1-1 closure. */}
      <section
        className="rounded border border-border/60 bg-bg-raised"
        data-testid="dashboard-v2-placeholders"
        data-open={placeholderOpen ? "true" : "false"}
      >
        <button
          type="button"
          onClick={() => setPlaceholderOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-bg-subtle/50"
          aria-expanded={placeholderOpen}
          aria-controls="dashboard-v2-placeholder-grid"
          data-testid="dashboard-v2-placeholders-toggle"
        >
          <div className="flex items-center gap-2">
            {placeholderOpen ? (
              <ChevronDown
                className="h-4 w-4 shrink-0 text-fg-muted"
                strokeWidth={2}
              />
            ) : (
              <ChevronRight
                className="h-4 w-4 shrink-0 text-fg-muted"
                strokeWidth={2}
              />
            )}
            <span className="text-sm font-semibold text-fg-strong">
              Coming next
            </span>
            <Badge tone="neutral" variant="outline">
              7 blocks awaiting read-model
            </Badge>
          </div>
          <span className="text-xs text-fg-muted">
            {placeholderOpen ? "Hide" : "Show"}
          </span>
        </button>
        {placeholderOpen ? (
          <div
            id="dashboard-v2-placeholder-grid"
            className="grid grid-cols-1 gap-4 border-t border-border/40 p-4 sm:gap-6 lg:grid-cols-2"
          >
            <PlaceholderBlock
              section="§4.2"
              title="This-week FG stock risk"
              description="FG items that may run out in the next 7–14 days."
              icon={<TrendingDown className="h-4 w-4" strokeWidth={2} />}
            />
            <PlaceholderBlock
              section="§4.3"
              title="This-week planned production"
              description="Production planned for the next 7 days, by day."
              icon={<Layers className="h-4 w-4" strokeWidth={2} />}
            />
            <PlaceholderBlock
              section="§4.5"
              title="Open POs due this week"
              description="Incoming POs scheduled to receive in the next 7 days."
              icon={<PackageOpen className="h-4 w-4" strokeWidth={2} />}
            />
            <PlaceholderBlock
              section="§4.6"
              title="Blocked production"
              description="Items where production is blocked by master-data gaps."
              icon={<ShieldAlert className="h-4 w-4" strokeWidth={2} />}
            />
            <PlaceholderBlock
              section="§4.7"
              title="Blocked purchase"
              description="Items where purchase is blocked by supplier-mapping gaps."
              icon={<ShieldAlert className="h-4 w-4" strokeWidth={2} />}
            />
            <PlaceholderBlock
              section="§4.8"
              title="Integration freshness"
              description="Last successful pull/push per integration producer."
              icon={<Plug className="h-4 w-4" strokeWidth={2} />}
            />
            <PlaceholderBlock
              section="§4.9"
              title="Top-5 exceptions"
              description="Highest-severity unresolved exceptions, with deep links."
              icon={<Clock className="h-4 w-4" strokeWidth={2} />}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}
