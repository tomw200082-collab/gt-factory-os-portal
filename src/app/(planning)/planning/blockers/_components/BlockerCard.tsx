"use client";

// ---------------------------------------------------------------------------
// BlockerCard — mobile (< sm) view of a single blocker.
//
// Tom hard requirement: one card per blocker on small screens. No horizontal
// scroll. Each card shows the same five answers as the desktop table row,
// re-laid for vertical reading and thumb-reachable CTA.
//
// FLOW-003 Option D (Tom 2026-05-08): `check_po_substrate` renders as a
// static muted informational label, not a button or link.
//
// Decorative features I3 (tag labels), I10 (escalation), I11 (mood),
// I12 (kanban) — REMOVED per DEC-3. Only I2 (due dates) is supported.
// English/LTR per DEC-1.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { ExternalLink, Wrench } from "lucide-react";
import { Badge } from "@/components/badges/StatusBadge";
import {
  BLOCKER_LABEL,
  FIX_ACTION_LABEL,
  SEVERITY_LABEL,
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
}: BlockerCardProps) {
  const tone = SEVERITY_TONE[row.severity];
  const fixHref = buildFixHref(row);
  const blockerLabel = BLOCKER_LABEL[row.blocker_label] ?? row.blocker_label;
  const fixActionLabel =
    FIX_ACTION_LABEL[row.fix_action_label] ?? row.fix_action_label;
  const isSystemFix = row.fix_action_label === "check_po_substrate";

  return (
    <div
      className="card p-4 space-y-3"
      data-testid={`blockers-card-${row.exception_id}`}
    >
      {/* Header row: severity badge + display name */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-fg-strong">
              {row.display_name ??
                (row.display_kind === "run_level" ? "Planning run" : "—")}
            </span>
          </div>
          {row.supply_method ? (
            <div className="mt-0.5 text-3xs text-fg-faint">
              {row.supply_method}
            </div>
          ) : null}
        </div>
        <Badge tone={tone} dotted>
          {SEVERITY_LABEL[row.severity]}
        </Badge>
      </div>

      {/* Why blocked */}
      <div>
        <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle mb-0.5">
          Why is it blocked?
        </div>
        <div className="text-xs text-fg">{blockerLabel}</div>
      </div>

      {/* Risk */}
      {row.demand_qty != null ? (
        <div>
          <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle mb-0.5">
            Operational risk
          </div>
          <div className="text-xs text-fg-muted">
            <span>Blocked demand: </span>
            <span className="font-mono tabular-nums text-fg">
              {fmtQty(row.demand_qty)}
            </span>
            <span> units</span>
            {row.earliest_shortage_at ? (
              <>
                <span className="mx-1 text-fg-faint">·</span>
                <span>First shortage: </span>
                <span className="font-mono tabular-nums text-fg">
                  {fmtShortDate(row.earliest_shortage_at)}
                </span>
              </>
            ) : null}
          </div>
          {row.affected_bucket_count != null && row.affected_bucket_count > 1 ? (
            <div className="mt-0.5 text-3xs text-fg-faint">
              {row.affected_bucket_count} affected periods
            </div>
          ) : null}
        </div>
      ) : null}

      {/* What to do now? */}
      <div>
        <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle mb-0.5">
          What to do now?
        </div>
        {isSystemFix ? (
          <div className="rounded border border-border/60 bg-bg-subtle px-3 py-2 text-center">
            <div className="text-xs font-medium text-fg-muted italic">
              {fixActionLabel}
            </div>
            <div className="mt-0.5 text-3xs text-fg-faint">
              This blocker requires a system fix. No planner action available.
            </div>
          </div>
        ) : (
          <div className="text-xs text-fg">{fixActionLabel}</div>
        )}
      </div>

      {/* Where to fix it? */}
      {fixHref ? (
        <div className="pt-1">
          <Link
            href={fixHref}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-accent/40 bg-accent-soft px-3 py-2 text-sm font-medium text-accent-fg hover:bg-accent-softer transition-colors"
            data-testid={`blockers-fix-link-${row.exception_id}`}
          >
            <Wrench className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Fix
            <ExternalLink className="h-3 w-3 opacity-60" strokeWidth={2} aria-hidden />
          </Link>
        </div>
      ) : null}

      {/* I2 — Due Date Assignment */}
      {onSetDueDate ? (
        <div className="flex flex-col gap-0.5">
          {currentDueDate ? (
            <span className="text-3xs text-fg-faint">Due:</span>
          ) : null}
          <input
            type="date"
            value={currentDueDate ?? ""}
            onChange={(e) => onSetDueDate(e.target.value)}
            className="text-3xs border border-border rounded px-1 py-0.5 bg-bg-subtle text-fg-muted"
            aria-label="Blocker due date"
          />
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
