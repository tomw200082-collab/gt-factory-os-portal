"use client";

// ---------------------------------------------------------------------------
// ExceptionsCard — scoped exceptions as plain-language explanations
//
// Maps exception categories to Hebrew operational text.
// severity → tone: critical→danger, warning→warning, info→info
// If scoped_exceptions is empty: component should not be rendered (caller gates).
// ---------------------------------------------------------------------------

import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { cn } from "@/lib/cn";
import type { RecDetailException } from "../_lib/types";

const CATEGORY_LABELS: Record<string, string> = {
  recommendation_below_trigger_threshold: "המלצה קטנה מסף ההפעלה (info)",
  missing_supplier_mapping: "אין ספק מוגדר לפריט",
  po_substrate_absent: "לא ניתן לבדוק הזמנות פתוחות",
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
        קריטי
      </Badge>
    );
  }
  if (severity === "warning") {
    return (
      <Badge tone="warning" dotted>
        אזהרה
      </Badge>
    );
  }
  return (
    <Badge tone="info" dotted>
      מידע
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
      eyebrow="חריגות"
      title={`${exceptions.length} חריגה${exceptions.length !== 1 ? "ות" : ""} קשורות להמלצה`}
      description="הודעות שהשפיעו על חישוב ההמלצה"
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
                {fmtDate(exc.created_at)}
              </div>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
