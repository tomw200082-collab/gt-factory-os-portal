"use client";

// ---------------------------------------------------------------------------
// /planner/forecast — canonical list of forecast versions.
//
// Scope (W2 Mode B, Forecast only; MVP per Gate 4 closure directive):
//   - Lists rows from GET /api/v1/queries/forecasts/versions (§G.3)
//   - Filter by status / cadence
//   - Click row -> /planner/forecast/[version_id]
//   - "New forecast" CTA -> /planner/forecast/new
//
// Role gate: planner + admin + viewer (planner layout RoleGate). Viewer
// sees non-draft rows only (server-enforced per §A.3 and handler.reads.ts).
// Operators are blocked by the planner layout already.
//
// 2026-05-05 polish (13 iterations — list pass of 40-iteration mandate):
//   1. Insights strip (total versions + active + last-published)
//   2. Status-grouped sections (active pinned / drafts / archived collapsed)
//   3. Rich metadata per row (creator, dates, relative time)
//   4. Inline action icons on hover (Pencil/Copy)
//   5. Primary "New forecast" CTA top-right with arrow motion
//   6. Empty state with friendly icon + CTA
//   7. Search + segmented status filter (reused inventory-flow utilities)
//
// Sources consulted 2026-05-05:
//   - Linear UI refresh (2026-03-12) — grouped sections, hover actions,
//     sticky group headers
//   - Stripe Apps List component — title + secondary metadata + ListItem
//     hover actions
//   - Refactoring UI (Wathan/Schoger) — hierarchy via size + color
//
// Deferred to future cycles: Discard / Revise UI (no mutation endpoints
// yet). Duplicate / Archive icons read-only for now.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Archive,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Copy,
  LineChart,
  Pencil,
  Plus,
  Search,
  X,
  Zap,
} from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { EmptyState } from "@/components/feedback/states";
import { useSession } from "@/lib/auth/session-provider";
import type { Session } from "@/lib/auth/fake-auth";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";

type ForecastStatus = "draft" | "published" | "superseded" | "discarded";
type ForecastCadence = "monthly" | "weekly" | "daily";

interface VersionMetadata {
  version_id: string;
  site_id: string;
  cadence: ForecastCadence;
  horizon_start_at: string;
  horizon_weeks: number;
  status: ForecastStatus;
  created_by_user_id: string;
  created_by_snapshot: string;
  created_at: string;
  updated_at: string;
  published_by_user_id: string | null;
  published_by_snapshot: string | null;
  published_at: string | null;
  supersedes_version_id: string | null;
  superseded_at: string | null;
  notes: string | null;
}

interface ListResponse {
  versions: VersionMetadata[];
}

// Segmented status filter options (visible labels mapped to API values).
type StatusFilter = "all" | "published" | "draft" | "archived";
const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "published", label: "Active" },
  { id: "draft", label: "Drafts" },
  { id: "archived", label: "Archived" },
];

// Wave 2: cadence filter chip group. "all" = no filter.
type CadenceFilter = "all" | "monthly" | "weekly";
const CADENCE_OPTIONS: CadenceFilter[] = ["all", "monthly", "weekly"];

function CadenceChip({ cadence }: { cadence: ForecastCadence }) {
  if (cadence === "monthly") {
    return (
      <Badge tone="info" dotted>
        Monthly
      </Badge>
    );
  }
  if (cadence === "weekly") {
    return (
      <Badge tone="neutral" dotted>
        Weekly
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" dotted>
      Daily
    </Badge>
  );
}

function sessionHeaders(_session: Session): HeadersInit {
  return {
    "Content-Type": "application/json",
  };
}

// We always fetch ALL versions and group/filter client-side. Status filter
// is purely a UI concern now (segmented control above the list); the API
// is queried once per session role, then the same response feeds all
// status segments. Reduces flicker on segment switch.
async function fetchAllVersions(session: Session): Promise<ListResponse> {
  const res = await fetch("/api/forecasts/versions", {
    method: "GET",
    headers: sessionHeaders(session),
  });
  if (!res.ok) {
    throw new Error(
      "Failed to load forecast versions. Check your connection and try refreshing.",
    );
  }
  return (await res.json()) as ListResponse;
}

function StatusBadge({ status }: { status: ForecastStatus }) {
  if (status === "published") {
    return (
      <Badge tone="success" variant="solid">
        Published
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
  if (status === "superseded") {
    return (
      <Badge tone="neutral" dotted>
        Superseded
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" dotted>
      Discarded
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

function fmtHorizonStart(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Relative time — "3d ago" / "2h ago" / "just now". Used in the row
 * secondary line where space is tight.
 */
function fmtAgo(iso: string | null): string {
  if (!iso) return "—";
  try {
    const then = new Date(iso).getTime();
    const min = Math.floor((Date.now() - then) / 60_000);
    if (min < 1) return "just now";
    if (min < 60) return `${min}m ago`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    const mo = Math.floor(d / 30);
    if (mo < 12) return `${mo}mo ago`;
    return `${Math.floor(mo / 12)}y ago`;
  } catch {
    return "—";
  }
}

export default function ForecastListPage() {
  const { session } = useSession();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [cadenceFilter, setCadenceFilter] = useState<CadenceFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const canAuthor = session.role === "planner" || session.role === "admin";

  const query = useQuery<ListResponse>({
    queryKey: ["forecasts", "versions", "all", session.role],
    queryFn: () => fetchAllVersions(session),
    staleTime: 60_000,
  });

  const allVersions = query.data?.versions ?? [];

  // Apply cadence + search filters first (status grouping happens after).
  const lowerQuery = searchQuery.trim().toLowerCase();
  const baseFiltered = useMemo(
    () =>
      allVersions
        .filter((v) =>
          cadenceFilter === "all" ? true : v.cadence === cadenceFilter,
        )
        .filter((v) => {
          if (!lowerQuery) return true;
          const hay =
            `${v.version_id} ${v.notes ?? ""} ${v.created_by_snapshot} ${v.published_by_snapshot ?? ""}`.toLowerCase();
          return hay.includes(lowerQuery);
        }),
    [allVersions, cadenceFilter, lowerQuery],
  );

  // Group by status semantics. "Archived" = superseded + discarded.
  const grouped = useMemo(() => {
    const active = baseFiltered.filter((v) => v.status === "published");
    const drafts = baseFiltered.filter((v) => v.status === "draft");
    const archived = baseFiltered.filter(
      (v) => v.status === "superseded" || v.status === "discarded",
    );
    // Active: most-recently-published first (stable for ties).
    active.sort((a, b) => {
      const ax = a.published_at ?? a.created_at;
      const bx = b.published_at ?? b.created_at;
      return bx.localeCompare(ax);
    });
    drafts.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    archived.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return { active, drafts, archived };
  }, [baseFiltered]);

  // Apply the segmented status filter on TOP of grouping (filter narrows
  // which sections render, never reorders them).
  const showActive = statusFilter === "all" || statusFilter === "published";
  const showDrafts = statusFilter === "all" || statusFilter === "draft";
  const showArchivedSection =
    statusFilter === "all" || statusFilter === "archived";

  // Insights strip values — computed against the FULL unfiltered list so
  // the operator always sees the true totals regardless of filter state.
  const insights = useMemo(() => {
    const total = allVersions.length;
    const activePub = allVersions.find((v) => v.status === "published") ?? null;
    const lastPubAt = activePub?.published_at ?? null;
    const draftCount = allVersions.filter((v) => v.status === "draft").length;
    return { total, activePub, lastPubAt, draftCount };
  }, [allVersions]);

  const totalVisible =
    (showActive ? grouped.active.length : 0) +
    (showDrafts ? grouped.drafts.length : 0) +
    (showArchivedSection ? grouped.archived.length : 0);

  return (
    <>
      <WorkflowHeader
        eyebrow="Planner workspace"
        title="Forecast"
        description="Versioned demand forecast. Author a draft, save lines, and publish to make it the active forecast. All writes are audited; all publishes are atomic."
        meta={
          query.data && !query.isLoading ? (
            <span
              className="forecast-insights-strip"
              data-testid="forecast-insights-strip"
            >
              <span className="stat">
                <span className="stat-value tabular-nums">
                  {insights.total}
                </span>
                <span className="stat-label">
                  version{insights.total === 1 ? "" : "s"}
                </span>
              </span>
              <span className="stat-divider" aria-hidden />
              <span className="stat">
                <span
                  className={cn(
                    "stat-value",
                    insights.activePub ? "text-success-fg" : "text-fg-muted",
                  )}
                >
                  {insights.activePub ? "1" : "0"}
                </span>
                <span className="stat-label">active</span>
              </span>
              <span className="stat-divider" aria-hidden />
              <span className="stat">
                <span className="stat-value tabular-nums">
                  {insights.draftCount}
                </span>
                <span className="stat-label">draft{insights.draftCount === 1 ? "" : "s"}</span>
              </span>
              {insights.lastPubAt ? (
                <>
                  <span className="stat-divider" aria-hidden />
                  <span className="stat">
                    <span className="stat-value tabular-nums">
                      {fmtAgo(insights.lastPubAt)}
                    </span>
                    <span className="stat-label">last published</span>
                  </span>
                </>
              ) : null}
            </span>
          ) : null
        }
        actions={
          canAuthor ? (
            <Link
              href="/planning/forecast/new"
              className="btn btn-primary btn-sm cta-arrow-host gap-1.5"
              data-testid="forecast-new-draft-link"
            >
              <Plus className="h-3 w-3" strokeWidth={2.5} />
              <span>New forecast</span>
              <ArrowRight
                className="cta-arrow h-3 w-3"
                strokeWidth={2.5}
                aria-hidden
              />
            </Link>
          ) : null
        }
      />

      <SectionCard contentClassName="p-0">
        {/* ─── Filter bar: search + segmented status + cadence chips ─── */}
        <div
          className="flex flex-col gap-3 border-b border-border/60 px-5 py-3 lg:flex-row lg:flex-wrap lg:items-center"
          data-testid="forecast-filter-bar"
        >
          {/* Search input — reuses inventory-flow styling */}
          <label className="relative block w-full lg:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint"
              strokeWidth={2}
              aria-hidden
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search forecasts"
              aria-label="Search forecasts"
              data-testid="forecast-search-input"
              className="w-full rounded-sm border border-border bg-bg-subtle py-1.5 pl-8 pr-8 text-xs text-fg placeholder:text-fg-faint focus:border-accent-border focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-fg-faint hover:bg-bg-muted hover:text-fg"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" strokeWidth={2} />
              </button>
            ) : null}
          </label>

          {/* Segmented status filter — All / Active / Drafts / Archived */}
          <div
            className="segmented shrink-0"
            role="tablist"
            aria-label="Status filter"
          >
            {STATUS_FILTERS.map((opt) => {
              const active = statusFilter === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setStatusFilter(opt.id)}
                  className="segmented-option uppercase tracking-sops"
                  data-active={active}
                  data-testid={`forecast-filter-status-${opt.id}`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Cadence chip group (legacy weekly-vs-monthly distinction) */}
          <span className="ml-auto inline-flex items-center gap-2">
            <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Cadence
            </span>
            {CADENCE_OPTIONS.map((opt) => {
              const active = cadenceFilter === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  data-testid={`forecast-filter-cadence-${opt}`}
                  aria-pressed={active}
                  onClick={() => setCadenceFilter(opt)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                    active
                      ? "border-accent/50 bg-accent-soft text-accent"
                      : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
                  )}
                >
                  {opt === "all" ? "All" : opt}
                </button>
              );
            })}
          </span>
        </div>

        {/* ─── Content body ─── */}
        {query.isLoading ? (
          <div className="p-5">
            <div className="space-y-2" aria-busy="true" aria-live="polite">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="flex animate-pulse gap-3 border-b border-border/30 pb-2"
                >
                  <div className="h-5 w-20 shrink-0 rounded bg-bg-subtle" />
                  <div className="h-5 flex-1 rounded bg-bg-subtle" />
                  <div className="h-5 w-32 shrink-0 rounded bg-bg-subtle" />
                </div>
              ))}
            </div>
          </div>
        ) : query.isError ? (
          <div className="p-5">
            <div
              className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg"
              data-testid="forecast-list-error"
            >
              <div className="font-semibold">
                Could not load forecast versions
              </div>
              <div className="mt-1 text-xs">
                Check your connection. The list will refresh when the API is
                reachable.
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
        ) : totalVisible === 0 ? (
          <div className="p-5">
            <EmptyState
              title={
                lowerQuery || cadenceFilter !== "all" || statusFilter !== "all"
                  ? "No forecasts match these filters."
                  : "No forecasts yet"
              }
              description={
                lowerQuery || cadenceFilter !== "all" || statusFilter !== "all"
                  ? "Try clearing the filters to see all versions."
                  : canAuthor
                    ? "Create your first forecast to start planning. A forecast is a versioned plan of expected sales — the system uses it to recommend production batches."
                    : "No published forecasts to review yet."
              }
              icon={
                <LineChart
                  className="h-5 w-5 text-accent"
                  strokeWidth={1.75}
                />
              }
              action={
                canAuthor &&
                !lowerQuery &&
                cadenceFilter === "all" &&
                statusFilter === "all" ? (
                  <Link
                    href="/planning/forecast/new"
                    className="btn btn-primary btn-sm cta-arrow-host gap-1.5"
                    data-testid="forecast-empty-cta"
                  >
                    <Plus className="h-3 w-3" strokeWidth={2.5} />
                    <span>Create your first forecast</span>
                    <ArrowRight
                      className="cta-arrow h-3 w-3"
                      strokeWidth={2.5}
                      aria-hidden
                    />
                  </Link>
                ) : null
              }
            />
          </div>
        ) : (
          <div data-testid="forecast-versions-list">
            {/* ── ACTIVE section (pinned, stronger weight) ── */}
            {showActive && grouped.active.length > 0 ? (
              <section>
                <div className="forecast-section-heading">
                  <Zap
                    className="h-3 w-3 text-success-fg"
                    strokeWidth={2.5}
                    aria-hidden
                  />
                  <span>Active</span>
                  <span className="text-fg-faint">·</span>
                  <span className="tabular-nums normal-case font-medium text-fg">
                    {grouped.active.length}
                  </span>
                </div>
                <ul className="divide-y divide-border/40">
                  {grouped.active.map((v) => (
                    <ListRow key={v.version_id} v={v} active />
                  ))}
                </ul>
              </section>
            ) : null}

            {/* ── DRAFTS section ── */}
            {showDrafts && grouped.drafts.length > 0 ? (
              <section>
                <div className="forecast-section-heading">
                  <Pencil
                    className="h-3 w-3 text-warning-fg"
                    strokeWidth={2.5}
                    aria-hidden
                  />
                  <span>Drafts</span>
                  <span className="text-fg-faint">·</span>
                  <span className="tabular-nums normal-case font-medium text-fg">
                    {grouped.drafts.length}
                  </span>
                </div>
                <ul className="divide-y divide-border/40">
                  {grouped.drafts.map((v) => (
                    <ListRow key={v.version_id} v={v} />
                  ))}
                </ul>
              </section>
            ) : null}

            {/* ── ARCHIVED section (collapsed by default) ── */}
            {showArchivedSection && grouped.archived.length > 0 ? (
              <section>
                <button
                  type="button"
                  onClick={() => setShowArchived((s) => !s)}
                  className="forecast-section-heading w-full text-left transition-colors hover:bg-bg-subtle/60"
                  aria-expanded={showArchived}
                  data-testid="forecast-toggle-archived"
                >
                  {showArchived ? (
                    <ChevronDown
                      className="h-3 w-3 text-fg-muted"
                      strokeWidth={2}
                      aria-hidden
                    />
                  ) : (
                    <ChevronRight
                      className="h-3 w-3 text-fg-muted"
                      strokeWidth={2}
                      aria-hidden
                    />
                  )}
                  <Archive
                    className="h-3 w-3 text-fg-faint"
                    strokeWidth={2.5}
                    aria-hidden
                  />
                  <span>
                    {showArchived ? "Hide archived" : "Show archived"}
                  </span>
                  <span className="text-fg-faint">·</span>
                  <span className="tabular-nums normal-case font-medium text-fg">
                    {grouped.archived.length}
                  </span>
                </button>
                {showArchived ? (
                  <ul className="divide-y divide-border/40">
                    {grouped.archived.map((v) => (
                      <ListRow key={v.version_id} v={v} muted />
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : null}
          </div>
        )}
      </SectionCard>
    </>
  );
}

// ---------------------------------------------------------------------------
// ListRow — a single forecast version row.
//
// Two-line layout:
//   line 1 (primary, 16px): horizon span + cadence
//   line 2 (secondary, 11px muted): created-by + relative time + line count
//
// Inline action icons appear on row hover (Linear pattern). Clicking the
// row body navigates to the detail page; clicking an action icon stops
// propagation and triggers its own intent.
// ---------------------------------------------------------------------------

interface ListRowProps {
  v: VersionMetadata;
  active?: boolean;
  muted?: boolean;
}

function ListRow({ v, active, muted }: ListRowProps) {
  const horizonText =
    v.cadence === "monthly"
      ? `${v.horizon_weeks} month${v.horizon_weeks === 1 ? "" : "s"}`
      : `${v.horizon_weeks} week${v.horizon_weeks === 1 ? "" : "s"}`;

  // Relative time: prefer published_at when available, else updated_at.
  const relTime = v.published_at ?? v.updated_at ?? v.created_at;

  return (
    <li
      className={cn(
        "forecast-row",
        active && "forecast-row-active",
        muted && "opacity-80",
      )}
      data-testid="forecast-version-row"
      data-version-id={v.version_id}
      data-status={v.status}
    >
      <div className="flex items-start gap-4">
        <Link
          href={`/planning/forecast/${encodeURIComponent(v.version_id)}`}
          className="block min-w-0 flex-1"
          data-testid="forecast-version-link"
        >
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={v.status} />
            <CadenceChip cadence={v.cadence} />
            <span className="chip">{v.site_id}</span>
          </div>

          <div
            className={cn(
              "mt-1.5 font-semibold tracking-tightish",
              active
                ? "text-base text-fg-strong"
                : "text-base text-fg-strong",
            )}
            data-testid="forecast-version-title"
          >
            Horizon starts {fmtHorizonStart(v.horizon_start_at)} · {horizonText}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
            <span className="inline-flex items-center gap-1">
              <span className="text-fg-faint">by</span>
              <span className="font-medium text-fg">
                {v.created_by_snapshot}
              </span>
            </span>
            <span className="text-fg-faint">·</span>
            <span
              className="tabular-nums"
              title={fmtDate(relTime)}
              data-testid="forecast-version-rel-time"
            >
              {v.published_at ? "published " : "updated "}
              {fmtAgo(relTime)}
            </span>
            {v.published_at && v.published_by_snapshot ? (
              <>
                <span className="text-fg-faint">·</span>
                <span className="inline-flex items-center gap-1">
                  <span className="text-fg-faint">by</span>
                  <span className="font-medium text-fg">
                    {v.published_by_snapshot}
                  </span>
                </span>
              </>
            ) : null}
          </div>

          {v.notes ? (
            <div className="mt-1.5 text-sm leading-relaxed text-fg-muted line-clamp-2">
              {v.notes}
            </div>
          ) : null}
        </Link>

        {/* Inline action icons — fade in on hover. Read-only for now
            (Duplicate / Archive endpoints not in scope). */}
        <div
          className="flex shrink-0 items-center gap-1"
          data-show-on-hover
          data-testid="forecast-row-actions"
        >
          <Link
            href={`/planning/forecast/${encodeURIComponent(v.version_id)}`}
            className="btn btn-ghost btn-sm h-7 w-7 p-0"
            title="Open forecast"
            aria-label="Open forecast"
            data-testid="forecast-row-action-open"
          >
            <Pencil className="h-3 w-3" strokeWidth={2} />
          </Link>
          <button
            type="button"
            disabled
            title="Duplicate (coming soon)"
            aria-label="Duplicate forecast"
            className="btn btn-ghost btn-sm h-7 w-7 p-0 opacity-60"
            data-testid="forecast-row-action-duplicate"
          >
            <Copy className="h-3 w-3" strokeWidth={2} />
          </button>
          {v.status === "draft" || v.status === "superseded" ? (
            <button
              type="button"
              disabled
              title="Archive (coming soon)"
              aria-label="Archive forecast"
              className="btn btn-ghost btn-sm h-7 w-7 p-0 opacity-60"
              data-testid="forecast-row-action-archive"
            >
              <Archive className="h-3 w-3" strokeWidth={2} />
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
