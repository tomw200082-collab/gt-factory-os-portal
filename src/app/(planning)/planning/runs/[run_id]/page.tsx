"use client";

// ---------------------------------------------------------------------------
// /planning/runs/[run_id] — canonical planning-run detail.
//
// Scope (W2 Mode B, PlanningRun only; Phase 8 MVP):
//   - GET /api/planning/runs/:run_id
//   - GET /api/planning/runs/:run_id/recommendations?type=purchase
//   - GET /api/planning/runs/:run_id/recommendations?type=production
//   - Two tabs: Recommendations | Exceptions
//   - Recommendations: item NAME, rec_type as human label, qty + UOM, priority
//     (each row links to /planning/runs/[run_id]/recommendations/[rec_id])
//   - Exceptions: item NAME (or component name), human-readable category,
//     severity badge, "Fix →" deep-link when a fix route is known
//
// Role gate:
//   - all roles: read-only diagnostic view (detail + recs + exceptions).
//     Tranche 072 — no write actions here. Approve / dismiss live in the
//     Inbox; converting an approved purchase rec into a PO lives in Procurement.
//
// Deferred to future cycles: pagination, cross-run diff, full policy
// snapshot drill-down.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { EmptyState, ErrorState } from "@/components/feedback/states";
import { useSession } from "@/lib/auth/session-provider";
import type { Session } from "@/lib/auth/fake-auth";
import { useRovingTabList } from "@/components/a11y/useRovingTabList";
import { cn } from "@/lib/cn";

type PlanningRunStatus =
  | "draft"
  | "running"
  | "completed"
  | "failed"
  | "superseded";
type RecommendationStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "dismissed"
  | "superseded"
  | "converted_to_po";
type RecommendationType = "purchase" | "production";
type FeasibilityStatus =
  | "ready_now"
  | "ready_if_purchase_executes"
  | "blocked_missing_bom"
  | "blocked_missing_supplier_mapping"
  | "blocked_stock_gap"
  | "blocked_missing_pack_conversion"
  | "blocked_ambiguous_supplier";

interface RunDetailException {
  exception_id: string;
  category: string;
  severity: "info" | "warning" | "fail_hard";
  item_id: string | null;
  component_id: string | null;
  item_name?: string | null;
  component_name?: string | null;
  detail: unknown;
  emitted_at: string;
}

interface RunDetail {
  run_id: string;
  executed_at: string;
  actor_user_id: string;
  trigger_source: "manual" | "scheduled";
  planning_horizon_start_at: string;
  planning_horizon_weeks: number;
  status: PlanningRunStatus;
  triggered_by_name?: string | null;
  summary: {
    fg_coverage_count: number;
    purchase_recs_count: number;
    production_recs_count: number;
    exceptions_count: number;
    exceptions_by_severity: {
      info: number;
      warning: number;
      fail_hard: number;
    };
  };
  exceptions: RunDetailException[];
}

interface RecommendationRow {
  recommendation_id: string;
  run_id: string;
  recommendation_type: RecommendationType;
  item_id: string | null;
  component_id: string | null;
  required_qty: string;
  recommended_qty: string;
  target_period_bucket_key: string;
  order_by_date: string | null;
  due_date: string | null;
  shortage_date: string | null;
  recommendation_status: RecommendationStatus;
  feasibility_status: FeasibilityStatus;
  supplier_id: string | null;
  bom_version_id: string | null;
  item_name: string | null;
  component_name: string | null;
  supplier_name: string | null;
  converted_to_po_id?: string | null;
  uom: string | null;
  current_stock_bal: string | null;
}

interface RecsResponse {
  rows: RecommendationRow[];
  count: number;
  total: number;
}

function sessionHeaders(_session: Session): HeadersInit {
  return { "Content-Type": "application/json" };
}

async function fetchDetail(
  session: Session,
  run_id: string,
): Promise<{ detail: RunDetail | null; notFound: boolean; error: string | null }> {
  const res = await fetch(`/api/planning/runs/${encodeURIComponent(run_id)}`, {
    method: "GET",
    headers: sessionHeaders(session),
  });
  if (res.status === 404) {
    return { detail: null, notFound: true, error: null };
  }
  if (!res.ok) {
    return {
      detail: null,
      notFound: false,
      error: "Could not load planning run. Check your connection and try refreshing.",
    };
  }
  const detail = (await res.json()) as RunDetail;
  return { detail, notFound: false, error: null };
}

async function fetchRecsByType(
  session: Session,
  run_id: string,
  type: RecommendationType,
): Promise<RecsResponse> {
  const res = await fetch(
    `/api/planning/runs/${encodeURIComponent(run_id)}/recommendations?type=${type}`,
    { method: "GET", headers: sessionHeaders(session) },
  );
  if (!res.ok) {
    throw new Error(
      "Could not load recommendations. Check your connection and try refreshing.",
    );
  }
  return (await res.json()) as RecsResponse;
}

function RunStatusBadge({ status }: { status: PlanningRunStatus }) {
  if (status === "completed") return <Badge tone="success" dotted>Completed</Badge>;
  if (status === "running") return <Badge tone="warning" dotted>Running</Badge>;
  if (status === "draft") return <Badge tone="warning" dotted>Draft</Badge>;
  if (status === "failed") return <Badge tone="danger" dotted>Failed</Badge>;
  return <Badge tone="neutral" dotted>Superseded</Badge>;
}

const REC_STATUS_LABEL: Record<RecommendationStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  approved: "Approved",
  dismissed: "Dismissed",
  superseded: "Superseded",
  converted_to_po: "Converted to PO",
};

function RecStatusBadge({ status }: { status: RecommendationStatus }) {
  const label = REC_STATUS_LABEL[status] ?? status;
  if (status === "approved") return <Badge tone="success" dotted>{label}</Badge>;
  if (status === "dismissed") return <Badge tone="neutral" dotted>{label}</Badge>;
  if (status === "pending_approval") return <Badge tone="warning" dotted>{label}</Badge>;
  if (status === "superseded") return <Badge tone="neutral" dotted>{label}</Badge>;
  if (status === "converted_to_po") return <Badge tone="accent" dotted>{label}</Badge>;
  return <Badge tone="info" dotted>{label}</Badge>;
}

const FEASIBILITY_LABELS: Record<FeasibilityStatus, string> = {
  ready_now: "Ready now",
  ready_if_purchase_executes: "Ready if PO executes",
  blocked_stock_gap: "Stock gap",
  blocked_missing_bom: "No BOM",
  blocked_missing_supplier_mapping: "No supplier mapped",
  blocked_missing_pack_conversion: "Pack conversion missing",
  blocked_ambiguous_supplier: "Ambiguous supplier",
};

function PriorityBadge({ status }: { status: FeasibilityStatus }) {
  const label = FEASIBILITY_LABELS[status] ?? status.replace(/_/g, " ");
  if (status === "ready_now") return <Badge tone="success" dotted>{label}</Badge>;
  if (status === "ready_if_purchase_executes") return <Badge tone="info" dotted>{label}</Badge>;
  return <Badge tone="danger" dotted>{label}</Badge>;
}

const REC_TYPE_HUMAN: Record<RecommendationType, string> = {
  purchase: "Purchase order",
  production: "Production",
};

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

function parseQty(s: string | null | undefined): number {
  if (!s) return 0;
  return parseFloat(s) || 0;
}

function fmtQty(s: string | null | undefined, uom: string | null): string {
  const n = parseQty(s);
  const formatted = Number.isInteger(n) ? n.toFixed(0) : n.toFixed(2).replace(/\.?0+$/, "");
  return uom ? `${formatted} ${uom}` : formatted;
}

function fmtExceptionDetail(detail: unknown): string | null {
  if (detail === null || detail === undefined) return null;
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  if (typeof detail === "object") {
    const obj = detail as Record<string, unknown>;
    if (typeof obj.message === "string" && obj.message.trim()) return obj.message.trim();
    if (typeof obj.detail === "string" && obj.detail.trim()) return obj.detail.trim();
    if (typeof obj.description === "string" && obj.description.trim()) return obj.description.trim();
  }
  return null;
}

function ExceptionSeverityBadge({
  severity,
}: {
  severity: "info" | "warning" | "fail_hard";
}) {
  if (severity === "fail_hard") return <Badge tone="danger" dotted>Critical</Badge>;
  if (severity === "warning") return <Badge tone="warning" dotted>Warning</Badge>;
  return <Badge tone="info" dotted>Info</Badge>;
}

const EXCEPTION_CATEGORY_LABELS: Record<string, string> = {
  missing_bom: "Missing BOM",
  stale_demand_input: "Stale demand input",
  stale_stock_input: "Stale stock input",
  missing_supplier_mapping: "No supplier mapped",
  ambiguous_supplier_mapping: "Ambiguous supplier",
  impossible_lead_time: "Lead time conflict",
  stock_gap: "Stock gap",
  missing_pack_conversion: "Pack conversion missing",
  unresolvable_order_line: "Unresolvable order line",
  bundle_line_excluded: "Bundle line excluded",
  recommendation_below_trigger_threshold: "Below trigger threshold",
  po_substrate_absent: "Open PO substrate not available",
};

function fmtExceptionCategory(category: string): string {
  return EXCEPTION_CATEGORY_LABELS[category] ?? category.replace(/_/g, " ");
}

// Returns a fix route for known exception categories. Used to render the
// "Fix →" CTA in the exceptions tab.
function exceptionFixRoute(
  category: string,
  itemId: string | null,
  componentId: string | null,
): { href: string; label: string } | null {
  if (category === "missing_bom" && itemId) {
    return {
      href: `/admin/masters/items/${encodeURIComponent(itemId)}?tab=bom`,
      label: "Fix BOM",
    };
  }
  if (
    (category === "missing_supplier_mapping" ||
      category === "ambiguous_supplier_mapping" ||
      category === "impossible_lead_time") &&
    componentId
  ) {
    return {
      href: `/admin/masters/components/${encodeURIComponent(componentId)}`,
      label: "Fix supplier",
    };
  }
  if (category === "stale_demand_input") {
    return { href: "/planning/forecast", label: "Publish forecast" };
  }
  if (category === "stale_stock_input") {
    return { href: "/admin/jobs", label: "Check jobs" };
  }
  if (category === "po_substrate_absent") {
    return { href: "/planning/blockers", label: "Open blockers" };
  }
  return null;
}

function actorLabel(detail: RunDetail): string {
  if (detail.triggered_by_name && detail.triggered_by_name.trim()) {
    return detail.triggered_by_name;
  }
  return detail.trigger_source === "scheduled" ? "Scheduled" : "Manual";
}

export default function PlanningRunDetailPage() {
  const { session } = useSession();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const runId = String(params?.run_id ?? "");

  // ?tab=recommendations|exceptions deep links. Default = recommendations.
  // (Legacy ?tab=purchase|production also lands on recommendations.)
  const tabFromUrl = searchParams?.get("tab");
  const initialTab: "recommendations" | "exceptions" =
    tabFromUrl === "exceptions" ? "exceptions" : "recommendations";
  const [activeTab, setActiveTabState] =
    useState<"recommendations" | "exceptions">(initialTab);

  function setActiveTab(t: "recommendations" | "exceptions") {
    setActiveTabState(t);
    const sp = new URLSearchParams(searchParams?.toString() ?? "");
    sp.set("tab", t);
    router.replace(`?${sp.toString()}`, { scroll: false });
  }

  const [recTypeFilter, setRecTypeFilter] = useState<
    "all" | "purchase" | "production"
  >("all");

  // Tranche 075 (A11Y-009) — roving tabindex + arrow keys for the two
  // tablists on this page: section tabs (Recommendations | Exceptions) and
  // the rec-type sub-filter.
  const sectionRoving = useRovingTabList<"recommendations" | "exceptions">({
    keys: ["recommendations", "exceptions"] as const,
    activeKey: activeTab,
    onChange: setActiveTab,
    orientation: "horizontal",
  });
  const recTypeRoving = useRovingTabList<"all" | "purchase" | "production">({
    keys: ["all", "purchase", "production"] as const,
    activeKey: recTypeFilter,
    onChange: setRecTypeFilter,
    orientation: "horizontal",
  });

  const detailQuery = useQuery({
    queryKey: ["planning", "run", runId, session.role],
    queryFn: () => fetchDetail(session, runId),
    staleTime: 60_000,
  });

  const purchaseQuery = useQuery<RecsResponse>({
    queryKey: ["planning", "run", runId, "recs", "purchase", session.role],
    queryFn: () => fetchRecsByType(session, runId, "purchase"),
    enabled: !!detailQuery.data?.detail,
    staleTime: 60_000,
  });

  const productionQuery = useQuery<RecsResponse>({
    queryKey: ["planning", "run", runId, "recs", "production", session.role],
    queryFn: () => fetchRecsByType(session, runId, "production"),
    enabled: !!detailQuery.data?.detail,
    staleTime: 60_000,
  });

  // Tranche 072 — planning runs are diagnostic-only. Recommendation approve /
  // dismiss live in the Inbox; recommendation→PO conversion lives in
  // Procurement. No write mutations on this surface.

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading planning run…">
        <div className="space-y-2">
          <div className="h-3 w-32 animate-pulse rounded bg-bg-subtle" />
          <div className="h-7 w-72 animate-pulse rounded bg-bg-subtle" />
          <div className="h-3 w-48 animate-pulse rounded bg-bg-subtle" />
        </div>
        <div className="h-32 w-full animate-pulse rounded bg-bg-subtle" />
        <div className="h-64 w-full animate-pulse rounded bg-bg-subtle" />
      </div>
    );
  }

  if (detailQuery.data?.notFound) {
    return (
      <ErrorState
        title="Planning run not found"
        description="No planning run matches this id. It may have been superseded or removed."
        action={
          <Link href="/planning/runs" className="btn btn-sm gap-1.5">
            <ArrowLeft className="h-3 w-3" strokeWidth={2.5} />
            Back to planning runs
          </Link>
        }
      />
    );
  }

  if (detailQuery.isError || detailQuery.data?.error || !detailQuery.data?.detail) {
    return (
      <ErrorState
        title="Could not load planning run"
        description={
          detailQuery.data?.error ??
          "Check your connection and try refreshing."
        }
        action={
          <button
            type="button"
            onClick={() => void detailQuery.refetch()}
            className="btn btn-sm"
          >
            Try again
          </button>
        }
      />
    );
  }

  const detail = detailQuery.data.detail;
  const totalRecs =
    detail.summary.purchase_recs_count + detail.summary.production_recs_count;

  const allRecs: RecommendationRow[] = [
    ...((purchaseQuery.data?.rows ?? []).map((r) => ({
      ...r,
      recommendation_type: "purchase" as RecommendationType,
    }))),
    ...((productionQuery.data?.rows ?? []).map((r) => ({
      ...r,
      recommendation_type: "production" as RecommendationType,
    }))),
  ];

  const filteredRecs = allRecs.filter((r) =>
    recTypeFilter === "all" ? true : r.recommendation_type === recTypeFilter,
  );

  const recsLoading = purchaseQuery.isLoading || productionQuery.isLoading;
  const recsError = purchaseQuery.isError || productionQuery.isError;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/planning/runs"
          className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
          data-testid="run-detail-back-link"
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2} />
          Back to planning runs
        </Link>
      </div>

      <WorkflowHeader
        eyebrow="Planning workspace"
        title={`Planning run · ${fmtDate(detail.executed_at)}`}
        description={`Triggered by ${actorLabel(detail)} · ${detail.planning_horizon_weeks}-week horizon starting ${fmtDate(detail.planning_horizon_start_at)}.`}
        meta={
          <>
            <RunStatusBadge status={detail.status} />
            <Badge tone="neutral">
              {totalRecs} recommendation{totalRecs === 1 ? "" : "s"}
            </Badge>
            {detail.summary.exceptions_count > 0 ? (
              <Badge tone="warning" dotted>
                {detail.summary.exceptions_count} exception
                {detail.summary.exceptions_count === 1 ? "" : "s"}
              </Badge>
            ) : (
              <Badge tone="success" dotted>No exceptions</Badge>
            )}
          </>
        }
      />

      {/* Tranche 045 — runs are demoted from ordering. This banner declares
          the surface diagnostic-only and routes ordering to Procurement. */}
      <div
        role="note"
        className="rounded border border-accent-border bg-accent-softer px-4 py-3 text-sm"
        data-testid="run-detail-diagnostic-banner"
      >
        <div className="font-semibold text-fg-strong">
          Planning runs are diagnostic only — quantities here are not for
          ordering.
        </div>
        <div className="mt-1 text-xs leading-relaxed text-fg-muted">
          Use this run to understand what the engine saw and why.{" "}
          <Link
            href="/planning/procurement"
            className="font-semibold text-accent hover:underline"
          >
            Order through Procurement →
          </Link>
        </div>
      </div>

      {/* Tab control */}
      <div
        {...sectionRoving.tabListProps}
        aria-label="Run sections"
        className="inline-flex items-center gap-1 rounded border border-border/70 bg-bg-raised p-0.5"
        data-testid="run-detail-tabs"
      >
        {(() => {
          const tp = sectionRoving.getTabProps("recommendations");
          return (
            <button
              type="button"
              id="run-detail-tab-btn-recommendations"
              aria-controls="run-detail-panel-recommendations"
              role={tp.role}
              tabIndex={tp.tabIndex}
              aria-selected={tp["aria-selected"]}
              ref={(el) => tp.ref(el)}
              onKeyDown={tp.onKeyDown}
              onClick={() => setActiveTab("recommendations")}
              className={cn(
                "rounded px-3 py-1.5 text-2xs font-semibold uppercase tracking-sops transition-colors",
                activeTab === "recommendations"
                  ? "bg-accent text-accent-fg"
                  : "text-fg-muted hover:text-fg-strong",
              )}
              data-testid="run-detail-tab-recommendations"
            >
              Recommendations · {totalRecs}
            </button>
          );
        })()}
        {(() => {
          const tp = sectionRoving.getTabProps("exceptions");
          return (
            <button
              type="button"
              id="run-detail-tab-btn-exceptions"
              aria-controls="run-detail-panel-exceptions"
              role={tp.role}
              tabIndex={tp.tabIndex}
              aria-selected={tp["aria-selected"]}
              ref={(el) => tp.ref(el)}
              onKeyDown={tp.onKeyDown}
              onClick={() => setActiveTab("exceptions")}
              className={cn(
                "rounded px-3 py-1.5 text-2xs font-semibold uppercase tracking-sops transition-colors",
                activeTab === "exceptions"
                  ? "bg-accent text-accent-fg"
                  : "text-fg-muted hover:text-fg-strong",
              )}
              data-testid="run-detail-tab-exceptions"
            >
              Exceptions · {detail.summary.exceptions_count}
            </button>
          );
        })()}
      </div>

      {activeTab === "recommendations" ? (
        <div
          role="tabpanel"
          id="run-detail-panel-recommendations"
          aria-labelledby="run-detail-tab-btn-recommendations"
        >
        <SectionCard
          eyebrow="Recommendations"
          title={
            filteredRecs.length === 0
              ? "Recommendations"
              : `${filteredRecs.length} recommendation${filteredRecs.length === 1 ? "" : "s"}`
          }
          description="Click any row for the full breakdown."
          actions={
            <div
              {...recTypeRoving.tabListProps}
              aria-label="Filter recommendations by type"
              className="inline-flex items-center gap-1 rounded border border-border/70 bg-bg-raised p-0.5"
              data-testid="run-detail-rec-type-filter"
            >
              {(
                [
                  { key: "all", label: "All" },
                  { key: "purchase", label: "Purchase" },
                  { key: "production", label: "Production" },
                ] as const
              ).map((opt) => {
                const active = recTypeFilter === opt.key;
                const tp = recTypeRoving.getTabProps(opt.key);
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role={tp.role}
                    tabIndex={tp.tabIndex}
                    aria-selected={tp["aria-selected"]}
                    ref={(el) => tp.ref(el)}
                    onKeyDown={tp.onKeyDown}
                    onClick={() => setRecTypeFilter(opt.key)}
                    className={cn(
                      "rounded px-2.5 py-1 text-2xs font-semibold uppercase tracking-sops transition-colors",
                      active
                        ? "bg-accent text-accent-fg"
                        : "text-fg-muted hover:text-fg-strong",
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          }
        >
          {recsLoading ? (
            <div className="space-y-2" aria-busy="true">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-12 w-full animate-pulse rounded bg-bg-subtle"
                />
              ))}
            </div>
          ) : recsError ? (
            <ErrorState
              title="Could not load recommendations"
              description="Check your connection and try again."
              action={
                <button
                  type="button"
                  onClick={() => {
                    void purchaseQuery.refetch();
                    void productionQuery.refetch();
                  }}
                  className="btn btn-sm"
                >
                  Try again
                </button>
              }
            />
          ) : filteredRecs.length === 0 ? (
            <EmptyState
              title="No recommendations"
              description={
                recTypeFilter === "all"
                  ? "This run produced no recommendations. The active forecast may already be covered by on-hand and open POs."
                  : `No ${recTypeFilter} recommendations for this run.`
              }
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table
                  className="w-full border-collapse text-sm"
                  data-testid="run-detail-recs-table"
                >
                  <thead>
                    <tr className="border-b border-border/70 bg-bg-subtle/60 text-left">
                      <th scope="col" className="px-3 py-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        Item
                      </th>
                      <th scope="col" className="px-3 py-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        Type
                      </th>
                      <th scope="col" className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        Quantity
                      </th>
                      <th scope="col" className="px-3 py-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        Priority
                      </th>
                      <th scope="col" className="px-3 py-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        Status
                      </th>
                      <th scope="col" className="px-3 py-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecs.map((r) => {
                      const itemName =
                        r.item_name ??
                        r.component_name ??
                        "—";
                      return (
                        <tr
                          key={r.recommendation_id}
                          className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/50 transition-colors"
                          data-testid="run-detail-rec-row"
                          data-rec-id={r.recommendation_id}
                          data-status={r.recommendation_status}
                        >
                          <td className="px-3 py-3">
                            <Link
                              href={`/planning/runs/${encodeURIComponent(runId)}/recommendations/${encodeURIComponent(r.recommendation_id)}`}
                              className="text-sm font-medium text-fg-strong hover:underline"
                            >
                              {itemName}
                            </Link>
                            {r.supplier_name ? (
                              <div className="mt-0.5 text-xs text-fg-muted">
                                Supplier: {r.supplier_name}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 text-xs text-fg-muted">
                            {REC_TYPE_HUMAN[r.recommendation_type]}
                          </td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums text-fg-strong">
                            {fmtQty(r.recommended_qty, r.uom)}
                          </td>
                          <td className="px-3 py-3">
                            <PriorityBadge status={r.feasibility_status} />
                          </td>
                          <td className="px-3 py-3">
                            <RecStatusBadge status={r.recommendation_status} />
                          </td>
                          <td className="px-3 py-3 text-right">
                            <Link
                              href={`/planning/runs/${encodeURIComponent(runId)}/recommendations/${encodeURIComponent(r.recommendation_id)}`}
                              className="text-xs text-accent hover:underline"
                            >
                              Open →
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-border/40">
                {filteredRecs.map((r) => {
                  const itemName =
                    r.item_name ?? r.component_name ?? "—";
                  return (
                    <Link
                      key={r.recommendation_id}
                      href={`/planning/runs/${encodeURIComponent(runId)}/recommendations/${encodeURIComponent(r.recommendation_id)}`}
                      className="block py-3 px-1 hover:bg-bg-subtle/50 transition-colors"
                      data-testid="run-detail-rec-row"
                      data-rec-id={r.recommendation_id}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-fg-strong">
                            {itemName}
                          </div>
                          <div className="mt-0.5 text-xs text-fg-muted">
                            {REC_TYPE_HUMAN[r.recommendation_type]} ·{" "}
                            {fmtQty(r.recommended_qty, r.uom)}
                          </div>
                        </div>
                        <RecStatusBadge status={r.recommendation_status} />
                      </div>
                      <div className="mt-2">
                        <PriorityBadge status={r.feasibility_status} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </SectionCard>
        </div>
      ) : (
        <div
          role="tabpanel"
          id="run-detail-panel-exceptions"
          aria-labelledby="run-detail-tab-btn-exceptions"
        >
        <SectionCard
          eyebrow="Exceptions"
          title={
            detail.exceptions.length === 0
              ? "Exceptions"
              : `${detail.exceptions.length} exception${detail.exceptions.length === 1 ? "" : "s"}`
          }
          description="Signals that affected how this run was computed. Resolve these before the next run."
        >
          {detail.exceptions.length === 0 ? (
            <EmptyState
              title="No exceptions"
              description="The planner ran without raising any data-quality or feasibility signals."
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table
                  className="w-full border-collapse text-sm"
                  data-testid="run-detail-exc-table"
                >
                  <thead>
                    <tr className="border-b border-border/70 bg-bg-subtle/60 text-left">
                      <th scope="col" className="px-3 py-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        Item / component
                      </th>
                      <th scope="col" className="px-3 py-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        Exception
                      </th>
                      <th scope="col" className="px-3 py-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        Severity
                      </th>
                      <th scope="col" className="px-3 py-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.exceptions.map((exc) => {
                      const itemName =
                        exc.item_name ??
                        exc.component_name ??
                        "—";
                      const detailMsg = fmtExceptionDetail(exc.detail);
                      const fix = exceptionFixRoute(
                        exc.category,
                        exc.item_id,
                        exc.component_id,
                      );
                      return (
                        <tr
                          key={exc.exception_id}
                          className="border-b border-border/40 last:border-b-0 align-top"
                          data-testid="run-detail-exc-row"
                          data-exception-id={exc.exception_id}
                        >
                          <td className="px-3 py-3 text-sm text-fg-strong">
                            {itemName}
                          </td>
                          <td className="px-3 py-3">
                            <div className="text-sm text-fg">
                              {fmtExceptionCategory(exc.category)}
                            </div>
                            {detailMsg ? (
                              <div className="mt-0.5 text-xs text-fg-muted">
                                {detailMsg}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-3">
                            <ExceptionSeverityBadge severity={exc.severity} />
                          </td>
                          <td className="px-3 py-3">
                            {fix ? (
                              <Link
                                href={fix.href}
                                className="text-xs font-semibold text-accent hover:underline"
                                data-testid="run-detail-exc-fix-link"
                              >
                                {fix.label} →
                              </Link>
                            ) : (
                              <Link
                                href="/planning/blockers"
                                className="text-xs font-semibold text-accent hover:underline"
                                data-testid="run-detail-exc-fix-link"
                              >
                                View in blockers →
                              </Link>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-border/40">
                {detail.exceptions.map((exc) => {
                  const itemName =
                    exc.item_name ?? exc.component_name ?? "—";
                  const detailMsg = fmtExceptionDetail(exc.detail);
                  const fix = exceptionFixRoute(
                    exc.category,
                    exc.item_id,
                    exc.component_id,
                  );
                  return (
                    <div
                      key={exc.exception_id}
                      className="py-3 px-1"
                      data-testid="run-detail-exc-row"
                      data-exception-id={exc.exception_id}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-fg-strong">
                            {itemName}
                          </div>
                          <div className="mt-0.5 text-xs text-fg">
                            {fmtExceptionCategory(exc.category)}
                          </div>
                          {detailMsg ? (
                            <div className="mt-0.5 text-xs text-fg-muted">
                              {detailMsg}
                            </div>
                          ) : null}
                        </div>
                        <ExceptionSeverityBadge severity={exc.severity} />
                      </div>
                      <div className="mt-2">
                        <Link
                          href={fix ? fix.href : "/planning/blockers"}
                          className="text-xs font-semibold text-accent hover:underline"
                        >
                          {fix ? fix.label : "View in blockers"} →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </SectionCard>
        </div>
      )}
    </div>
  );
}
