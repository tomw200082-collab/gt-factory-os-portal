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

import Link from "next/link";
import { ExternalLink, Wrench } from "lucide-react";
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

export function BlockerRow({ row }: BlockerRowProps) {
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
        <div className="text-sm font-medium text-fg-strong">
          {row.display_name ??
            (row.display_kind === "run_level" ? "ריצת תכנון" : "—")}
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
    </tr>
  );
}
