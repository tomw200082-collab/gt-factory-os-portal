"use client";

// ---------------------------------------------------------------------------
// /planning/runs/[run_id]/recommendations/[rec_id] — Recommendation Drill-Down
//
// Answers: "למה נוצרה ההמלצה הזו?"
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
// Error: <ErrorState /> with Hebrew message
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
import { useSession } from "@/lib/auth/session-provider";
import { useRecDetail } from "./_lib/useRecDetail";
import { RecDetailHeader, RecDetailHeaderSkeleton } from "./_components/RecDetailHeader";
import { ShortageContext, ShortageContextSkeleton } from "./_components/ShortageContext";
import { ComponentBreakdown, ComponentBreakdownSkeleton } from "./_components/ComponentBreakdown";
import { OpenPOsCard, OpenPOsCardSkeleton } from "./_components/OpenPOsCard";
import { ExceptionsCard } from "./_components/ExceptionsCard";

function fmtDateAgo(iso: string | null): string {
  if (!iso) return "—";
  try {
    const ms = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 2) return "כרגע";
    if (mins < 60) return `לפני ${mins} דק'`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `לפני ${hrs} שע'`;
    const days = Math.floor(hrs / 24);
    return `לפני ${days} ימים`;
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
    <div className="space-y-5" aria-busy="true" aria-label="טוען המלצה…">
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
  const runId = String(params?.run_id ?? "");
  const recId = String(params?.rec_id ?? "");

  const canExecute =
    session.role === "planner" || session.role === "admin";

  const { data: result, isLoading, isError } = useRecDetail(recId);

  if (isLoading) {
    return <SkeletonLayout runId={runId} />;
  }

  if (isError) {
    return (
      <ErrorState
        title="לא ניתן לטעון פרטי ההמלצה"
        description="אירעה שגיאה בעת טעינת ההמלצה. בדוק את החיבור ונסה שוב."
        action={
          <Link
            href={`/planning/runs/${encodeURIComponent(runId)}`}
            className="btn btn-sm gap-1.5"
          >
            <ArrowLeft className="h-3 w-3" strokeWidth={2.5} />
            חזרה להמלצות
          </Link>
        }
      />
    );
  }

  if (result?.notFound) {
    return (
      <ErrorState
        title="ההמלצה לא נמצאה"
        description="לא קיימת המלצה עם מזהה זה. ייתכן שהיא הוחלפה או שאינה קיימת."
        action={
          <Link
            href={`/planning/runs/${encodeURIComponent(runId)}`}
            className="btn btn-sm gap-1.5"
          >
            <ArrowLeft className="h-3 w-3" strokeWidth={2.5} />
            חזרה להמלצות
          </Link>
        }
      />
    );
  }

  if (result?.error || !result?.data) {
    return (
      <ErrorState
        title="לא ניתן לטעון פרטי ההמלצה"
        description={result?.error ?? "שגיאה לא ידועה"}
        action={
          <Link
            href={`/planning/runs/${encodeURIComponent(runId)}`}
            className="btn btn-sm gap-1.5"
          >
            <ArrowLeft className="h-3 w-3" strokeWidth={2.5} />
            חזרה להמלצות
          </Link>
        }
      />
    );
  }

  const rec = result.data;
  const isApprovedAndUnconverted =
    rec.rec_status === "approved" && rec.converted_po_id === null;

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
          חזרה להמלצות
        </Link>
      </div>

      {/* 1. Header */}
      <RecDetailHeader rec={rec} />

      {/* 2. Shortage / reason */}
      <ShortageContext rec={rec} />

      {/* 3. Action card — recommended qty + action button */}
      <SectionCard
        eyebrow="פעולה מומלצת"
        title="מה עושים עכשיו?"
      >
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div>
            <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              כמות מומלצת:
            </dt>
            <dd className="mt-0.5 font-mono text-base font-bold tabular-nums text-fg-strong">
              {fmtQty(rec.recommended_qty)}
            </dd>
          </div>
          {rec.moq !== null && (
            <div>
              <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                MOQ:
              </dt>
              <dd className="mt-0.5 font-mono text-xs tabular-nums text-fg-muted">
                {fmtQty(rec.moq)}
              </dd>
            </div>
          )}
          {rec.lead_time_days !== null && (
            <div>
              <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                זמן אספקה:
              </dt>
              <dd className="mt-0.5 text-xs text-fg-muted">
                {rec.lead_time_days}{" "}
                {rec.lead_time_days === 1 ? "יום" : "ימים"}
              </dd>
            </div>
          )}
          {rec.suggested_order_date !== null && (
            <div>
              <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                תאריך הזמנה מוצע:
              </dt>
              <dd className="mt-0.5 text-xs font-medium text-fg-strong">
                {fmtDate(rec.suggested_order_date)}
              </dd>
            </div>
          )}
        </dl>

        {/* Action buttons */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {canExecute && isApprovedAndUnconverted ? (
            <Link
              href={`/planning/runs/${encodeURIComponent(runId)}/recommendations/${encodeURIComponent(recId)}/convert`}
              className="btn btn-sm gap-1.5"
              data-testid="rec-detail-create-po-btn"
            >
              צור הזמנת רכש
            </Link>
          ) : null}

          {rec.converted_po_id !== null ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-fg-muted">הזמנה קיימת:</span>
              <Link
                href={`/purchase-orders/${encodeURIComponent(rec.converted_po_id)}`}
                className="text-xs text-accent hover:underline font-mono"
                data-testid="rec-detail-po-link"
              >
                {rec.converted_po_id.slice(0, 8)}…
              </Link>
              <Badge tone="success" dotted>הומר</Badge>
            </div>
          ) : null}
        </div>
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
        eyebrow="מקור"
        title="ריצת התכנון"
        description="פרטי ריצת התכנון שממנה נוצרה המלצה זו"
        density="compact"
      >
        <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              ריצת תכנון:
            </dt>
            <dd className="mt-0.5 font-mono text-fg">
              <Link
                href={`/planning/runs/${encodeURIComponent(rec.run_id)}`}
                className="text-accent hover:underline"
              >
                {rec.run_id.slice(0, 8)}
              </Link>
              {" "}
              <span className="text-fg-muted">
                ({fmtDateAgo(rec.run_created_at)})
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              אתר:
            </dt>
            <dd className="mt-0.5 font-mono text-fg">{rec.planning_run_site_id}</dd>
          </div>
          <div>
            <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              סטטוס ריצה:
            </dt>
            <dd className="mt-0.5 text-fg capitalize">{rec.planning_run_status}</dd>
          </div>
          <div>
            <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              מזהה המלצה:
            </dt>
            <dd className="mt-0.5 font-mono text-fg-muted text-3xs">{rec.rec_id}</dd>
          </div>
        </dl>
      </SectionCard>
    </div>
  );
}
