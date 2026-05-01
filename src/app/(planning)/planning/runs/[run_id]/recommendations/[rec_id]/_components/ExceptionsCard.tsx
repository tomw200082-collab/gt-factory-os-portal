"use client";

// ---------------------------------------------------------------------------
// ExceptionsCard — scoped exceptions as plain-language explanations
//
// Maps exception categories to English operational text.
// severity → tone: critical→danger, warning→warning, info→info
// If scoped_exceptions is empty: component should not be rendered (caller gates).
// ---------------------------------------------------------------------------

import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { cn } from "@/lib/cn";
import type { RecDetailException } from "../_lib/types";

// Known categories surfaced by the rec-detail endpoint per W1 contract
// (Planning-Tranche2-RecommendationDetail signal #16). Unknown categories
// fall through to the raw enum string in monospace so the planner sees
// the gap honestly instead of a silently-translated label.
const CATEGORY_LABELS: Record<string, string> = {
  recommendation_below_trigger_threshold: "Recommendation below trigger threshold (info)",
  missing_supplier_mapping: "No supplier mapped for this item",
  po_substrate_absent: "Open PO substrate not available — cannot net inbound",
};

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

function isKnownCategory(category: string): boolean {
  return category in CATEGORY_LABELS;
}

function severityBadge(severity: string) {
  if (severity === "critical") {
    return (
      <Badge tone="danger" variant="solid">
        Critical
      </Badge>
    );
  }
  if (severity === "warning") {
    return (
      <Badge tone="warning" dotted>
        Warning
      </Badge>
    );
  }
  return (
    <Badge tone="info" dotted>
      Info
    </Badge>
  );
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

interface ExceptionsCardProps {
  exceptions: RecDetailException[];
}

export function ExceptionsCard({ exceptions }: ExceptionsCardProps) {
  return (
    <SectionCard
      eyebrow="Exceptions"
      title={`${exceptions.length} exception${exceptions.length === 1 ? "" : "s"} affecting this recommendation`}
      description="Signals that affected how this recommendation was computed."
    >
      <ul className="divide-y divide-border/60 space-y-0">
        {exceptions.map((exc) => {
          const known = isKnownCategory(exc.category);
          return (
            <li key={exc.exception_id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-start gap-2">
                {severityBadge(exc.severity)}
                <span
                  className={cn(
                    "text-xs",
                    known ? "text-fg" : "font-mono text-fg-muted",
                  )}
                >
                  {categoryLabel(exc.category)}
                </span>
              </div>
              {exc.detail ? (
                <div className="mt-1 text-xs leading-relaxed text-fg-muted">
                  {exc.detail}
                </div>
              ) : null}
              <div className="mt-1 text-3xs text-fg-faint tabular-nums">
                {fmtDate(exc.emitted_at)}
              </div>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
