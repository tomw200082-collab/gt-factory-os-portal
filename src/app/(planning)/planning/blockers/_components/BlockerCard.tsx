"use client";

// ---------------------------------------------------------------------------
// BlockerCard — mobile (< sm) view of a single blocker.
//
// Tom hard requirement: one card per blocker on small screens. No horizontal
// scroll. Each card shows the same five answers as the desktop table row,
// re-laid for vertical reading and thumb-reachable CTA.
// ---------------------------------------------------------------------------

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, LifeBuoy, Plus, Wrench } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/badges/StatusBadge";
import {
  BLOCKER_LABEL_HE,
  FIX_ACTION_LABEL_HE,
  SEVERITY_LABEL_HE,
  SEVERITY_TONE,
} from "../_lib/labelMaps";
import { fmtQty, fmtRelativeAgo, fmtShortDate } from "../_lib/format";
import type { BlockerRow as BlockerRowData } from "../_lib/types";
import { BlockerDetailAccordion } from "./BlockerDetailAccordion";
import { DevTicketModal } from "./DevTicketModal";

interface BlockerCardProps {
  row: BlockerRowData;
  /** I2 — due date assignment */
  currentDueDate?: string;
  onSetDueDate?: (date: string) => void;
  /** I3 — tag labels */
  currentTags?: string[];
  onToggleTag?: (tag: string) => void;
  tagPresets?: string[];
  /** I10 — escalation level badge */
  escalationLevel?: string;
  /** I11 — mood emoji */
  moodEmoji?: string;
}

function buildFixHref(row: BlockerRowData): string | null {
  if (!row.fix_route) return null;
  const params = row.fix_route_params ?? null;
  if (!params || Object.keys(params).length === 0) return row.fix_route;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  const sep = row.fix_route.includes("?") ? "&" : "?";
  return `${row.fix_route}${sep}${qs.toString()}`;
}

export function BlockerCard({
  row,
  currentDueDate,
  onSetDueDate,
  currentTags = [],
  onToggleTag,
  tagPresets = [],
  escalationLevel,
  moodEmoji,
}: BlockerCardProps) {
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const [devTicketOpen, setDevTicketOpen] = useState(false);
  const tone = SEVERITY_TONE[row.severity];
  const fixHref = buildFixHref(row);
  const blockerLabelHe = BLOCKER_LABEL_HE[row.blocker_label] ?? row.blocker_label;
  const fixActionHe = FIX_ACTION_LABEL_HE[row.fix_action_label] ?? row.fix_action_label;
  const isDevEscalation = row.fix_action_label === "check_po_substrate";

  return (
    <div
      className="card p-4 space-y-3"
      dir="rtl"
      data-testid={`blockers-card-${row.exception_id}`}
    >
      {/* Header row: severity badge + display name */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap" dir="rtl">
            <span className="text-sm font-semibold text-fg-strong">
              {row.display_name ??
                (row.display_kind === "run_level" ? "ריצת תכנון" : "—")}
            </span>
            {moodEmoji ? (
              <span className="text-sm" aria-label="מצב רוח">{moodEmoji}</span>
            ) : null}
            {escalationLevel && escalationLevel !== "ללא" ? (
              <span
                className={cn(
                  "text-3xs rounded px-1 shrink-0",
                  escalationLevel === "הנהלה"
                    ? "bg-danger-softer text-danger-fg"
                    : "bg-warning-softer text-warning-fg",
                )}
                dir="rtl"
              >
                {escalationLevel}
              </span>
            ) : null}
          </div>
          {row.supply_method ? (
            <div className="mt-0.5 text-3xs text-fg-faint">
              {row.supply_method}
            </div>
          ) : null}
        </div>
        <Badge tone={tone} dotted>
          {SEVERITY_LABEL_HE[row.severity]}
        </Badge>
      </div>

      {/* Why blocked */}
      <div>
        <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle mb-0.5">
          למה זה חסום?
        </div>
        <div className="text-xs text-fg">{blockerLabelHe}</div>
      </div>

      {/* Risk */}
      {row.demand_qty != null ? (
        <div>
          <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle mb-0.5">
            סיכון תפעולי
          </div>
          <div className="text-xs text-fg-muted">
            <span>ביקוש חסום: </span>
            <span className="font-mono tabular-nums text-fg">
              {fmtQty(row.demand_qty)}
            </span>
            <span> יחידות</span>
            {row.earliest_shortage_at ? (
              <>
                <span className="mx-1 text-fg-faint">·</span>
                <span>חוסר ראשון: </span>
                <span className="font-mono tabular-nums text-fg">
                  {fmtShortDate(row.earliest_shortage_at)}
                </span>
              </>
            ) : null}
          </div>
          {row.affected_bucket_count != null && row.affected_bucket_count > 1 ? (
            <div className="mt-0.5 text-3xs text-fg-faint">
              {row.affected_bucket_count} תקופות מושפעות
            </div>
          ) : null}
        </div>
      ) : null}

      {/* CTA */}
      <div className="pt-1">
        {fixHref ? (
          <Link
            href={fixHref}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-accent/40 bg-accent-soft px-3 py-2 text-sm font-medium text-accent-fg hover:bg-accent-softer transition-colors"
            data-testid={`blockers-fix-link-${row.exception_id}`}
          >
            <Wrench className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {fixActionHe}
            <ExternalLink className="h-3 w-3 opacity-60" strokeWidth={2} aria-hidden />
          </Link>
        ) : isDevEscalation ? (
          <>
            <button
              type="button"
              onClick={() => setDevTicketOpen(true)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-accent/40 bg-accent-soft px-3 py-2 text-sm font-medium text-accent-fg hover:bg-accent-softer transition-colors"
              data-testid={`blockers-dev-ticket-trigger-${row.exception_id}`}
            >
              <LifeBuoy className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              {fixActionHe}
            </button>
            <p className="mt-1 text-3xs text-fg-faint text-center">
              שלח לצוות הפיתוח את ID החסם
            </p>
            <DevTicketModal
              row={row}
              open={devTicketOpen}
              onClose={() => setDevTicketOpen(false)}
            />
          </>
        ) : (
          <div className="rounded border border-border/60 bg-bg-subtle px-3 py-2 text-center">
            <div className="text-xs font-medium text-fg-muted">{fixActionHe}</div>
            <div className="mt-0.5 text-3xs text-fg-faint">
              חסם זה דורש התערבות מפתח/אדמין
            </div>
          </div>
        )}
      </div>

      {/* I2 — Due Date Assignment */}
      {onSetDueDate ? (
        <div className="flex flex-col gap-0.5" dir="rtl">
          {currentDueDate ? (
            <span className="text-3xs text-fg-faint">יעד:</span>
          ) : null}
          <input
            type="date"
            dir="rtl"
            value={currentDueDate ?? ""}
            onChange={(e) => onSetDueDate(e.target.value)}
            className="text-3xs border border-border rounded px-1 py-0.5 bg-bg-subtle text-fg-muted"
            aria-label="תאריך יעד לחסם"
          />
        </div>
      ) : null}

      {/* I3 — Tag Labels */}
      {(currentTags.length > 0 || (onToggleTag && tagPresets.length > 0)) ? (
        <div className="flex flex-wrap gap-1 items-center" dir="rtl">
          {currentTags.map((tag) => (
            <span
              key={tag}
              className="text-3xs rounded px-1 py-0.5 bg-accent-softer text-accent"
              dir="rtl"
            >
              {tag}
            </span>
          ))}
          {onToggleTag && tagPresets.length > 0 ? (
            <div className="relative" dir="rtl">
              <button
                type="button"
                onClick={() => setTagDropdownOpen((v) => !v)}
                className="text-fg-faint hover:text-fg-muted text-3xs rounded px-1 py-0.5 border border-border/40 bg-bg-subtle transition-colors"
                aria-label="הוסף תגית"
                dir="rtl"
              >
                <Plus className="h-3 w-3" strokeWidth={2} aria-hidden />
              </button>
              {tagDropdownOpen ? (
                <div
                  className="absolute z-10 right-0 top-full mt-1 bg-bg-muted border border-border rounded shadow-sm min-w-max"
                  dir="rtl"
                >
                  {tagPresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        onToggleTag(preset);
                        setTagDropdownOpen(false);
                      }}
                      className={cn(
                        "block w-full text-right px-2 py-1 text-3xs hover:bg-bg-subtle transition-colors",
                        currentTags.includes(preset)
                          ? "text-accent font-medium"
                          : "text-fg-muted",
                      )}
                      dir="rtl"
                    >
                      {currentTags.includes(preset) ? `✓ ${preset}` : preset}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Footer: emitted_at + debug accordion */}
      <div className="flex items-center justify-between border-t border-border/40 pt-2">
        <div
          className="text-3xs text-fg-faint tabular-nums"
          title={row.emitted_at}
        >
          {fmtRelativeAgo(row.emitted_at)}
        </div>
        <BlockerDetailAccordion detail={row.blocker_detail} />
      </div>
    </div>
  );
}
