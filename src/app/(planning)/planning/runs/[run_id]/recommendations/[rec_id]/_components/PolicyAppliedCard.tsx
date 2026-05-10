"use client";

// ---------------------------------------------------------------------------
// PolicyAppliedCard — per-item planning policy applied to this recommendation
//
// Shows planning_mode badge, safety breach date, actual stockout date,
// available date, and safety stock threshold.
// DTO v1.2 fields (signal #35 — RUNTIME_READY(Planning-TrustMinimum-W1)).
// ---------------------------------------------------------------------------

import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { cn } from "@/lib/cn";
import type { RecommendationDetailResponse, PlanningMode } from "../_lib/types";

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

function fmtQty(s: string): string {
  const n = parseFloat(s) || 0;
  return Number.isInteger(n) ? n.toFixed(0) : n.toFixed(2).replace(/\.?0+$/, "");
}

const MODE_BADGE: Record<PlanningMode, { tone: "success" | "warning" | "danger"; label: string }> = {
  auto: { tone: "success", label: "Auto" },
  manual_review: { tone: "warning", label: "Manual review" },
  blocked: { tone: "danger", label: "Blocked" },
};

const MODE_DESCRIPTION: Record<PlanningMode, string> = {
  auto: "This recommendation was generated automatically.",
  manual_review: "This item is flagged for manual review before approving.",
  blocked: "This item is currently blocked from planning. This recommendation is from before the block was set.",
};

interface PolicyAppliedCardProps {
  rec: RecommendationDetailResponse;
}

export function PolicyAppliedCard({ rec }: PolicyAppliedCardProps) {
  const mode = rec.planning_mode;
  const badge = MODE_BADGE[mode];
  const description = MODE_DESCRIPTION[mode];
  const hasSafetyStock =
    rec.safety_stock_qty !== null && rec.safety_stock_qty !== "0.00000000";

  return (
    <SectionCard
      eyebrow="Planning policy"
      title="How was this item planned?"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={badge.tone} variant="soft">
          {badge.label}
        </Badge>
        <span className="text-xs text-fg-muted">{description}</span>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            Safety breach
          </dt>
          <dd
            className={cn(
              "mt-0.5 font-medium",
              rec.safety_breach_date !== null
                ? "font-semibold text-danger-fg"
                : "text-fg-strong",
            )}
          >
            {fmtDate(rec.safety_breach_date)}
          </dd>
        </div>
        <div>
          <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            Actual stockout
          </dt>
          <dd
            className={cn(
              "mt-0.5 font-medium",
              rec.stockout_date !== null
                ? "font-semibold text-warning-fg"
                : "text-fg-strong",
            )}
          >
            {fmtDate(rec.stockout_date)}
          </dd>
        </div>
        <div>
          <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            Available
          </dt>
          <dd className="mt-0.5 font-medium text-fg-strong">
            {fmtDate(rec.available_date)}
          </dd>
        </div>
      </dl>

      {hasSafetyStock && rec.safety_stock_qty !== null && (
        <div className="mt-3 text-xs text-fg-muted">
          Safety stock threshold:{" "}
          <span className="font-mono font-semibold tabular-nums text-fg">
            {fmtQty(rec.safety_stock_qty)}
          </span>{" "}
          units
        </div>
      )}
    </SectionCard>
  );
}

export function PolicyAppliedCardSkeleton() {
  return (
    <div className="card p-5 space-y-2">
      <div className="h-3 w-32 animate-pulse rounded bg-bg-subtle" />
      <div className="h-5 w-48 animate-pulse rounded bg-bg-subtle" />
      <div className="mt-3 space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex justify-between">
            <div className="h-3 w-24 animate-pulse rounded bg-bg-subtle" />
            <div className="h-3 w-16 animate-pulse rounded bg-bg-subtle" />
          </div>
        ))}
      </div>
    </div>
  );
}
