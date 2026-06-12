"use client";

// ---------------------------------------------------------------------------
// Admin · Price updates — /admin/cost-drafts (Tranche 043, Price Truth).
//
// The pending supplier_cost_drafts queue: prices entered on purchase orders
// (manual /new form or the procurement focus mode) whose delta vs the current
// effective cost exceeded the auto-approve threshold — or arrived without the
// "update catalog prices" confirmation — land here for admin review.
//
//   GET  /api/cost-drafts?status=…              — list (pending first)
//   POST /api/cost-drafts/[draft_id]/approve    — writes price_history (0228)
//   POST /api/cost-drafts/[draft_id]/reject     — keeps catalog cost unchanged
//
// Response/request shapes mirror gt-factory-os/api/src/cost-drafts/schemas.ts.
// Approving changes RM cost truth, so success invalidates the stock-value and
// economics read models alongside this queue.
//
// Role gate: (admin)/layout.tsx already gates on admin:execute.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { CircleDollarSign } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge, type BadgeTone } from "@/components/badges/StatusBadge";
import { EmptyState, ErrorState } from "@/components/feedback/states";
import { formatIls, formatPct } from "@/lib/utils/format-money";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Response shapes — mirror of api/src/cost-drafts/schemas.ts
// ---------------------------------------------------------------------------

type DraftStatus = "pending" | "approved" | "rejected" | "superseded";

interface CostDraftRow {
  supplier_cost_draft_id: string;
  supplier_item_id: string;
  supplier_id: string;
  supplier_name: string | null;
  component_id: string | null;
  item_id: string | null;
  target_name: string | null;
  suggested_cost_ils: string;
  current_supplier_cost: string | null;
  current_effective_cost: string | null;
  source_invoice_id: string | null;
  source_invoice_date: string | null;
  source_line_ref: string | null;
  reviewer_note: string | null;
  status: DraftStatus;
  approved_at: string | null;
  approved_actor_snapshot: string | null;
  resulting_price_history_id: string | null;
  rejected_at: string | null;
  rejected_actor_snapshot: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface CostDraftsListResponse {
  rows: CostDraftRow[];
  count: number;
  pending_count: number;
}

interface CostDraftDecisionResponse {
  draft: CostDraftRow;
  price_history_id: string | null;
  idempotent_replay: boolean;
  submission_id: string;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

// Auto-approve threshold (pricing.write_back.auto_approve_max_delta_pct,
// Tom-approved T3 = 25%). Deltas at or under it render success-toned; larger
// deltas render warning-toned so the risky rows stand out.
const DELTA_WARN_PCT = 25;

/** Signed delta % of suggested vs current effective cost; null when the
 *  current cost is unknown or zero (a brand-new price has no delta). */
function deltaPct(row: CostDraftRow): number | null {
  const current = Number(row.current_effective_cost);
  const suggested = Number(row.suggested_cost_ils);
  if (!Number.isFinite(current) || current === 0) return null;
  if (!Number.isFinite(suggested)) return null;
  return ((suggested - current) / current) * 100;
}

/** Parses source_line_ref ('po:<po_id>:line:<n>' | 'gr:<id>:line:<n>' per
 *  migration 0188/0229/0230 conventions) into a renderable reference. */
function parseSourceRef(
  ref: string | null,
): { kind: "po" | "gr" | "other"; id: string | null; label: string } {
  if (!ref) return { kind: "other", id: null, label: "—" };
  const m = ref.match(/^(po|gr):([^:]+)(?::line:(\d+))?/);
  if (!m) return { kind: "other", id: null, label: ref };
  const [, kind, id, lineNo] = m;
  const shortId = id.length > 8 ? `${id.slice(0, 8)}…` : id;
  const label = `${kind.toUpperCase()} ${shortId}${lineNo ? ` · line ${lineNo}` : ""}`;
  return { kind: kind as "po" | "gr", id, label };
}

function fmtDate(iso: string): string {
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

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cost-draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Small presentational bits
// ---------------------------------------------------------------------------

const STATUS_TONE: Record<DraftStatus, BadgeTone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  superseded: "muted",
};
const STATUS_LABEL: Record<DraftStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  superseded: "Superseded",
};

function DeltaBadge({ row }: { row: CostDraftRow }): JSX.Element {
  const pct = deltaPct(row);
  if (pct === null) {
    return (
      <Badge tone="neutral" size="xs">
        new price
      </Badge>
    );
  }
  const tone: BadgeTone = Math.abs(pct) <= DELTA_WARN_PCT ? "success" : "warning";
  return (
    <Badge tone={tone} size="xs">
      {pct > 0 ? "+" : ""}
      {formatPct(pct)}
    </Badge>
  );
}

type FilterKey = DraftStatus | "all";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminCostDraftsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterKey>("pending");
  const [banner, setBanner] = useState<
    { kind: "success" | "error"; message: string } | null
  >(null);

  const draftsQuery = useQuery<CostDraftsListResponse>({
    queryKey: ["admin", "cost-drafts", filter],
    queryFn: async () => {
      const qs =
        filter === "all" ? "?limit=500" : `?status=${filter}&limit=500`;
      const res = await fetch(`/api/cost-drafts${qs}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error(
          `Could not load price updates (HTTP ${res.status}). Check your connection and try again.`,
        );
      }
      return (await res.json()) as CostDraftsListResponse;
    },
  });

  const decisionMutation = useMutation<
    CostDraftDecisionResponse,
    Error,
    { draftId: string; action: "approve" | "reject"; targetName: string }
  >({
    mutationFn: async ({ draftId, action }) => {
      const res = await fetch(
        `/api/cost-drafts/${encodeURIComponent(draftId)}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idempotency_key: newIdempotencyKey() }),
        },
      );
      const body = (await res.json().catch(() => null)) as
        | (CostDraftDecisionResponse & {
            reason_code?: string;
            detail?: string;
            error?: string;
          })
        | null;
      if (!res.ok) {
        const msg = body?.reason_code
          ? `${body.reason_code}${body.detail ? ` — ${body.detail}` : ""}`
          : (body?.error ??
            `Could not ${action} this price update (HTTP ${res.status}).`);
        throw new Error(msg);
      }
      return body as CostDraftDecisionResponse;
    },
    onSuccess: (_data, { action, targetName }) => {
      setBanner({
        kind: "success",
        message:
          action === "approve"
            ? `Price update for ${targetName} approved — the catalog cost now uses the new price.`
            : `Price update for ${targetName} rejected — the catalog cost stays unchanged.`,
      });
      // Approving changes RM cost truth: refresh this queue + the stock-value
      // and economics read models that derive from supplier costs.
      void queryClient.invalidateQueries({ queryKey: ["admin", "cost-drafts"] });
      void queryClient.invalidateQueries({ queryKey: ["stock", "value"] });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "economics", "raw-materials"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["dashboard", "economics", "rm-costs"],
      });
    },
    onError: (err) => {
      setBanner({ kind: "error", message: err.message });
    },
  });

  const actingDraftId = decisionMutation.isPending
    ? decisionMutation.variables?.draftId
    : undefined;

  const handleDecision = (
    row: CostDraftRow,
    action: "approve" | "reject",
  ): void => {
    const targetName = row.target_name ?? row.supplier_item_id;
    if (action === "reject") {
      const ok = window.confirm(
        `Reject this price update for ${targetName}? The catalog cost stays unchanged.`,
      );
      if (!ok) return;
    }
    setBanner(null);
    decisionMutation.mutate({
      draftId: row.supplier_cost_draft_id,
      action,
      targetName,
    });
  };

  const rows = draftsQuery.data?.rows ?? [];
  const pendingCount = draftsQuery.data?.pending_count ?? 0;

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin · price updates"
        title="Price updates"
        description="Prices entered on purchase orders that need review before they become the catalog cost. Approving writes the new cost to price history; rejecting keeps the current cost."
        meta={
          draftsQuery.data ? (
            <Badge
              tone={pendingCount > 0 ? "warning" : "success"}
              dotted
            >
              {pendingCount > 0
                ? `${pendingCount} pending`
                : "queue clear"}
            </Badge>
          ) : null
        }
      />

      {banner ? (
        <div
          role={banner.kind === "error" ? "alert" : "status"}
          data-testid="cost-drafts-banner"
          className={cn(
            "rounded-md border p-4 text-sm",
            banner.kind === "success"
              ? "border-success/40 bg-success-softer text-success-fg"
              : "border-danger/40 bg-danger-softer text-danger-fg",
          )}
        >
          {banner.message}
        </div>
      ) : null}

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            data-testid={`cost-drafts-filter-${f.key}`}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
              filter === f.key
                ? "border-accent bg-accent-soft text-accent"
                : "border-border/60 bg-bg-subtle/40 text-fg-muted hover:text-fg",
            )}
            aria-pressed={filter === f.key}
          >
            {f.label}
          </button>
        ))}
      </div>

      <SectionCard
        eyebrow="Review queue"
        title="Supplier cost drafts"
        description="Pending rows sort first. Current cost is the effective cost the platform uses today (supplier cost, with component fallback)."
        contentClassName="p-0"
      >
        {draftsQuery.isLoading ? (
          <div className="p-5">
            <div className="space-y-2" aria-busy="true" aria-live="polite">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex animate-pulse gap-3 border-b border-border/30 pb-2"
                >
                  <div className="h-4 w-40 shrink-0 rounded bg-bg-subtle" />
                  <div className="h-4 w-24 shrink-0 rounded bg-bg-subtle" />
                  <div className="h-4 flex-1 rounded bg-bg-subtle" />
                  <div className="h-4 w-20 shrink-0 rounded bg-bg-subtle" />
                </div>
              ))}
            </div>
          </div>
        ) : draftsQuery.isError ? (
          <div className="p-5">
            <ErrorState
              title="Could not load price updates"
              description={(draftsQuery.error as Error).message}
              onRetry={() => void draftsQuery.refetch()}
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={
                filter === "pending"
                  ? "No pending price updates"
                  : "No price updates here"
              }
              description={
                filter === "pending"
                  ? "Prices entered on purchase orders that need review will appear here."
                  : "Switch the status filter to see other price updates."
              }
              icon={
                <CircleDollarSign
                  className="h-5 w-5 text-fg-faint"
                  strokeWidth={1.5}
                />
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base" data-testid="cost-drafts-table">
              <thead>
                <tr>
                  <th>Component / item</th>
                  <th>Current cost</th>
                  <th>Proposed cost</th>
                  <th>Delta</th>
                  <th>Source</th>
                  <th>Created</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const ref = parseSourceRef(row.source_line_ref);
                  const isActing =
                    actingDraftId === row.supplier_cost_draft_id;
                  const targetName =
                    row.target_name ?? row.supplier_item_id;
                  return (
                    <tr
                      key={row.supplier_cost_draft_id}
                      data-testid={`cost-drafts-row-${row.supplier_cost_draft_id}`}
                    >
                      <td>
                        <div className="text-sm font-medium text-fg">
                          {targetName}
                        </div>
                        <div className="mt-0.5 text-3xs text-fg-muted">
                          {row.supplier_name ?? "Unknown supplier"}
                        </div>
                      </td>
                      <td className="font-mono text-xs tabular-nums text-fg-muted">
                        {formatIls(row.current_effective_cost)}
                      </td>
                      <td className="font-mono text-xs tabular-nums font-semibold">
                        {formatIls(row.suggested_cost_ils)}
                      </td>
                      <td>
                        <DeltaBadge row={row} />
                      </td>
                      <td>
                        {ref.kind === "po" && ref.id ? (
                          <Link
                            href={`/purchase-orders/${encodeURIComponent(ref.id)}`}
                            className="font-mono text-xs text-accent underline-offset-2 hover:underline"
                            data-testid={`cost-drafts-source-link-${row.supplier_cost_draft_id}`}
                          >
                            {ref.label}
                          </Link>
                        ) : (
                          <span className="font-mono text-xs text-fg-muted">
                            {ref.label}
                          </span>
                        )}
                      </td>
                      <td>
                        <span
                          className="text-xs text-fg-muted"
                          title={new Date(row.created_at).toLocaleString()}
                        >
                          {fmtDate(row.created_at)}
                        </span>
                      </td>
                      <td>
                        <Badge tone={STATUS_TONE[row.status]} size="xs" dot>
                          {STATUS_LABEL[row.status]}
                        </Badge>
                      </td>
                      <td>
                        {row.status === "pending" ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              className="btn btn-sm btn-primary px-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={decisionMutation.isPending}
                              onClick={() => handleDecision(row, "approve")}
                              data-testid={`cost-drafts-approve-${row.supplier_cost_draft_id}`}
                            >
                              {isActing &&
                              decisionMutation.variables?.action === "approve"
                                ? "Approving…"
                                : "Approve"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost px-2.5 text-xs text-danger-fg disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={decisionMutation.isPending}
                              onClick={() => handleDecision(row, "reject")}
                              data-testid={`cost-drafts-reject-${row.supplier_cost_draft_id}`}
                            >
                              {isActing &&
                              decisionMutation.variables?.action === "reject"
                                ? "Rejecting…"
                                : "Reject"}
                            </button>
                          </div>
                        ) : (
                          <span className="text-3xs text-fg-faint">
                            {row.status === "approved"
                              ? "Applied to catalog"
                              : row.status === "rejected"
                                ? (row.rejection_reason ?? "Kept current cost")
                                : "Replaced by a newer draft"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}
