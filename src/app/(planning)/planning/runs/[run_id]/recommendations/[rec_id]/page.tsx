"use client";

// ---------------------------------------------------------------------------
// /planning/runs/[run_id]/recommendations/[rec_id] — Recommendation Drill-Down
//
// Answers: "Why was this recommendation generated?"
//
// Layout:
//   1. RecDetailHeader — item name, type + status badges, supply method
//   2. ShortageContext — demand / on-hand / open POs / net shortage
//   3. OrderActionCard — recommended qty, MOQ, lead time, action button
//   4. OpenPOsCard — what is already on the way
//   5. ComponentBreakdown — component table (MANUFACTURED/REPACK only)
//   6. ExceptionsCard — scoped exceptions (hidden when empty)
//   7. SourceFooter — run_id, run_created_at, site_id, run_status
//
// State: useRecDetail(rec_id) → TanStack Query, staleTime 60s
// Loading: skeleton per section
// Error: <ErrorState /> with English message
// 404: <ErrorState /> with back link
//
// Role gate: planning:execute (planner/admin) for action button only.
// All roles can view the drill-down.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, X, Factory, FileOutput, Copy } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { ErrorState } from "@/components/feedback/states";
import { useSession } from "@/lib/auth/session-provider";
import { cn } from "@/lib/cn";
import { useRecDetail } from "./_lib/useRecDetail";
import { RecDetailHeader, RecDetailHeaderSkeleton } from "./_components/RecDetailHeader";
import { ShortageContext, ShortageContextSkeleton } from "./_components/ShortageContext";
import { ComponentBreakdown, ComponentBreakdownSkeleton } from "./_components/ComponentBreakdown";
import { OpenPOsCard, OpenPOsCardSkeleton } from "./_components/OpenPOsCard";
import { ExceptionsCard } from "./_components/ExceptionsCard";

function genIdempotencyKey(): string {
  try {
    return (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
      ?.randomUUID?.() ?? `rid-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  } catch {
    return `rid-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

async function postRecAction(
  recId: string,
  action: "approve" | "dismiss",
): Promise<void> {
  const res = await fetch(
    `/api/planning/recommendations/${encodeURIComponent(recId)}/${action}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idempotency_key: genIdempotencyKey() }),
    },
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    let detail = "";
    try {
      detail = (JSON.parse(txt) as { detail?: string }).detail ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Could not ${action} this recommendation. Try again.`);
  }
}

async function postConvertToPO(recId: string): Promise<{ po_id: string; po_number: string | null; idempotent_replay: boolean }> {
  const res = await fetch(
    `/api/planning/recommendations/${encodeURIComponent(recId)}/convert-to-po`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idempotency_key: genIdempotencyKey() }),
    },
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    let detail = "";
    try { detail = (JSON.parse(txt) as { detail?: string }).detail ?? ""; } catch { /* ignore */ }
    throw new Error(detail || "Could not create the purchase order. Try again.");
  }
  return await res.json();
}

function fmtDateAgo(iso: string | null): string {
  if (!iso) return "—";
  try {
    const ms = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 2) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return iso;
  }
}

function fmtDate(iso: string | null): string {
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

function parseQty(s: string): number {
  return parseFloat(s) || 0;
}

function fmtQty(s: string): string {
  const n = parseQty(s);
  return Number.isInteger(n) ? n.toFixed(0) : n.toFixed(2).replace(/\.?0+$/, "");
}

function SkeletonLayout({ runId }: { runId: string }) {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading recommendation…">
      <div className="mb-2">
        <div className="h-4 w-32 animate-pulse rounded bg-bg-subtle" />
      </div>
      <RecDetailHeaderSkeleton />
      <ShortageContextSkeleton />
      <div className="card p-5 space-y-2">
        <div className="h-3 w-32 animate-pulse rounded bg-bg-subtle" />
        <div className="h-5 w-48 animate-pulse rounded bg-bg-subtle" />
        <div className="h-10 w-full animate-pulse rounded bg-bg-subtle" />
      </div>
      <OpenPOsCardSkeleton />
      <ComponentBreakdownSkeleton />
      <div className="card p-5 space-y-2">
        <div className="h-3 w-32 animate-pulse rounded bg-bg-subtle" />
        <div className="h-5 w-48 animate-pulse rounded bg-bg-subtle" />
        <div className="h-16 w-full animate-pulse rounded bg-bg-subtle" />
      </div>
    </div>
  );
}

export default function RecommendationDrillDownPage() {
  const { session } = useSession();
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const runId = String(params?.run_id ?? "");
  const recId = String(params?.rec_id ?? "");

  const canExecute =
    session.role === "planner" || session.role === "admin";

  const { data: result, isLoading, isError } = useRecDetail(recId);

  // Loop 10 — inline approve / dismiss. The planner has every input here
  // to decide (item, qty, MOQ, lead time, components, open POs, exceptions),
  // so making them go back to the run-detail table to click Approve was
  // pure friction. Mutations invalidate both rec-detail and run-detail
  // queries so the parent table reflects the new state immediately.
  const [actionToast, setActionToast] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  // Loop 12 — "approve and continue" navigates after a successful approve.
  // Tracks the post-approve target so the same approve mutation can either
  // stay on the page (manager wants to triage more recs first) or jump
  // straight into execution (the common case for a clean rec).
  const [postApproveTarget, setPostApproveTarget] = useState<
    "stay" | "execute"
  >("stay");

  const convertMut = useMutation({
    mutationFn: () => postConvertToPO(recId),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["rec-detail", recId] });
      void queryClient.invalidateQueries({
        queryKey: ["planning", "run", runId, "recs"],
      });
      router.push(`/purchase-orders/${encodeURIComponent(data.po_id)}`);
    },
    onError: (err: Error) => {
      // Approve already succeeded server-side; surface the convert failure
      // honestly so the planner can finish the job manually instead of
      // discovering the orphaned approval later.
      setActionToast({
        kind: "error",
        message:
          err.message ||
          "Recommendation approved, but the purchase order could not be created. You can create the PO manually from the run table.",
      });
      window.setTimeout(() => setActionToast(null), 6000);
    },
  });

  const approveMut = useMutation({
    mutationFn: () => postRecAction(recId, "approve"),
    onSuccess: () => {
      setActionToast({ kind: "success", message: "Recommendation approved." });
      void queryClient.invalidateQueries({ queryKey: ["rec-detail", recId] });
      void queryClient.invalidateQueries({
        queryKey: ["planning", "run", runId, "recs"],
      });
      // If the manager clicked "Approve and execute", jump into the right
      // execution flow now that the rec is approved server-side.
      if (postApproveTarget === "execute") {
        const isProd = result?.data?.rec_type === "production";
        const itemId = result?.data?.item_id ?? "";
        const recommendedQty = result?.data?.recommended_qty ?? "";
        if (isProd) {
          router.push(
            `/ops/stock/production-actual` +
              `?item_id=${encodeURIComponent(itemId)}` +
              `&suggested_qty=${encodeURIComponent(recommendedQty)}` +
              `&from_rec=${encodeURIComponent(recId)}` +
              `&from_run=${encodeURIComponent(runId)}`,
          );
        } else {
          // Purchase recs: chain straight into convert-to-PO. There is no
          // /convert portal page — the API does the work and we navigate
          // to the resulting PO. If convert fails, convertMut.onError
          // surfaces the orphaned-approval message.
          convertMut.mutate();
        }
        setPostApproveTarget("stay");
        return;
      }
      window.setTimeout(() => setActionToast(null), 3500);
    },
    onError: (err: Error) => {
      setActionToast({ kind: "error", message: err.message });
      setPostApproveTarget("stay");
      window.setTimeout(() => setActionToast(null), 6000);
    },
  });

  const dismissMut = useMutation({
    mutationFn: () => postRecAction(recId, "dismiss"),
    onSuccess: () => {
      setActionToast({ kind: "success", message: "Recommendation dismissed." });
      void queryClient.invalidateQueries({ queryKey: ["rec-detail", recId] });
      void queryClient.invalidateQueries({
        queryKey: ["planning", "run", runId, "recs"],
      });
      window.setTimeout(() => setActionToast(null), 3500);
    },
    onError: (err: Error) => {
      setActionToast({ kind: "error", message: err.message });
      window.setTimeout(() => setActionToast(null), 6000);
    },
  });

  if (isLoading) {
    return <SkeletonLayout runId={runId} />;
  }

  if (isError) {
    return (
      <ErrorState
        title="Could not load recommendation"
        description="Something went wrong loading this recommendation. Check your connection and try again."
        action={
          <div className="flex flex-wrap gap-2 justify-center">
            <Link
              href={`/planning/runs/${encodeURIComponent(runId)}`}
              className="btn btn-sm gap-1.5"
            >
              <ArrowLeft className="h-3 w-3" strokeWidth={2.5} />
              Back to recommendations
            </Link>
            <Link href="/planning/runs" className="btn btn-sm">
              View all planning runs
            </Link>
          </div>
        }
      />
    );
  }

  if (result?.notFound) {
    return (
      <ErrorState
        title="Recommendation not found"
        description="No recommendation matches this id. The run may have been superseded, or the recommendation no longer exists."
        action={
          <div className="flex flex-wrap gap-2 justify-center">
            <Link
              href={`/planning/runs/${encodeURIComponent(runId)}`}
              className="btn btn-sm gap-1.5"
            >
              <ArrowLeft className="h-3 w-3" strokeWidth={2.5} />
              Back to recommendations
            </Link>
            <Link href="/planning/runs" className="btn btn-sm">
              View all planning runs
            </Link>
          </div>
        }
      />
    );
  }

  if (result?.error || !result?.data) {
    return (
      <ErrorState
        title="Could not load recommendation"
        description={result?.error ?? "Unknown error."}
        action={
          <div className="flex flex-wrap gap-2 justify-center">
            <Link
              href={`/planning/runs/${encodeURIComponent(runId)}`}
              className="btn btn-sm gap-1.5"
            >
              <ArrowLeft className="h-3 w-3" strokeWidth={2.5} />
              Back to recommendations
            </Link>
            <Link href="/planning/runs" className="btn btn-sm">
              View all planning runs
            </Link>
          </div>
        }
      />
    );
  }

  const rec = result.data;
  const isApprovedAndUnconverted =
    rec.rec_status === "approved" && rec.converted_po_id === null;
  const isProductionRec = rec.rec_type === "production";
  const isDraft = rec.rec_status === "draft";
  const isMutating = approveMut.isPending || dismissMut.isPending || convertMut.isPending;

  // For production recs, deep-link to /ops/stock/production-actual with
  // item_id + suggested_qty + breadcrumb params. For purchase recs, route
  // to the existing convert-to-PO flow.
  const productionFormHref =
    `/ops/stock/production-actual` +
    `?item_id=${encodeURIComponent(rec.item_id)}` +
    `&suggested_qty=${encodeURIComponent(rec.recommended_qty)}` +
    `&from_rec=${encodeURIComponent(recId)}` +
    `&from_run=${encodeURIComponent(runId)}`;

  return (
    <div className="space-y-5">
      {/* Back link */}
      <div className="mb-2">
        <Link
          href={`/planning/runs/${encodeURIComponent(runId)}`}
          className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
          data-testid="rec-detail-back-link"
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2} />
          Back to recommendations
        </Link>
      </div>

      {/* 1. Header */}
      <RecDetailHeader rec={rec} />

      {/* 2. Shortage / reason */}
      <ShortageContext rec={rec} />

      {/* 3. Action card — recommended qty + action button */}
      <SectionCard
        eyebrow="Recommended action"
        title="What to do next"
      >
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div>
            <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Recommended qty
            </dt>
            <dd className="mt-0.5 font-mono text-base font-bold tabular-nums text-fg-strong">
              {fmtQty(rec.recommended_qty)}
            </dd>
          </div>
          {rec.moq !== null && (
            <div>
              <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                MOQ
              </dt>
              <dd className="mt-0.5 font-mono text-xs tabular-nums text-fg-muted">
                {fmtQty(rec.moq)}
              </dd>
            </div>
          )}
          {rec.lead_time_days !== null && (
            <div>
              <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Lead time
              </dt>
              {/* The current RecommendationDetailResponse DTO does not
                  include a lead_time_source field — we cannot tell whether
                  this number came from supplier_items, item override, or a
                  default. T1 surfaces the gap honestly with a caveat instead
                  of implying false precision. Add to W1 contract backlog
                  (W1-FOLLOWUP-REC-DETAIL-LEAD-TIME-SOURCE). */}
              <dd className="mt-0.5 text-xs text-fg-muted">
                {rec.lead_time_days}{" "}
                {rec.lead_time_days === 1 ? "day" : "days"}{" "}
                <span className="text-fg-subtle">(source unknown)</span>
              </dd>
            </div>
          )}
          {rec.suggested_order_date !== null && (
            <div>
              <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Order by
              </dt>
              <dd className="mt-0.5 text-xs font-medium text-fg-strong">
                {fmtDate(rec.suggested_order_date)}
              </dd>
            </div>
          )}
        </dl>

        {/* Action buttons — adapts to rec_status × rec_type:
            - draft: "Approve" / "Dismiss" — inline approve/dismiss (loop 10)
            - approved purchase: "Create purchase order" → /convert flow
            - approved production: "Open production report" → /ops/stock/production-actual
              with prefilled item_id + suggested_qty + back-chain breadcrumb */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {canExecute && isDraft ? (
            <>
              {/* Loop 12 — "Approve and execute" collapses approve+execute into
                  one click for the common case where the planner has already
                  decided. Production: approve → production form prefilled.
                  Purchase: approve → /convert flow. The standalone "Approve
                  only" stays on this page so a planner who's batch-triaging
                  many recs can approve without navigating away. */}
              <button
                type="button"
                className="btn btn-primary btn-sm gap-1.5"
                data-testid="rec-detail-approve-and-execute-btn"
                disabled={isMutating}
                onClick={() => {
                  setPostApproveTarget("execute");
                  approveMut.mutate();
                }}
                title={
                  isProductionRec
                    ? "Approve this rec and open the Production Actual form prefilled"
                    : "Approve this rec and continue to the Create PO flow"
                }
              >
                {isProductionRec ? (
                  <Factory className="h-3 w-3" strokeWidth={2.5} />
                ) : (
                  <FileOutput className="h-3 w-3" strokeWidth={2.5} />
                )}
                {approveMut.isPending && postApproveTarget === "execute"
                  ? "Approving…"
                  : convertMut.isPending
                    ? "Creating purchase order…"
                    : isProductionRec
                      ? "Approve and open production form"
                      : "Approve and create purchase order"}
              </button>
              <button
                type="button"
                className="btn btn-sm gap-1.5"
                data-testid="rec-detail-approve-btn"
                disabled={isMutating}
                onClick={() => {
                  setPostApproveTarget("stay");
                  approveMut.mutate();
                }}
                title="Approve only — stay on this page"
              >
                <Check className="h-3 w-3" strokeWidth={2.5} />
                {approveMut.isPending && postApproveTarget === "stay"
                  ? "Approving…"
                  : "Approve only"}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm gap-1.5 text-danger"
                data-testid="rec-detail-dismiss-btn"
                disabled={isMutating}
                onClick={() => dismissMut.mutate()}
              >
                <X className="h-3 w-3" strokeWidth={2.5} />
                {dismissMut.isPending ? "Dismissing…" : "Dismiss"}
              </button>
            </>
          ) : null}
          {canExecute && isApprovedAndUnconverted && !isProductionRec ? (
            <button
              type="button"
              className="btn btn-sm gap-1.5"
              data-testid="rec-detail-create-po-btn"
              disabled={isMutating}
              onClick={() => convertMut.mutate()}
            >
              <FileOutput className="h-3 w-3" strokeWidth={2.5} />
              {convertMut.isPending ? "Creating purchase order…" : "Create purchase order"}
            </button>
          ) : null}
          {canExecute && isProductionRec && rec.rec_status === "approved" ? (
            <Link
              href={productionFormHref}
              className="btn btn-primary btn-sm gap-1.5"
              data-testid="rec-detail-open-production-form-btn"
              title={`Open Production Actual form prefilled with ${rec.item_name} × ${fmtQty(rec.recommended_qty)} (you can adjust before submit)`}
            >
              Open production report
            </Link>
          ) : null}

          {rec.converted_po_id !== null ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-fg-muted">Existing PO:</span>
              <Link
                href={`/purchase-orders/${encodeURIComponent(rec.converted_po_id)}`}
                className="text-xs text-accent hover:underline font-mono"
                data-testid="rec-detail-po-link"
              >
                {rec.converted_po_id.slice(0, 8)}…
              </Link>
              <Badge tone="success" dotted>Converted</Badge>
            </div>
          ) : null}
        </div>

        {actionToast ? (
          <div
            className={cn(
              "mt-3 rounded-md border px-3 py-2 text-xs",
              actionToast.kind === "success"
                ? "border-success/40 bg-success-softer text-success-fg"
                : "border-danger/40 bg-danger-softer text-danger-fg",
            )}
            data-testid="rec-detail-action-toast"
            role="status"
          >
            {actionToast.message}
          </div>
        ) : null}
      </SectionCard>

      {/* 4. Open POs */}
      <OpenPOsCard rec={rec} />

      {/* 5. Component breakdown */}
      <ComponentBreakdown rec={rec} />

      {/* 6. Scoped exceptions (hidden when empty) */}
      {rec.scoped_exceptions.length > 0 ? (
        <ExceptionsCard exceptions={rec.scoped_exceptions} />
      ) : null}

      {/* 7. Source / freshness footer */}
      <SectionCard
        eyebrow="Source"
        title="Planning run"
        description="Details of the planning run that produced this recommendation"
        density="compact"
      >
        <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Run id
            </dt>
            <dd className="mt-0.5 font-mono text-fg inline-flex items-center gap-1">
              <Link
                href={`/planning/runs/${encodeURIComponent(rec.run_id)}`}
                className="text-accent hover:underline"
              >
                {rec.run_id.slice(0, 8)}…
              </Link>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded p-0.5 text-fg-subtle hover:text-fg hover:bg-bg-subtle"
                title="Copy full id"
                aria-label="Copy run id"
                onClick={() => {
                  void navigator.clipboard.writeText(rec.run_id);
                }}
              >
                <Copy className="h-3 w-3" strokeWidth={2} />
              </button>
              <span className="text-fg-muted">
                ({fmtDateAgo(rec.run_created_at)})
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Site
            </dt>
            <dd className="mt-0.5 font-mono text-fg">{rec.planning_run_site_id}</dd>
          </div>
          <div>
            <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Run status
            </dt>
            <dd className="mt-0.5 text-fg capitalize">{rec.planning_run_status}</dd>
          </div>
          <div>
            <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Source forecast
            </dt>
            {/* Forecast version that drove this rec is a contract gap — not in the
                current RecommendationDetailResponse DTO. T1 surfaces the gap honestly
                rather than hiding it. Add to W1 contract backlog
                (W1-FOLLOWUP-REC-DETAIL-FORECAST-VERSION). */}
            <dd className="mt-0.5 text-fg-muted text-xs">Not available — W1 follow-up</dd>
          </div>
        </dl>
      </SectionCard>
    </div>
  );
}
