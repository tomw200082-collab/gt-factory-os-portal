"use client";

// ---------------------------------------------------------------------------
// BlockerCard — mobile (< sm) view of a single blocker.
//
// Tom hard requirement: one card per blocker on small screens. No horizontal
// scroll. Each card shows the same five answers as the desktop table row,
// re-laid for vertical reading and thumb-reachable CTA.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { ExternalLink, Wrench } from "lucide-react";
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

interface BlockerCardProps {
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

export function BlockerCard({ row }: BlockerCardProps) {
  const tone = SEVERITY_TONE[row.severity];
  const fixHref = buildFixHref(row);
  const blockerLabelHe = BLOCKER_LABEL_HE[row.blocker_label] ?? row.blocker_label;
  const fixActionHe = FIX_ACTION_LABEL_HE[row.fix_action_label] ?? row.fix_action_label;

  return (
    <div
      className="card p-4 space-y-3"
      dir="rtl"
      data-testid={`blockers-card-${row.exception_id}`}
    >
      {/* Header row: severity badge + display name */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-fg-strong">
            {row.display_name ??
              (row.display_kind === "run_level" ? "ריצת תכנון" : "—")}
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
        ) : (
          <div className="rounded border border-border/60 bg-bg-subtle px-3 py-2 text-center">
            <div className="text-xs font-medium text-fg-muted">{fixActionHe}</div>
            <div className="mt-0.5 text-3xs text-fg-faint">
              חסם זה דורש התערבות מפתח/אדמין
            </div>
          </div>
        )}
      </div>

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
