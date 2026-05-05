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
// 2026-05-05 list polish — 20-iteration mandate (Linear/Bloomberg/FT-WSJ
// newspaper-grade refinement). Composes existing tokens; new utilities
// live in globals.css under the .fc-list-* prefix. Sub-components extracted
// into ./_components/{MiniStats,SectionHeader,ForecastRow}.tsx.
//
// Iteration map (1–20, see top-level brief):
//   1. Refined eyebrow with calibrated dot + hairline underline.
//   2. Mini-stats become 4 micro-cards w/ tier-relevant accents.
//   3. Search input — icon prefix, ⌘K hint suffix, accent ring on focus.
//   4. Segmented filter — sliding accent backdrop, count chip per segment.
//   5. Cadence filter — segmented + label with vertical separator.
//   6. CTA — cta-arrow-host pattern w/ accent-soft glow ring.
//   7. Sticky filter bar — backdrop-blur + hairline shadow when stuck.
//   8. Section headers — status icon, accent dot, count chip, fading rule.
//   9. Drafts empty state — condensed inline soft-note.
//  10. Archived empty state — condensed inline soft-note.
//  11. Row card — 3-column grid (stripe / content / right meta col).
//  12. Status pills — icon-led refined chips per tone.
//  13. Title — 15px, 2-line clamp, dir="auto" for Hebrew.
//  14. Meta row — User / Calendar / UserCheck micro-icons.
//  15. Description — 2-line clamp + bottom-fade mask.
//  16. Last-published — tabular-nums micro-pill w/ ISO tooltip.
//  17. Card hover — accent ring inset + reveal action column.
//  18. Open affordance — translating arrow on hover.
//  19. Stagger reveal on first paint (40ms increments, reduce-motion safe).
//  20. Sticky compact page header on scroll.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Archive,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  FileText,
  LineChart,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { EmptyState } from "@/components/feedback/states";
import { useSession } from "@/lib/auth/session-provider";
import type { Session } from "@/lib/auth/fake-auth";
import { useEffect, useMemo, useRef, useState } from "react";
import { MiniStats } from "./_components/MiniStats";
import { SectionHeader } from "./_components/SectionHeader";
import { ForecastRow, type ForecastRowVersion } from "./_components/ForecastRow";

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

// Cadence filter chip group. "all" = no filter.
type CadenceFilter = "all" | "monthly" | "weekly";
const CADENCE_OPTIONS: { id: CadenceFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "monthly", label: "Monthly" },
  { id: "weekly", label: "Weekly" },
];

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
    active.sort((a, b) => {
      const ax = a.published_at ?? a.created_at;
      const bx = b.published_at ?? b.created_at;
      return bx.localeCompare(ax);
    });
    drafts.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    archived.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return { active, drafts, archived };
  }, [baseFiltered]);

  // Apply the segmented status filter on TOP of grouping.
  const showActive = statusFilter === "all" || statusFilter === "published";
  const showDrafts = statusFilter === "all" || statusFilter === "draft";
  const showArchivedSection =
    statusFilter === "all" || statusFilter === "archived";

  // Insights computed against the FULL unfiltered list — the operator should
  // always see the true totals regardless of filter state.
  const insights = useMemo(() => {
    const total = allVersions.length;
    const activePub = allVersions.find((v) => v.status === "published") ?? null;
    const lastPubAt = activePub?.published_at ?? null;
    const draftCount = allVersions.filter((v) => v.status === "draft").length;
    const activeCount = allVersions.filter(
      (v) => v.status === "published",
    ).length;
    return { total, activePub, lastPubAt, draftCount, activeCount };
  }, [allVersions]);

  // Counts per segment (for the count chip in each segmented option). Status
  // segment counts ignore the active status filter so they're stable.
  const statusCounts = useMemo(
    () => ({
      all: baseFiltered.length,
      published: baseFiltered.filter((v) => v.status === "published").length,
      draft: baseFiltered.filter((v) => v.status === "draft").length,
      archived: baseFiltered.filter(
        (v) => v.status === "superseded" || v.status === "discarded",
      ).length,
    }),
    [baseFiltered],
  );
  const cadenceCounts = useMemo(() => {
    const filtered = allVersions.filter((v) => {
      if (!lowerQuery) return true;
      const hay =
        `${v.version_id} ${v.notes ?? ""} ${v.created_by_snapshot} ${v.published_by_snapshot ?? ""}`.toLowerCase();
      return hay.includes(lowerQuery);
    });
    return {
      all: filtered.length,
      monthly: filtered.filter((v) => v.cadence === "monthly").length,
      weekly: filtered.filter((v) => v.cadence === "weekly").length,
    };
  }, [allVersions, lowerQuery]);

  const totalVisible =
    (showActive ? grouped.active.length : 0) +
    (showDrafts ? grouped.drafts.length : 0) +
    (showArchivedSection ? grouped.archived.length : 0);

  // Iter 7 + 20 — sticky observer. We watch a sentinel after the hero; when
  // it leaves the viewport the filter bar + compact page header gain their
  // "stuck" treatments simultaneously.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (e) setStuck(!e.isIntersecting);
      },
      { threshold: 0, rootMargin: "0px 0px 0px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ⌘K / Ctrl+K focuses the search input (desk-class affordance).
  const searchRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {/* Iter 20 — sticky compact page header on scroll. */}
      <div
        className="fc-list-sticky-header"
        data-stuck={stuck}
        aria-hidden={!stuck}
      >
        <span className="fc-list-sticky-title">
          <Sparkles className="h-3 w-3 text-accent" strokeWidth={2.5} />
          Forecast
        </span>
        {query.data && !query.isLoading ? (
          <span className="fc-list-sticky-stats">
            <span>
              <strong>{insights.total}</strong> versions
            </span>
            <span className="sep" aria-hidden />
            <span>
              <strong>{insights.activeCount}</strong> active
            </span>
            <span className="sep" aria-hidden />
            <span>
              <strong>{insights.draftCount}</strong> drafts
            </span>
            {insights.lastPubAt ? (
              <>
                <span className="sep" aria-hidden />
                <span>
                  last <strong>{fmtAgo(insights.lastPubAt)}</strong>
                </span>
              </>
            ) : null}
          </span>
        ) : null}
      </div>

      <WorkflowHeader
        eyebrow={undefined}
        title="Forecast"
        description="Versioned demand forecast. Author a draft, save lines, and publish to make it the active forecast. All writes are audited; all publishes are atomic."
        meta={
          query.data && !query.isLoading ? (
            <MiniStats
              total={insights.total}
              active={insights.activeCount}
              drafts={insights.draftCount}
              lastPublishedRelative={
                insights.lastPubAt ? fmtAgo(insights.lastPubAt) : null
              }
              lastPublishedISO={insights.lastPubAt}
            />
          ) : null
        }
        actions={
          canAuthor ? (
            <Link
              href="/planning/forecast/new"
              className="btn btn-primary btn-sm cta-arrow-host fc-list-cta-glow gap-1.5"
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
      >
        {/* Iter 1 — refined eyebrow with calibrated dot + fading hairline. */}
        <div className="fc-list-eyebrow" aria-hidden>
          <span className="fc-list-eyebrow-dot" />
          <span className="fc-list-eyebrow-text">Planner workspace</span>
        </div>
      </WorkflowHeader>

      {/* Iter 7 sticky observer sentinel. */}
      <div ref={sentinelRef} aria-hidden style={{ height: 1, marginTop: -1 }} />

      <SectionCard contentClassName="p-0">
        {/* ─── Filter bar ─── */}
        <div
          className="fc-list-filter-bar flex flex-col gap-3 px-5 py-3 lg:flex-row lg:flex-wrap lg:items-center"
          data-testid="forecast-filter-bar"
          data-stuck={stuck}
        >
          {/* Iter 3 — search input with icon prefix + ⌘K kbd hint suffix. */}
          <label className="fc-list-search lg:max-w-xs">
            <Search
              className="fc-list-search-icon h-3.5 w-3.5"
              strokeWidth={2}
              aria-hidden
            />
            <input
              ref={searchRef}
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search forecasts"
              aria-label="Search forecasts"
              data-testid="forecast-search-input"
              className="fc-list-search-input"
            />
            <span className="fc-list-search-suffix">
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="rounded-sm p-0.5 text-fg-faint hover:bg-bg-muted hover:text-fg"
                  aria-label="Clear search"
                >
                  <X className="h-3 w-3" strokeWidth={2} />
                </button>
              ) : (
                <kbd className="kbd-hint" aria-hidden>
                  ⌘K
                </kbd>
              )}
            </span>
          </label>

          {/* Iter 4 — segmented status filter w/ count chip per option. */}
          <div
            className="fc-list-segmented shrink-0"
            role="tablist"
            aria-label="Status filter"
          >
            {STATUS_FILTERS.map((opt) => {
              const active = statusFilter === opt.id;
              const count = statusCounts[opt.id] ?? 0;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setStatusFilter(opt.id)}
                  className="fc-list-seg-option"
                  data-active={active}
                  data-testid={`forecast-filter-status-${opt.id}`}
                >
                  <span>{opt.label}</span>
                  <span className="fc-list-seg-count">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Iter 5 — cadence segmented with label + vertical separator. */}
          <div className="ml-auto inline-flex items-center gap-2">
            <span className="fc-list-cadence-label">Cadence</span>
            <div
              className="fc-list-segmented shrink-0"
              role="tablist"
              aria-label="Cadence filter"
            >
              {CADENCE_OPTIONS.map((opt) => {
                const active = cadenceFilter === opt.id;
                const count = cadenceCounts[opt.id] ?? 0;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setCadenceFilter(opt.id)}
                    className="fc-list-seg-option"
                    data-active={active}
                    data-testid={`forecast-filter-cadence-${opt.id}`}
                  >
                    <span>{opt.label}</span>
                    <span className="fc-list-seg-count">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
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
                    className="btn btn-primary btn-sm cta-arrow-host fc-list-cta-glow gap-1.5"
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
          <div data-testid="forecast-versions-list" className="fc-list-stagger">
            {/* ── ACTIVE section ── */}
            {showActive ? (
              grouped.active.length > 0 ? (
                <section>
                  <SectionHeader
                    tone="active"
                    icon={
                      <Activity
                        className="h-3 w-3"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                    }
                    label="Active"
                    count={grouped.active.length}
                  />
                  <ul>
                    {grouped.active.map((v) => (
                      <ForecastRow
                        key={v.version_id}
                        v={v as ForecastRowVersion}
                        active
                      />
                    ))}
                  </ul>
                </section>
              ) : null
            ) : null}

            {/* ── DRAFTS section ── */}
            {showDrafts ? (
              grouped.drafts.length > 0 ? (
                <section>
                  <SectionHeader
                    tone="drafts"
                    icon={
                      <FileText
                        className="h-3 w-3"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                    }
                    label="Drafts"
                    count={grouped.drafts.length}
                  />
                  <ul>
                    {grouped.drafts.map((v) => (
                      <ForecastRow
                        key={v.version_id}
                        v={v as ForecastRowVersion}
                      />
                    ))}
                  </ul>
                </section>
              ) : statusFilter === "all" ? (
                /* Iter 9 — condensed empty-state for drafts. */
                <section>
                  <SectionHeader
                    tone="drafts"
                    icon={
                      <FileText
                        className="h-3 w-3"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                    }
                    label="Drafts"
                    count={0}
                  />
                  <div className="fc-list-section-empty">
                    <span>No drafts in flight.</span>
                    {canAuthor ? (
                      <Link href="/planning/forecast/new">
                        Start a new forecast →
                      </Link>
                    ) : null}
                  </div>
                </section>
              ) : null
            ) : null}

            {/* ── ARCHIVED section ── */}
            {showArchivedSection ? (
              grouped.archived.length > 0 ? (
                <section>
                  <SectionHeader
                    tone="archived"
                    icon={
                      <Archive
                        className="h-3 w-3"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                    }
                    label={showArchived ? "Archived" : "Archived"}
                    count={grouped.archived.length}
                    asButton
                    onClick={() => setShowArchived((s) => !s)}
                    ariaExpanded={showArchived}
                    testId="forecast-toggle-archived"
                    trailing={
                      <span
                        className="text-3xs font-semibold uppercase tracking-sops text-fg-muted inline-flex items-center gap-1"
                        aria-hidden
                      >
                        {showArchived ? "Hide" : "Show"}
                        {showArchived ? (
                          <ChevronDown
                            className="h-3 w-3"
                            strokeWidth={2}
                            aria-hidden
                          />
                        ) : (
                          <ChevronRight
                            className="h-3 w-3"
                            strokeWidth={2}
                            aria-hidden
                          />
                        )}
                      </span>
                    }
                  />
                  {showArchived ? (
                    <ul>
                      {grouped.archived.map((v) => (
                        <ForecastRow
                          key={v.version_id}
                          v={v as ForecastRowVersion}
                          muted
                        />
                      ))}
                    </ul>
                  ) : null}
                </section>
              ) : statusFilter === "all" ? (
                /* Iter 10 — condensed empty-state for archived. */
                <section>
                  <SectionHeader
                    tone="archived"
                    icon={
                      <Archive
                        className="h-3 w-3"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                    }
                    label="Archived"
                    count={0}
                  />
                  <div className="fc-list-section-empty">
                    <span>Nothing archived yet.</span>
                  </div>
                </section>
              ) : null
            ) : null}
          </div>
        )}
      </SectionCard>
    </>
  );
}
