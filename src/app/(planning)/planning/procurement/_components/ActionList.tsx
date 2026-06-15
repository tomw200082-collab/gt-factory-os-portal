"use client";

// ---------------------------------------------------------------------------
// ActionList — the default view of the unified procurement page (Tranche 028).
//
// Renders the open session's proposed/approved POs as a single list grouped by
// decision: 🔴 must-send-today, 🟡 can-wait, ✅ handled. Each row shows the
// supplier, line count, total, tier + status chips, and a plain-Hebrew "why
// now" driver from the decision engine, with a read-only line expansion.
//
// Per-PO mutations are NOT here this tranche — the primary "open" action links
// to the classic session screen for now (interim). Tranche 029 swaps that for
// inline focus mode by passing an `onOpen` handler.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  PackageOpen,
} from "lucide-react";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { formatIls } from "@/lib/utils/format-money";
import { cn } from "@/lib/cn";
import type {
  PoStatus,
  PoTier,
  PurchaseSessionPo,
} from "../../purchase-session/_lib/types";
import {
  groupByDecision,
  type ClassifiedPo,
  type DecisionBucket,
} from "../_lib/decision";
import {
  buildCoverageReasoning,
  parseCoverageTrace,
} from "../_lib/coverage-trace";

// Tranche 047 — fallback link when no onOpen handler is supplied. The
// classic per-PO session URL is a redirect stub back to
// /planning/procurement since Tranche 045, so link there directly.
const FALLBACK_OPEN_HREF = "/planning/procurement";

const TIER_LABEL: Record<PoTier, string> = {
  urgent: "דחוף",
  must: "חובה השבוע",
  recommended: "מומלץ להקדים",
};
const TIER_TONE: Record<PoTier, BadgeTone> = {
  urgent: "danger",
  must: "warning",
  recommended: "neutral",
};
const STATUS_LABEL: Record<PoStatus, string> = {
  proposed: "מוצע",
  approved: "אושר — מוכן לשליחה",
  placed: "בוצע",
  skipped: "דולג",
};
const STATUS_TONE: Record<PoStatus, BadgeTone> = {
  proposed: "neutral",
  approved: "info",
  placed: "success",
  skipped: "muted",
};

interface SectionMeta {
  key: DecisionBucket;
  title: string;
  hint: string;
  tone: BadgeTone;
  icon: typeof Clock;
}

const SECTIONS: SectionMeta[] = [
  {
    key: "must_today",
    title: "חייב לצאת היום",
    hint: "עיכוב מסכן מלאי — להזמין עכשיו",
    tone: "danger",
    icon: AlertTriangle,
  },
  {
    key: "can_wait",
    title: "יכול לחכות",
    hint: "לא דחוף השבוע",
    tone: "warning",
    icon: Clock,
  },
  {
    key: "handled",
    title: "טופל",
    hint: "כבר הוזמן או דולג",
    tone: "success",
    icon: CheckCircle2,
  },
];

function activeLineCount(po: PurchaseSessionPo): number {
  return po.lines.filter((l) => !l.is_dropped).length;
}

function fmtCovNum(n: number | null): string {
  if (n == null) return "—";
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}

// Compact one-line "why this quantity" caption for the row expansion — decodes
// the per-line coverage_trace (demand / on-hand / projected-at-need) so the scan
// view explains each line without opening focus mode.
function CoverageCaption({ trace }: { trace: unknown }): JSX.Element | null {
  const r = buildCoverageReasoning(parseCoverageTrace(trace));
  if (!r || !r.hasSignal) return null;
  const tone =
    r.severity === "stockout"
      ? "text-danger-fg"
      : r.severity === "below_safety"
        ? "text-warning-fg"
        : "text-fg-faint";
  const head =
    r.severity === "stockout"
      ? r.needDate
        ? `נגמר לפני ${r.needDate}`
        : "צפוי להיגמר"
      : r.severity === "below_safety"
        ? "מתחת לרצפת ביטחון"
        : "כיסוי מספק";
  return (
    <div
      className="flex flex-wrap items-center gap-x-2 text-3xs text-fg-faint"
      data-testid="procurement-line-coverage"
    >
      <span className={cn("font-semibold", tone)}>{head}</span>
      {r.demand != null && (
        <span>
          ביקוש{" "}
          <span className="tabular-nums text-fg-muted">
            {fmtCovNum(r.demand)}
          </span>
        </span>
      )}
      {r.onHand != null && (
        <span>
          במלאי{" "}
          <span className="tabular-nums text-fg-muted">
            {fmtCovNum(r.onHand)}
          </span>
        </span>
      )}
      {r.projectedAtNeed != null && (
        <span>
          צפי{" "}
          <span
            className={cn(
              "tabular-nums",
              r.wouldRunOut
                ? "text-danger-fg font-semibold"
                : "text-fg-muted",
            )}
          >
            {fmtCovNum(r.projectedAtNeed)}
          </span>
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function ProcurementRow({
  classified,
  onOpen,
}: {
  classified: ClassifiedPo<PurchaseSessionPo>;
  onOpen?: (po: PurchaseSessionPo) => void;
}): JSX.Element {
  const { po, bucket, isOverdue, whyNow } = classified;
  const [expanded, setExpanded] = useState(false);
  const lineCount = activeLineCount(po);
  const actionable = bucket !== "handled";

  return (
    <div
      className={cn(
        "rounded-md border bg-bg-subtle/30 transition-colors",
        isOverdue ? "border-danger/40" : "border-border/60 hover:border-border",
      )}
      data-testid={`procurement-row-${po.session_po_id}`}
    >
      <div className="flex items-start gap-3 p-4">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 text-fg-muted hover:text-fg transition-colors"
          aria-label={expanded ? "כווץ שורות" : "הצג שורות"}
          aria-expanded={expanded}
          data-testid={`procurement-row-toggle-${po.session_po_id}`}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden />
          )}
        </button>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-fg truncate">
              {po.supplier_snapshot}
            </span>
            <Badge tone={TIER_TONE[po.tier]} size="xs">
              {TIER_LABEL[po.tier]}
            </Badge>
            <Badge tone={STATUS_TONE[po.status]} size="xs">
              {STATUS_LABEL[po.status]}
            </Badge>
            {isOverdue && (
              <Badge tone="danger" size="xs" dot animated>
                באיחור
              </Badge>
            )}
          </div>
          <div
            className={cn(
              "text-xs",
              isOverdue ? "text-danger-fg font-medium" : "text-fg-muted",
            )}
            data-testid={`procurement-whynow-${po.session_po_id}`}
          >
            {whyNow}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-3xs text-fg-faint tabular-nums">
            <span>
              {lineCount} פריט{lineCount === 1 ? "" : "ים"}
              {" · "}
              {formatIls(po.total_cost)}
            </span>
            <span
              className={cn(isOverdue ? "text-danger-fg font-medium" : "text-fg-subtle")}
            >
              להזמין עד {po.order_by_date}
            </span>
            {po.earliest_need_date && <span>· נדרש {po.earliest_need_date}</span>}
          </div>
        </div>

        {actionable &&
          (onOpen ? (
            <button
              type="button"
              onClick={() => onOpen(po)}
              className="btn btn-sm btn-accent shrink-0"
              data-testid={`procurement-open-${po.session_po_id}`}
            >
              פתח במיקוד →
            </button>
          ) : (
            <Link
              href={FALLBACK_OPEN_HREF}
              className="btn btn-sm btn-accent shrink-0"
              data-testid={`procurement-open-${po.session_po_id}`}
            >
              פתח →
            </Link>
          ))}
      </div>

      {expanded && (
        <div className="border-t border-border/60 px-4 py-3 space-y-1.5">
          {lineCount === 0 ? (
            <div className="text-3xs text-fg-faint">אין שורות פעילות.</div>
          ) : (
            po.lines
              .filter((l) => !l.is_dropped)
              .map((l) => (
                <div key={l.session_po_line_id} className="space-y-0.5">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate text-fg">{l.line_label}</span>
                    <span className="shrink-0 tabular-nums text-fg-muted">
                      {l.final_qty} {l.uom} · {formatIls(l.line_cost)}
                    </span>
                  </div>
                  <CoverageCaption trace={l.coverage_trace} />
                </div>
              ))
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export interface ActionListProps {
  pos: PurchaseSessionPo[];
  /** When provided (Tranche 029), the primary row action opens inline focus
   *  mode. Until then rows link to the classic session screen. */
  onOpen?: (po: PurchaseSessionPo) => void;
  /** Injectable for deterministic tests; defaults to today. */
  today?: string;
}

export function ActionList({ pos, onOpen, today }: ActionListProps): JSX.Element {
  const groups = useMemo(() => groupByDecision(pos, today), [pos, today]);

  return (
    <div className="space-y-5">
      {SECTIONS.map((section) => {
        const rows = groups[section.key];
        const Icon = section.icon;
        const total = rows.reduce((sum, r) => sum + (r.po.total_cost || 0), 0);
        return (
          <SectionCard key={section.key}>
            <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Icon
                  className={cn(
                    "h-4.5 w-4.5",
                    section.tone === "danger" && "text-danger-fg",
                    section.tone === "warning" && "text-warning-fg",
                    section.tone === "success" && "text-success-fg",
                  )}
                  aria-hidden
                />
                <div>
                  <h2 className="text-base font-bold text-fg">
                    {section.title}
                  </h2>
                  <p className="mt-0.5 text-3xs text-fg-faint">{section.hint}</p>
                </div>
              </div>
              <div className="text-left shrink-0">
                <Badge tone={section.tone} size="sm">
                  {rows.length}
                </Badge>
                {rows.length > 0 && (
                  <div className="mt-1 text-3xs text-fg-faint tabular-nums">
                    {formatIls(total)}
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 py-4 space-y-3">
              {rows.length === 0 ? (
                <div
                  className="flex items-center gap-2 text-xs text-fg-faint"
                  data-testid={`procurement-empty-${section.key}`}
                >
                  <PackageOpen className="h-3.5 w-3.5" aria-hidden />
                  אין הזמנות בקטגוריה זו.
                </div>
              ) : (
                rows.map((classified) => (
                  <ProcurementRow
                    key={classified.po.session_po_id}
                    classified={classified}
                    onOpen={onOpen}
                  />
                ))
              )}
            </div>
          </SectionCard>
        );
      })}
    </div>
  );
}
