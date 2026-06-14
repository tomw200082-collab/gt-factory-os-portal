"use client";

// ---------------------------------------------------------------------------
// /planning/runs/[run_id]/recommendations/[rec_id] — Recommendation Drill-Down
//
// Answers: "Why was this recommendation generated?"
//
// Layout:
//   1. RecDetailHeader — item name, type + status badges, supply method
//   2. ShortageContext — demand / on-hand / open POs / net shortage (+ demand breakdown sub-rows)
//   3. OrderActionCard — recommended qty, MOQ, lead time, action button
//   4. OpenPOsCard — what is already on the way
//   5. ComponentBreakdown — component table (MANUFACTURED/REPACK only)
//   6. PolicyAppliedCard — planning mode badge + key dates (v1.2)
//   7. StockCurveCard — weekly projected on-hand curve (hidden when empty)
//   8. ExceptionsCard — scoped exceptions (hidden when empty)
//   9. SourceFooter — run_id, run_created_at, site_id, run_status
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
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { ErrorState } from "@/components/feedback/states";
import { useRecDetail } from "./_lib/useRecDetail";
import type { LeadTimeSource } from "./_lib/types";
import { RecDetailHeader, RecDetailHeaderSkeleton } from "./_components/RecDetailHeader";
import { ShortageContext, ShortageContextSkeleton } from "./_components/ShortageContext";
import { ComponentBreakdown, ComponentBreakdownSkeleton } from "./_components/ComponentBreakdown";
import { OpenPOsCard, OpenPOsCardSkeleton } from "./_components/OpenPOsCard";
import { ExceptionsCard } from "./_components/ExceptionsCard";
import { PolicyAppliedCard, PolicyAppliedCardSkeleton } from "./_components/PolicyAppliedCard";
import { StockCurveCard, StockCurveCardSkeleton } from "./_components/StockCurveCard";

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

// DTO v1.1 (signal #21) — friendly chip labels for lead_time_source. Keys
// match LeadTimeSourceValues const exhaustively (Record<…> enforces this at
// build time). 'unknown' is a normal terminal state — render the chip in a
// soft warning tone to flag the missing provenance for data-cleanup, not as
// an error.
const LEAD_TIME_SOURCE_LABELS: Record<LeadTimeSource, string> = {
  supplier_items: "Supplier-defined",
  supplier_default: "Supplier default",
  recommendation_snapshot: "Run snapshot",
  unknown: "Source unknown",
};

function SkeletonLayout(_props: { runId: string }) {
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
      <PolicyAppliedCardSkeleton />
      <StockCurveCardSkeleton />
      <div className="card p-5 space-y-2">
        <div className="h-3 w-32 animate-pulse rounded bg-bg-subtle" />
        <div className="h-5 w-48 animate-pulse rounded bg-bg-subtle" />
        <div className="h-16 w-full animate-pulse rounded bg-bg-subtle" />
      </div>
    </div>
  );
}

export default function RecommendationDrillDownPage() {
  const params = useParams();
  const runId = String(params?.run_id ?? "");
  const recId = String(params?.rec_id ?? "");

  const { data: result, isLoading, isError } = useRecDetail(recId);

  // Tranche 072 — planning runs are diagnostic-only. No write mutations here;
  // approve / dismiss live in the Inbox and convert-to-PO lives in Procurement.

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
              {/* DTO v1.1 (signal #21) lead_time_source consumption: shows a
                  small chip naming the resolution path. Cascade priority is
                  supplier_items → supplier_default → recommendation_snapshot
                  → 'unknown' fallback. Closes W2 cycle 3 marker
                  W1-FOLLOWUP-REC-DETAIL-LEAD-TIME-SOURCE. */}
              <dd className="mt-0.5 text-xs text-fg-muted flex flex-wrap items-center gap-1.5">
                <span className="font-mono tabular-nums text-fg-strong">
                  {rec.lead_time_days}
                </span>
                <span>{rec.lead_time_days === 1 ? "day" : "days"}</span>
                <Badge
                  tone={rec.lead_time_source === "unknown" ? "warning" : "info"}
                  variant="soft"
                >
                  {LEAD_TIME_SOURCE_LABELS[rec.lead_time_source]}
                </Badge>
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
            - approved production: "Open production report" → /stock/production-actual
              with prefilled item_id + suggested_qty + back-chain breadcrumb */}
        {/* Tranche 072 — planning runs are diagnostic-only. Recommendation
            approve / dismiss live in the Inbox; converting an approved purchase
            recommendation into a PO lives in Procurement. This drill-in is
            read-only: it shows the conversion result when present, otherwise
            points to where to act. */}
        <div className="mt-4 space-y-3">
          {rec.converted_po_id !== null ? (
            <div className="flex items-center gap-2">
              <Badge tone="success" dotted>Converted</Badge>
              <Link
                href={`/purchase-orders/${encodeURIComponent(rec.converted_po_id)}`}
                className="text-xs text-accent hover:underline"
                data-testid="rec-detail-po-link"
              >
                Open purchase order →
              </Link>
            </div>
          ) : (
            <div
              className="rounded-md border border-border/60 bg-bg-subtle/50 p-3 text-xs leading-relaxed text-fg-muted"
              data-testid="rec-detail-diagnostic-guidance"
            >
              Planning runs are diagnostic. Approve or dismiss recommendations in
              the{" "}
              <Link
                href="/inbox"
                className="font-medium text-accent hover:underline"
              >
                Inbox
              </Link>
              ; convert approved purchase recommendations into purchase orders in{" "}
              <Link
                href="/planning/procurement"
                className="font-medium text-accent hover:underline"
              >
                Procurement
              </Link>
              .
            </div>
          )}
        </div>

      </SectionCard>

      {/* 4. Open POs */}
      <OpenPOsCard rec={rec} />

      {/* 5. Component breakdown */}
      <ComponentBreakdown rec={rec} />

      {/* 6. Planning policy */}
      <PolicyAppliedCard rec={rec} />

      {/* 7. Stock coverage curve (hidden when empty) */}
      <StockCurveCard rec={rec} />

      {/* 8. Scoped exceptions (hidden when empty) */}
      {rec.scoped_exceptions.length > 0 ? (
        <ExceptionsCard exceptions={rec.scoped_exceptions} />
      ) : null}

      {/* 9. Source / freshness footer */}
      <SectionCard
        eyebrow="Source"
        title="Planning run"
        description="Details of the planning run that produced this recommendation"
        density="compact"
      >
        <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Planning run
            </dt>
            <dd className="mt-0.5 inline-flex items-center gap-2">
              <Link
                href={`/planning/runs/${encodeURIComponent(rec.run_id)}`}
                className="text-accent hover:underline"
                data-testid="rec-detail-run-link"
              >
                Open run
              </Link>
              <span className="text-fg-muted">
                ({fmtDateAgo(rec.run_created_at)})
              </span>
            </dd>
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
            {rec.forecast_version_id !== null ? (
              <dd className="mt-0.5 text-xs">
                <Link
                  href={`/planning/forecast/${encodeURIComponent(rec.forecast_version_id)}`}
                  className="text-accent hover:underline"
                  data-testid="rec-detail-forecast-version-link"
                >
                  Open forecast →
                </Link>
              </dd>
            ) : (
              <dd className="mt-0.5 text-xs text-fg-muted">Not recorded for this run</dd>
            )}
          </div>
        </dl>
      </SectionCard>
    </div>
  );
}
