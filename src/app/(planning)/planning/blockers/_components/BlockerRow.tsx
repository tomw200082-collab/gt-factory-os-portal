"use client";

// ---------------------------------------------------------------------------
// BlockerRow — desktop table row.
//
// 5-question layout (Tom-locked structure; copy converted to English
// per Tom decision 2026-05-08, FLOW-003 Section Q + planning UX full-pass DEC-1):
//   1. What is blocked?     — display_name (NEVER display_id UUID)
//   2. Why is it blocked?    — English blocker_label
//   3. What is the risk?     — severity badge + demand_qty + earliest_shortage_at
//   4. What to do now?       — fix_action_label as English text or static muted
//                              label for `check_po_substrate` (Option D)
//   5. Where to fix it?      — fix_route link OR muted "system fix" indicator
//
// Decorative features I3 (tag labels), I10 (escalation), I11 (mood),
// I12 (kanban) — REMOVED per DEC-3. Only I2 (due dates) is supported on the
// row level.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { ExternalLink, Wrench } from "lucide-react";
import { cn } from "@/lib/cn";
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

interface BlockerRowProps {
  row: BlockerRowData;
  /** I2 — due date assignment (localStorage-persisted by parent) */
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

export function BlockerRow({
  row,
  currentDueDate,
  onSetDueDate,
}: BlockerRowProps) {
  const tone = SEVERITY_TONE[row.severity];
  const fixHref = buildFixHref(row);
  const blockerLabel = BLOCKER_LABEL[row.blocker_label] ?? row.blocker_label;
  const fixActionLabel =
    FIX_ACTION_LABEL[row.fix_action_label] ?? row.fix_action_label;
  // FLOW-003 Option D: static informational label, no button.
  const isSystemFix = row.fix_action_label === "check_po_substrate";

  // Tone the row background subtly for critical/high severity (DEC-3 spec).
  const rowToneClass =
    tone === "danger"
      ? "bg-danger-softer/30"
      : tone === "warning"
        ? "bg-warning-softer/20"
        : "";

  return (
    <tr
      className={cn(
        "border-b border-border/60 align-top hover:bg-bg-subtle/40 transition-colors",
        rowToneClass,
      )}
      data-testid={`blockers-row-${row.exception_id}`}
    >
      {/* Q1 — What is blocked? */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-fg-strong">
            {row.display_name ??
              (row.display_kind === "run_level" ? "Planning run" : "—")}
          </span>
        </div>
        {row.supply_method ? (
          <div className="mt-0.5 text-3xs text-fg-faint">
            {row.supply_method}
          </div>
        ) : null}
      </td>

      {/* Q2 — Why is it blocked? */}
      <td className="px-3 py-3">
        <div className="text-xs text-fg">{blockerLabel}</div>
      </td>

      {/* Q3 — What is the risk? */}
      <td className="px-3 py-3">
        <div className="flex flex-col gap-1">
          <Badge tone={tone} dotted>
            {SEVERITY_LABEL[row.severity]}
          </Badge>
          {row.demand_qty != null ? (
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
          ) : null}
          {row.affected_bucket_count != null && row.affected_bucket_count > 1 ? (
            <div className="text-3xs text-fg-faint">
              {row.affected_bucket_count} affected periods
            </div>
          ) : null}
        </div>
      </td>

      {/* Q4 — What to do now? */}
      <td className="px-3 py-3">
        {isSystemFix ? (
          <span className="text-xs text-fg-muted italic">{fixActionLabel}</span>
        ) : (
          <div className="text-xs text-fg">{fixActionLabel}</div>
        )}
      </td>

      {/* Q5 — Where to fix it? */}
      <td className="px-3 py-3">
        {fixHref ? (
          <Link
            href={fixHref}
            className={cn(
              "inline-flex items-center gap-1 rounded border border-accent/40 bg-accent-soft px-2 py-1 text-xs font-medium text-accent-fg hover:bg-accent-softer transition-colors",
            )}
            data-testid={`blockers-fix-link-${row.exception_id}`}
          >
            <Wrench className="h-3 w-3" strokeWidth={2} aria-hidden />
            Fix
            <ExternalLink className="h-3 w-3 opacity-60" strokeWidth={2} aria-hidden />
          </Link>
        ) : (
          <span
            className="inline-flex items-center gap-1 rounded border border-border/60 bg-bg-subtle px-2 py-1 text-xs text-fg-muted"
            title="This blocker requires a system fix. No planner action available."
          >
            System fix required
          </span>
        )}
      </td>

      {/* emitted_at + debug accordion */}
      <td className="px-3 py-3 align-top">
        <div
          className="text-3xs text-fg-faint tabular-nums"
          title={row.emitted_at}
        >
          {fmtRelativeAgo(row.emitted_at)}
        </div>
        <div className="mt-2">
          <BlockerDetailAccordion detail={row.blocker_detail} />
        </div>
      </td>

      {/* I2 — Due Date */}
      <td className="px-3 py-3 align-top">
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
      </td>
    </tr>
  );
}
