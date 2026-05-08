"use client";

// ---------------------------------------------------------------------------
// /planning/forecast — Canonical list of forecast versions.
//
// Goal: clean, scannable list. Easy to create a new draft. Easy to find the
// active forecast. Drafts surfaced at the top.
//
// 2026-05-08 simplification — Tom UX pass. Removed all decorative I-features
// (waterfall, freeze countdown, bias chip, accuracy by family, consensus
// panel, sparklines, etc.) and reduced to the essentials per the handoff:
//
//   - WorkflowHeader with eyebrow / title / description
//   - "New forecast" primary CTA in the header actions
//   - MiniStats summary (Total / Active / Drafts / Last published)
//   - Search input + status segmented filter + cadence chips
//   - Three sections: Active (published), Drafts, Archived (collapsed)
//   - Each row uses ForecastRow (already redesigned May 2026)
//   - Empty / loading / error states use shared components
//
// Role gate: planner / admin / viewer (server-enforced; viewer sees non-draft
// rows only).
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  Archive,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { EmptyState, ErrorState } from "@/components/feedback/states";
import { useSession } from "@/lib/auth/session-provider";
import type { Session } from "@/lib/auth/fake-auth";
import { useMemo, useState } from "react";
import { MiniStats } from "./_components/MiniStats";
import { SectionHeader } from "./_components/SectionHeader";
import { ForecastRow } from "./_components/ForecastRow";
import type { ProductionLitersResponseApi } from "./_lib/production-liters";

// ---------------------------------------------------------------------------
// Types — mirror the W1 DTO contract for /api/forecasts/versions
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Filter primitives
// ---------------------------------------------------------------------------
type StatusFilter = "all" | "published" | "draft" | "archived";
const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "published", label: "Active" },
  { id: "draft", label: "Drafts" },
  { id: "archived", label: "Archived" },
];

type CadenceFilter = "all" | "monthly" | "weekly";
const CADENCE_OPTIONS: { id: CadenceFilter; label: string }[] = [
  { id: "all", label: "All cadences" },
  { id: "monthly", label: "Monthly" },
  { id: "weekly", label: "Weekly" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sessionHeaders(_session: Session): HeadersInit {
  return { "Content-Type": "application/json" };
}

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

async function fetchProductionLiters(
  session: Session,
  versionId: string,
): Promise<ProductionLitersResponseApi | null> {
  try {
    const res = await fetch(
      `/api/forecasts/versions/${encodeURIComponent(versionId)}/production-liters`,
      { method: "GET", headers: sessionHeaders(session) },
    );
    if (!res.ok) return null;
    return (await res.json()) as ProductionLitersResponseApi;
  } catch {
    return null;
  }
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
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
  const lowerQuery = searchQuery.trim().toLowerCase();

  // Apply cadence + search filters first.
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

  // Group by status semantics. Active = published. Archived = superseded +
  // discarded. Each group sorted newest first by the relevant timestamp.
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

  // Per-row production-liters fetches. Small payload, cached 5 minutes.
  const summariesQueries = useQueries({
    queries: baseFiltered.map((v) => ({
      queryKey: [
        "forecast",
        "production-liters",
        v.version_id,
        session.role,
      ] as const,
      queryFn: () => fetchProductionLiters(session, v.version_id),
      staleTime: 5 * 60 * 1000,
    })),
  });
  const summariesByVersionId = useMemo(() => {
    const m = new Map<string, ProductionLitersResponseApi | null>();
    baseFiltered.forEach((v, i) => {
      const r = summariesQueries[i];
      m.set(v.version_id, r?.data ?? null);
    });
    return m;
  }, [baseFiltered, summariesQueries]);

  // Apply the segmented status filter on top of grouping.
  const showActive = statusFilter === "all" || statusFilter === "published";
  const showDrafts = statusFilter === "all" || statusFilter === "draft";
  const showArchivedSection =
    statusFilter === "all" || statusFilter === "archived";

  // Insights shown in the MiniStats — computed against the FULL unfiltered
  // list so the operator always sees true totals regardless of filter state.
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

  // Counts per segment (for the count chip in each segmented option).
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

  const isEmpty =
    !query.isLoading &&
    !query.isError &&
    allVersions.length === 0;

  const isFilteredEmpty =
    !query.isLoading &&
    !query.isError &&
    allVersions.length > 0 &&
    baseFiltered.length === 0;

  const activeIndex = grouped.active[0]?.version_id ?? null;

  return (
    <>
      <WorkflowHeader
        eyebrow="Planning workspace"
        title="Forecasts"
        description="Monthly demand forecast drives purchase and production recommendations."
        actions={
          canAuthor ? (
            <Link
              href="/planning/forecast/new"
              data-testid="forecast-new-cta"
              className="inline-flex items-center gap-2 rounded-md border border-accent bg-accent px-3.5 py-2 text-sm font-semibold text-accent-fg shadow-raised transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              New forecast
            </Link>
          ) : null
        }
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
      />

      {/* ----- Filter bar ----- */}
      <div
        className="mb-6 flex flex-wrap items-center gap-3 rounded-md border border-border bg-bg-raised px-3 py-2.5"
        role="search"
        aria-label="Filter forecasts"
      >
        {/* Search input */}
        <div className="relative min-w-[200px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint"
            strokeWidth={2}
            aria-hidden
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search forecasts…"
            data-testid="forecast-search"
            className="h-8 w-full rounded border border-border bg-bg pl-8 pr-8 text-sm text-fg-strong placeholder:text-fg-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            aria-label="Search forecasts"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-fg-faint hover:text-fg-strong"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" strokeWidth={2.25} />
            </button>
          ) : null}
        </div>

        {/* Status segmented filter */}
        <div
          className="inline-flex items-center gap-1 rounded border border-border bg-bg p-0.5"
          role="tablist"
          aria-label="Filter by status"
        >
          {STATUS_FILTERS.map((opt) => {
            const isActive = statusFilter === opt.id;
            const count = statusCounts[opt.id];
            return (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setStatusFilter(opt.id)}
                data-testid={`forecast-status-${opt.id}`}
                className={[
                  "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-accent-soft text-accent"
                    : "text-fg-muted hover:bg-bg-subtle hover:text-fg-strong",
                ].join(" ")}
              >
                {opt.label}
                <span
                  className={[
                    "tabular-nums rounded px-1 text-3xs font-semibold",
                    isActive
                      ? "bg-accent/15 text-accent"
                      : "bg-bg-subtle text-fg-faint",
                  ].join(" ")}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Cadence chip group */}
        <div
          className="inline-flex items-center gap-1 rounded border border-border bg-bg p-0.5"
          role="group"
          aria-label="Filter by cadence"
        >
          {CADENCE_OPTIONS.map((opt) => {
            const isActive = cadenceFilter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => setCadenceFilter(opt.id)}
                data-testid={`forecast-cadence-${opt.id}`}
                className={[
                  "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-accent-soft text-accent"
                    : "text-fg-muted hover:bg-bg-subtle hover:text-fg-strong",
                ].join(" ")}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ----- States ----- */}
      {query.isError ? (
        <ErrorState
          title="Could not load forecasts"
          description="Check your connection and try again. If the problem persists, contact support."
        />
      ) : query.isLoading ? (
        <div
          className="space-y-4"
          aria-busy="true"
          aria-label="Loading forecasts"
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-lg border border-border bg-bg-raised"
            />
          ))}
        </div>
      ) : isEmpty ? (
        <EmptyState
          title="No forecasts yet"
          description="Create your first forecast to start driving purchase and production recommendations."
          icon={<Sparkles className="h-5 w-5 text-accent" strokeWidth={2} />}
          action={
            canAuthor ? (
              <Link
                href="/planning/forecast/new"
                className="inline-flex items-center gap-2 rounded-md border border-accent bg-accent px-3.5 py-2 text-sm font-semibold text-accent-fg shadow-raised transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                data-testid="forecast-empty-cta"
              >
                <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                Create your first forecast
              </Link>
            ) : null
          }
        />
      ) : isFilteredEmpty ? (
        <EmptyState
          title="No forecasts match these filters"
          description="Try clearing the search or switching to All."
          action={
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("all");
                setCadenceFilter("all");
              }}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-bg px-3 py-1.5 text-sm font-medium text-fg-strong transition-colors hover:bg-bg-subtle"
            >
              Reset filters
            </button>
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          {/* ----- Active section ----- */}
          {showActive && grouped.active.length > 0 ? (
            <section
              className="flex flex-col gap-3"
              aria-label="Active forecasts"
            >
              <SectionHeader
                tone="active"
                icon={
                  <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                }
                label="Active"
                count={grouped.active.length}
                testId="forecast-section-active"
              />
              <ul
                className="fc-list-rows flex flex-col gap-3"
                data-testid="forecast-list-active"
              >
                {grouped.active.map((v) => (
                  <ForecastRow
                    key={v.version_id}
                    v={v}
                    active={v.version_id === activeIndex}
                    productionLiters={summariesByVersionId.get(v.version_id)}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {/* ----- Drafts section ----- */}
          {showDrafts && grouped.drafts.length > 0 ? (
            <section
              className="flex flex-col gap-3"
              aria-label="Draft forecasts"
            >
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
                testId="forecast-section-drafts"
              />
              <ul
                className="fc-list-rows flex flex-col gap-3"
                data-testid="forecast-list-drafts"
              >
                {grouped.drafts.map((v) => (
                  <ForecastRow
                    key={v.version_id}
                    v={v}
                    productionLiters={summariesByVersionId.get(v.version_id)}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {/* ----- Archived section (collapsible) ----- */}
          {showArchivedSection && grouped.archived.length > 0 ? (
            <section
              className="flex flex-col gap-3"
              aria-label="Archived forecasts"
            >
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
                count={grouped.archived.length}
                asButton
                ariaExpanded={showArchived}
                onClick={() => setShowArchived((s) => !s)}
                testId="forecast-section-archived"
                trailing={
                  showArchived ? (
                    <ChevronDown
                      className="h-3.5 w-3.5 text-fg-muted"
                      strokeWidth={2}
                      aria-hidden
                    />
                  ) : (
                    <ChevronRight
                      className="h-3.5 w-3.5 text-fg-muted"
                      strokeWidth={2}
                      aria-hidden
                    />
                  )
                }
              />
              {showArchived ? (
                <ul
                  className="fc-list-rows flex flex-col gap-3"
                  data-testid="forecast-list-archived"
                >
                  {grouped.archived.map((v) => (
                    <ForecastRow
                      key={v.version_id}
                      v={v}
                      muted
                      productionLiters={summariesByVersionId.get(v.version_id)}
                    />
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}
