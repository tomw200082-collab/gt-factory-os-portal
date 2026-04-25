"use client";

// ---------------------------------------------------------------------------
// /planner/forecast — canonical list of forecast versions.
//
// Scope (W2 Mode B, Forecast only; MVP per Gate 4 closure directive):
//   - Lists rows from GET /api/v1/queries/forecasts/versions (§G.3)
//   - Filter by status
//   - Click row -> /planner/forecast/[version_id]
//   - "New draft" CTA -> /planner/forecast/new
//
// Role gate: planner + admin + viewer (planner layout RoleGate). Viewer
// sees non-draft rows only (server-enforced per §A.3 and handler.reads.ts).
// Operators are blocked by the planner layout already.
//
// Deferred to future cycles: History sub-page, Active-published callout,
// Discard/Revise UI.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus, Zap } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { EmptyState } from "@/components/feedback/states";
import { useSession } from "@/lib/auth/session-provider";
import type { Session } from "@/lib/auth/fake-auth";
import { useState } from "react";
import { cn } from "@/lib/cn";

type ForecastStatus = "draft" | "published" | "superseded" | "discarded";

interface VersionMetadata {
  version_id: string;
  site_id: string;
  cadence: "monthly" | "weekly" | "daily";
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

const STATUS_OPTIONS: ForecastStatus[] = [
  "draft",
  "published",
  "superseded",
  "discarded",
];

function sessionHeaders(_session: Session): HeadersInit {
  return {
    "Content-Type": "application/json",
  };
}

async function fetchVersions(
  session: Session,
  status: ForecastStatus | null,
): Promise<ListResponse> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await fetch(`/api/forecasts/versions${qs}`, {
    method: "GET",
    headers: sessionHeaders(session),
  });
  if (!res.ok) {
    throw new Error("Failed to load forecast versions. Check your connection and try refreshing.");
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

export default function ForecastListPage() {
  const { session } = useSession();
  const [statusFilter, setStatusFilter] = useState<ForecastStatus | null>(null);
  const canAuthor = session.role === "planner" || session.role === "admin";

  const query = useQuery<ListResponse>({
    queryKey: ["forecasts", "versions", statusFilter ?? "all", session.role],
    queryFn: () => fetchVersions(session, statusFilter),
    staleTime: 60_000,
  });

  const versions = query.data?.versions ?? [];
  const activePublished = statusFilter === null
    ? versions.find((v) => v.status === "published")
    : null;

  return (
    <>
      <WorkflowHeader
        eyebrow="Planner workspace"
        title="Forecast"
        description="Versioned demand forecast. Author a draft, save lines, and publish to make it the active forecast. All writes are audited; all publishes are atomic."
        meta={
          query.data ? (
            <Badge tone="neutral" dotted>
              {versions.length}{statusFilter ? ` ${statusFilter}` : ""} version{versions.length === 1 ? "" : "s"}
            </Badge>
          ) : null
        }
        actions={
          canAuthor ? (
            <Link
              href="/planning/forecast/new"
              className="btn btn-primary btn-sm gap-1.5"
              data-testid="forecast-new-draft-link"
            >
              <Plus className="h-3 w-3" strokeWidth={2.5} />
              New draft
            </Link>
          ) : null
        }
      />

      <SectionCard contentClassName="p-0">
        <div
          className="flex flex-wrap items-center gap-3 border-b border-border/60 px-5 py-3"
          data-testid="forecast-filter-bar"
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
                data-testid={`forecast-filter-status-${s}`}
                aria-pressed={active}
                onClick={() => setStatusFilter((cur) => (cur === s ? null : s))}
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
            data-testid="forecast-filter-clear"
            onClick={() => setStatusFilter(null)}
          >
            All
          </button>
        </div>

        {activePublished ? (
          <div className="flex items-start gap-3 border-b border-border/60 bg-success-subtle/40 px-5 py-3">
            <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success-fg" />
            <div className="min-w-0 flex-1 text-xs text-fg">
              <span className="font-semibold text-success-fg">Active forecast</span>
              {" — "}
              horizon starts {fmtHorizonStart(activePublished.horizon_start_at)}, {activePublished.horizon_weeks} weeks ·{" "}
              published by {activePublished.published_by_snapshot ?? "—"} at {fmtDate(activePublished.published_at)}
              {" · "}
              <Link
                href={`/planning/forecast/${encodeURIComponent(activePublished.version_id)}`}
                className="font-medium text-success-fg underline underline-offset-2 hover:text-success-fg/80"
              >
                View
              </Link>
              {" · "}
              <Link
                href="/planning/runs"
                className="font-medium text-fg-muted underline underline-offset-2 hover:text-fg"
              >
                Go to planning runs →
              </Link>
            </div>
          </div>
        ) : null}

        {query.isLoading ? (
          <div className="p-5 text-xs text-fg-muted">Loading…</div>
        ) : query.isError ? (
          <div className="p-5 text-xs text-danger-fg" data-testid="forecast-list-error">
            Failed to load forecast versions. Check your connection or try refreshing.
          </div>
        ) : versions.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={statusFilter ? `No ${statusFilter} forecast versions.` : "No forecast versions yet."}
              description={
                statusFilter
                  ? "Try clearing the filter to see all versions."
                  : canAuthor
                  ? "Start by creating a new draft."
                  : "No published forecasts to review yet."
              }
            />
          </div>
        ) : (
          <ul
            className="divide-y divide-border/60"
            data-testid="forecast-versions-list"
          >
            {versions.map((v) => (
              <li
                key={v.version_id}
                className="px-5 py-4"
                data-testid="forecast-version-row"
                data-version-id={v.version_id}
                data-status={v.status}
              >
                <Link
                  href={`/planning/forecast/${encodeURIComponent(v.version_id)}`}
                  className="flex items-start gap-4 hover:bg-bg-subtle/40 -mx-2 px-2 py-1 rounded"
                  data-testid="forecast-version-link"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={v.status} />
                      <span className="chip">{v.cadence}</span>
                      <span className="chip">{v.site_id}</span>
                      <span className="font-mono text-3xs uppercase tracking-sops text-fg-subtle">
                        {v.version_id.slice(0, 8)}
                      </span>
                    </div>
                    <div
                      className="mt-1.5 text-base font-semibold tracking-tightish text-fg-strong"
                      data-testid="forecast-version-title"
                    >
                      Horizon starts {fmtHorizonStart(v.horizon_start_at)} · {v.horizon_weeks}{" "}
                      weeks
                    </div>
                    <div className="mt-1 flex flex-wrap gap-4 text-xs text-fg-muted">
                      <span>
                        created by{" "}
                        <span className="font-medium text-fg">
                          {v.created_by_snapshot}
                        </span>{" "}
                        at {fmtDate(v.created_at)}
                      </span>
                      {v.published_at ? (
                        <span>
                          published by{" "}
                          <span className="font-medium text-fg">
                            {v.published_by_snapshot}
                          </span>{" "}
                          at {fmtDate(v.published_at)}
                        </span>
                      ) : null}
                    </div>
                    {v.notes ? (
                      <div className="mt-1 text-sm leading-relaxed text-fg-muted">
                        {v.notes}
                      </div>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
