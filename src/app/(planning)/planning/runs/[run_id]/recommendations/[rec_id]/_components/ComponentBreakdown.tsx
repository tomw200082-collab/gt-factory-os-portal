"use client";

// ---------------------------------------------------------------------------
// ComponentBreakdown — component table for MANUFACTURED/REPACK recs
//
// Desktop: sortable table
// Mobile: card per component (no horizontal scroll)
// BOUGHT_FINISHED: shows empty-state message
//
// Feasibility summary at the top — answers "can I run this batch now?"
// at a glance (sum components with shortage > 0). Manager doesn't need to
// scan the whole table to know whether the run is blocked on missing RM.
// ---------------------------------------------------------------------------

import { useState } from "react";
import Link from "next/link";
import { ChevronUp, ChevronDown, AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { cn } from "@/lib/cn";
import type { RecDetailComponent, RecommendationDetailResponse } from "../_lib/types";

type SortKey = "component_name" | "demand_qty" | "on_hand_qty" | "open_po_qty" | "net_purchase_qty";
type SortDir = "asc" | "desc";

function parseQty(s: string): number {
  return parseFloat(s) || 0;
}

function fmtQty(s: string, unit: string | null): string {
  const n = parseQty(s);
  const formatted = Number.isInteger(n) ? n.toFixed(0) : n.toFixed(2).replace(/\.?0+$/, "");
  return unit ? `${formatted} ${unit}` : formatted;
}

function sortComponents(
  rows: RecDetailComponent[],
  key: SortKey,
  dir: SortDir,
): RecDetailComponent[] {
  return [...rows].sort((a, b) => {
    let cmp = 0;
    if (key === "component_name") {
      cmp = a.component_name.localeCompare(b.component_name, "he");
    } else {
      cmp = parseQty(a[key]) - parseQty(b[key]);
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

function SortHeader({
  label,
  sortKey,
  currentKey,
  dir,
  onSort,
  align = "right",
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = currentKey === sortKey;
  return (
    <th
      className={cn(
        "px-3 py-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle cursor-pointer select-none hover:text-fg",
        align === "right" ? "text-right" : "text-left",
      )}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {active ? (
          dir === "asc" ? (
            <ChevronUp className="h-3 w-3" strokeWidth={2} />
          ) : (
            <ChevronDown className="h-3 w-3" strokeWidth={2} />
          )
        ) : null}
      </span>
    </th>
  );
}

function ComponentCard({ row }: { row: RecDetailComponent }) {
  const shortage = parseQty(row.net_purchase_qty);
  return (
    <div className="rounded border border-border/60 bg-bg-raised p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium text-fg-strong">{row.component_name}</div>
          <div className="font-mono text-3xs text-fg-subtle">{row.component_id}</div>
        </div>
        {/* Loop 14 — fast-fix link for blocked rows. Operator/manager
            can jump straight to item master to update supplier mapping
            or BOM, instead of copy-pasting the component_id elsewhere. */}
        {shortage > 0 ? (
          <Link
            href={`/admin/masters/items/${encodeURIComponent(row.component_id)}`}
            className="inline-flex shrink-0 items-center gap-1 rounded border border-warning/30 bg-warning-softer px-1.5 py-0.5 text-3xs font-medium text-warning-fg hover:bg-warning-soft"
            title="Open item master to fix supplier mapping or check stock"
          >
            <ExternalLink className="h-2.5 w-2.5" strokeWidth={2.5} />
            תקן
          </Link>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div>
          <span className="text-fg-muted">ביקוש: </span>
          <span className="font-mono tabular-nums">{fmtQty(row.demand_qty, row.unit)}</span>
        </div>
        <div>
          <span className="text-fg-muted">במלאי: </span>
          <span className="font-mono tabular-nums">{fmtQty(row.on_hand_qty, row.unit)}</span>
        </div>
        <div>
          <span className="text-fg-muted">בהזמנה: </span>
          <span className="font-mono tabular-nums">{fmtQty(row.open_po_qty, row.unit)}</span>
        </div>
        <div>
          <span className="text-fg-muted">חוסר: </span>
          <span
            className={cn(
              "font-mono tabular-nums font-semibold",
              shortage > 0 ? "text-danger-fg" : "text-success-fg",
            )}
          >
            {fmtQty(row.net_purchase_qty, row.unit)}
          </span>
        </div>
      </div>
    </div>
  );
}

interface ComponentBreakdownProps {
  rec: RecommendationDetailResponse;
}

export function ComponentBreakdown({ rec }: ComponentBreakdownProps) {
  const [sortKey, setSortKey] = useState<SortKey>("component_name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const isBF = rec.supply_method === "BOUGHT_FINISHED";

  function handleSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir("asc");
    }
  }

  const sorted = isBF ? [] : sortComponents(rec.components, sortKey, sortDir);

  // Feasibility rollup — count components with shortage > 0 and sum the
  // total shortfall qty (the demand the planning engine can't cover from
  // current on-hand + open POs). For production recs (rec_type=production
  // with supply_method MANUFACTURED|REPACK) this is the "can I run this
  // batch now?" answer at a glance.
  const shortComponents = isBF
    ? []
    : rec.components.filter((r) => parseQty(r.net_purchase_qty) > 0);
  const totalComponents = isBF ? 0 : rec.components.length;
  const shortCount = shortComponents.length;
  const isReady = !isBF && totalComponents > 0 && shortCount === 0;

  return (
    <SectionCard
      eyebrow="פירוט רכיבים"
      title="רכיבי הייצור"
      description={
        isBF
          ? "פריט מוגמר שנרכש — אין פירוק לרכיבים"
          : `${rec.components.length} רכיב${rec.components.length !== 1 ? "ים" : ""} בהמלצה`
      }
    >
      {/* Feasibility chip — shows only for production-type recs (i.e.
          components present + not BOUGHT_FINISHED). Two states:
            ✓ READY: all components on-hand or covered by open POs
            ⚠ SHORT: N components blocked; click to scroll the table */}
      {!isBF && totalComponents > 0 && rec.rec_type === "production" ? (
        <div
          className={cn(
            "mb-3 flex flex-wrap items-center gap-3 rounded-md border px-3 py-2",
            isReady
              ? "border-success/40 bg-success-softer text-success-fg"
              : "border-warning/40 bg-warning-softer text-warning-fg",
          )}
          data-testid="production-rec-feasibility"
        >
          {isReady ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          )}
          <div className="flex-1 min-w-0">
            {isReady ? (
              <span className="font-medium">
                מוכן לייצור — כל הרכיבים זמינים במלאי או בהזמנות פתוחות
              </span>
            ) : (
              <span className="font-medium">
                לא ניתן לייצר עכשיו — {shortCount} מתוך {totalComponents} רכיבים חסרים
              </span>
            )}
          </div>
          {!isReady ? (
            <Badge tone="warning" variant="soft" dotted>
              {shortCount} חסר
            </Badge>
          ) : (
            <Badge tone="success" variant="soft" dotted>
              {totalComponents} מוכן
            </Badge>
          )}
        </div>
      ) : null}

      {isBF || rec.components.length === 0 ? (
        <div className="text-sm text-fg-muted italic">
          פריט מוגמר שנרכש — אין פירוק לרכיבים
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <SortHeader label="רכיב" sortKey="component_name" currentKey={sortKey} dir={sortDir} onSort={handleSort} align="left" />
                  <SortHeader label="ביקוש" sortKey="demand_qty" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="במלאי" sortKey="on_hand_qty" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="בהזמנה" sortKey="open_po_qty" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="חוסר" sortKey="net_purchase_qty" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => {
                  const shortage = parseQty(row.net_purchase_qty);
                  return (
                    <tr
                      key={row.component_id}
                      className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium text-fg-strong">{row.component_name}</div>
                            <div className="font-mono text-3xs text-fg-subtle">{row.component_id}</div>
                          </div>
                          {/* Loop 14 — fast-fix link for blocked rows. */}
                          {shortage > 0 ? (
                            <Link
                              href={`/admin/masters/items/${encodeURIComponent(row.component_id)}`}
                              className="inline-flex shrink-0 items-center gap-1 rounded border border-warning/30 bg-warning-softer px-1.5 py-0.5 text-3xs font-medium text-warning-fg hover:bg-warning-soft"
                              title="Open item master to fix supplier mapping or check stock"
                            >
                              <ExternalLink className="h-2.5 w-2.5" strokeWidth={2.5} />
                              תקן
                            </Link>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-fg-muted">
                        {fmtQty(row.demand_qty, row.unit)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-fg-muted">
                        {fmtQty(row.on_hand_qty, row.unit)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-fg-muted">
                        {fmtQty(row.open_po_qty, row.unit)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-right font-mono tabular-nums font-semibold",
                          shortage > 0 ? "text-danger-fg" : "text-success-fg",
                        )}
                      >
                        {fmtQty(row.net_purchase_qty, row.unit)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="sm:hidden space-y-2">
            {sorted.map((row) => (
              <ComponentCard key={row.component_id} row={row} />
            ))}
          </div>
        </>
      )}
    </SectionCard>
  );
}

export function ComponentBreakdownSkeleton() {
  return (
    <div className="card p-5 space-y-3">
      <div className="h-3 w-32 animate-pulse rounded bg-bg-subtle" />
      <div className="h-5 w-40 animate-pulse rounded bg-bg-subtle" />
      <div className="space-y-2 mt-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 w-full animate-pulse rounded bg-bg-subtle" />
        ))}
      </div>
    </div>
  );
}
