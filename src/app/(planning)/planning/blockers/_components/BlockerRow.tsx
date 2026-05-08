"use client";

// ---------------------------------------------------------------------------
// BlockerRow — desktop table row.
//
// 5-question layout (Tom verbatim):
//   1. מה חסום?         — display_name (NEVER display_id UUID)
//   2. למה זה חסום?      — Hebrew blocker_label
//   3. מה הסיכון?       — severity badge + demand_qty + earliest_shortage_at
//   4. מה עושים עכשיו?  — fix_action_label as Hebrew CTA
//   5. איפה מתקנים?     — fix_route link OR "פנה למפתח" when null
// ---------------------------------------------------------------------------

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Plus, Wrench } from "lucide-react";
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

interface BlockerRowProps {
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

export function BlockerRow({
  row,
  currentDueDate,
  onSetDueDate,
  currentTags = [],
  onToggleTag,
  tagPresets = [],
  escalationLevel,
  moodEmoji,
}: BlockerRowProps) {
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const tone = SEVERITY_TONE[row.severity];
  const fixHref = buildFixHref(row);
  const blockerLabelHe = BLOCKER_LABEL_HE[row.blocker_label] ?? row.blocker_label;
  const fixActionHe = FIX_ACTION_LABEL_HE[row.fix_action_label] ?? row.fix_action_label;

  return (
    <tr
      className="border-b border-border/60 align-top hover:bg-bg-subtle/40 transition-colors"
      data-testid={`blockers-row-${row.exception_id}`}
    >
      {/* Q1 — מה חסום? */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5 flex-wrap" dir="rtl">
          <span className="text-sm font-medium text-fg-strong">
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
      </td>

      {/* Q2 — למה זה חסום? */}
      <td className="px-3 py-3">
        <div className="text-xs text-fg">{blockerLabelHe}</div>
      </td>

      {/* Q3 — מה הסיכון? */}
      <td className="px-3 py-3">
        <div className="flex flex-col gap-1">
          <Badge tone={tone} dotted>
            {SEVERITY_LABEL_HE[row.severity]}
          </Badge>
          {row.demand_qty != null ? (
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
          ) : null}
          {row.affected_bucket_count != null && row.affected_bucket_count > 1 ? (
            <div className="text-3xs text-fg-faint">
              {row.affected_bucket_count} תקופות מושפעות
            </div>
          ) : null}
        </div>
      </td>

      {/* Q4 — מה עושים עכשיו? */}
      <td className="px-3 py-3">
        <div className="text-xs text-fg">{fixActionHe}</div>
      </td>

      {/* Q5 — איפה מתקנים? */}
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
            לתיקון
            <ExternalLink className="h-3 w-3 opacity-60" strokeWidth={2} aria-hidden />
          </Link>
        ) : (
          <span
            className="inline-flex items-center gap-1 rounded border border-border/60 bg-bg-subtle px-2 py-1 text-xs text-fg-muted"
            title="חסם זה דורש התערבות מפתח/אדמין"
          >
            פנה למפתח
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
      <td className="px-3 py-3 align-top" dir="rtl">
        {onSetDueDate ? (
          <div className="flex flex-col gap-0.5">
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
      </td>

      {/* I3 — Tag Labels */}
      <td className="px-3 py-3 align-top" dir="rtl">
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
      </td>
    </tr>
  );
}
