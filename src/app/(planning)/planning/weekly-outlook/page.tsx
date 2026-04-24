"use client";

// ---------------------------------------------------------------------------
// Weekly Inventory Outlook — FG stock projection by week.
//
// Data source: GET /api/inventory/weekly-outlook
//   Returns planning_run_fg_coverage rows from the latest completed
//   planning run, joined with item names.
//
// Layout: matrix — items as rows, weeks as columns.
//   Each cell shows projected_on_hand at end of week.
//   Color: green (≥ safety threshold 0), amber (low but > 0), red (≤ 0).
//   Over cell: demand_qty absorbed. Below: PO inbound qty if any.
//
// This is a READ-ONLY intelligence surface. No mutations from this page.
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";

interface WeeklyOutlookRow {
  item_id: string;
  item_name: string;
  supply_method: string;
  period_bucket_key: string; // ISO date (Monday)
  demand_qty: string;
  available_qty: string;
  projected_on_hand: string;
  shortage_flag: boolean;
  shortage_date: string | null;
  po_inbound_qty: string;
}

interface WeeklyOutlookResponse {
  run_id: string | null;
  run_executed_at: string | null;
  planning_horizon_start_at: string | null;
  planning_horizon_weeks: number | null;
  rows: WeeklyOutlookRow[];
  count: number;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function fmtQty(qty: string): string {
  const n = Number(qty);
  if (!Number.isFinite(n)) return qty;
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (Math.abs(n) < 0.01 && n !== 0) return n.toFixed(4);
  return n.toFixed(n % 1 === 0 ? 0 : 2);
}

function cellClass(projectedOnHand: string, shortageFlag: boolean): string {
  if (shortageFlag || Number(projectedOnHand) <= 0) {
    return "bg-danger-softer text-danger-fg";
  }
  if (Number(projectedOnHand) < 50) {
    // Amber for low stock (threshold: 50 units; will be policy-driven in future)
    return "bg-warning-softer text-warning-fg";
  }
  return "bg-success-softer text-success-fg";
}

export default function WeeklyOutlookPage() {
  const outlookQuery = useQuery<WeeklyOutlookResponse>({
    queryKey: ["inventory", "weekly-outlook"],
    queryFn: () =>
      fetch("/api/inventory/weekly-outlook", {
        headers: { Accept: "application/json" },
      }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<WeeklyOutlookResponse>;
      }),
    staleTime: 5 * 60_000,
    retry: false,
  });

  // Derive the sorted list of unique weeks and items from the flat rows array.
  const { weeks, items, cellMap } = useMemo(() => {
    const rows = outlookQuery.data?.rows ?? [];
    const weekSet = new Set<string>();
    const itemSet = new Set<string>();
    // cellMap: item_id → (week → row)
    const cellMap = new Map<string, Map<string, WeeklyOutlookRow>>();

    for (const r of rows) {
      weekSet.add(r.period_bucket_key);
      itemSet.add(r.item_id);
      if (!cellMap.has(r.item_id)) cellMap.set(r.item_id, new Map());
      cellMap.get(r.item_id)!.set(r.period_bucket_key, r);
    }

    // Sorted weeks (ISO date strings sort correctly lexicographically).
    const weeks = [...weekSet].sort();

    // Sort items: shortage first, then alphabetically by name.
    const itemRows = [...itemSet].map((id) => {
      const firstRow = cellMap.get(id)?.values().next().value;
      return { item_id: id, item_name: firstRow?.item_name ?? id };
    });
    const shortageItemIds = new Set(
      rows.filter((r) => r.shortage_flag).map((r) => r.item_id),
    );
    itemRows.sort((a, b) => {
      const aShort = shortageItemIds.has(a.item_id) ? 0 : 1;
      const bShort = shortageItemIds.has(b.item_id) ? 0 : 1;
      if (aShort !== bShort) return aShort - bShort;
      return a.item_name.localeCompare(b.item_name);
    });

    return { weeks, items: itemRows, cellMap };
  }, [outlookQuery.data]);

  const data = outlookQuery.data;

  return (
    <>
      <WorkflowHeader
        eyebrow="Planner view"
        title="Weekly Inventory Outlook"
        description="Projected FG stock by week from the latest completed planning run. Red = shortage, amber = low, green = safe. Demand absorbed each week is shown; PO inbound is informational overlay."
      />

      {/* Run metadata strip */}
      {data?.run_id ? (
        <div className="mb-4 rounded-md border border-border/60 bg-bg-subtle/40 px-4 py-2 text-xs text-fg-muted">
          Planning run executed:{" "}
          <span className="text-fg">
            {data.run_executed_at
              ? new Date(data.run_executed_at).toLocaleString()
              : "unknown"}
          </span>
          {" · "}
          Horizon:{" "}
          <span className="text-fg">
            {data.planning_horizon_start_at ?? "?"} ×{" "}
            {data.planning_horizon_weeks ?? "?"} weeks
          </span>
          {" · "}
          <span className="font-mono text-3xs">{data.run_id.slice(0, 8)}…</span>
        </div>
      ) : null}

      {/* Loading / error / empty */}
      {outlookQuery.isLoading ? (
        <div className="p-8 text-center text-sm text-fg-muted">
          Loading weekly outlook…
        </div>
      ) : outlookQuery.isError ? (
        <div className="rounded-md border border-danger/40 bg-danger-softer px-4 py-3 text-sm text-danger-fg">
          <div className="font-medium">Failed to load weekly outlook.</div>
          <div className="mt-1 font-mono text-xs opacity-70">
            {(outlookQuery.error as Error).message}
          </div>
        </div>
      ) : !data?.run_id ? (
        <div className="rounded-md border border-border/60 bg-bg-subtle/40 px-4 py-6 text-center text-sm text-fg-muted">
          No completed planning run found. Run a planning cycle first to see
          the weekly inventory outlook.
        </div>
      ) : weeks.length === 0 ? (
        <div className="rounded-md border border-border/60 bg-bg-subtle/40 px-4 py-6 text-center text-sm text-fg-muted">
          Planning run has no FG coverage rows yet.
        </div>
      ) : (
        <>
          {/* Legend */}
          <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-fg-muted">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-success-softer" />
              Safe
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-warning-softer" />
              Low (&lt; 50)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-danger-softer" />
              Shortage (≤ 0)
            </span>
            <span className="ml-auto">
              Cell = projected closing stock · ↑ demand absorbed · ↓ PO
              inbound
            </span>
          </div>

          {/* Matrix table */}
          <div className="overflow-x-auto rounded-md border border-border/70">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/80">
                  <th className="sticky left-0 z-10 min-w-[160px] bg-bg-subtle/80 px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Item
                  </th>
                  {weeks.map((w) => (
                    <th
                      key={w}
                      className="min-w-[90px] px-2 py-2 text-center text-3xs font-semibold uppercase tracking-sops text-fg-subtle"
                    >
                      Wk {fmtDate(w)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const rowMap = cellMap.get(item.item_id);
                  return (
                    <tr
                      key={item.item_id}
                      className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/30"
                    >
                      <td className="sticky left-0 z-10 bg-bg px-3 py-2 group-hover:bg-bg-subtle/30">
                        <div className="font-medium text-fg">
                          {item.item_name}
                        </div>
                        <div className="font-mono text-3xs text-fg-muted">
                          {item.item_id}
                        </div>
                      </td>
                      {weeks.map((w) => {
                        const cell = rowMap?.get(w);
                        if (!cell) {
                          return (
                            <td
                              key={w}
                              className="px-2 py-2 text-center text-fg-subtle"
                            >
                              —
                            </td>
                          );
                        }
                        const poQty = Number(cell.po_inbound_qty);
                        return (
                          <td
                            key={w}
                            className={`px-2 py-1.5 text-center ${cellClass(cell.projected_on_hand, cell.shortage_flag)}`}
                          >
                            {/* Closing stock (main number) */}
                            <div className="font-mono font-semibold text-sm leading-tight">
                              {fmtQty(cell.projected_on_hand)}
                            </div>
                            {/* Demand absorbed */}
                            {Number(cell.demand_qty) > 0 ? (
                              <div className="mt-0.5 text-3xs opacity-70">
                                −{fmtQty(cell.demand_qty)} demand
                              </div>
                            ) : null}
                            {/* PO inbound overlay */}
                            {poQty > 0 ? (
                              <div className="mt-0.5 rounded-sm border border-info/30 bg-info-soft/50 px-1 text-3xs text-info-fg">
                                +{fmtQty(cell.po_inbound_qty)} PO
                              </div>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Shortage summary */}
          {(() => {
            const shortageItems = items.filter((it) =>
              cellMap
                .get(it.item_id)
                ?.values()
                .next()
                .value
                ? [...(cellMap.get(it.item_id)?.values() ?? [])].some(
                    (r) => r.shortage_flag,
                  )
                : false,
            );
            if (shortageItems.length === 0) return null;
            return (
              <div className="mt-4 rounded-md border border-danger/40 bg-danger-softer px-4 py-3 text-sm">
                <div className="font-medium text-danger-fg">
                  {shortageItems.length} item
                  {shortageItems.length !== 1 ? "s" : ""} projected to run
                  short within the planning horizon:
                </div>
                <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-danger-fg/80">
                  {shortageItems.map((it) => {
                    const shortageRow = [...(cellMap.get(it.item_id)?.values() ?? [])].find(
                      (r) => r.shortage_flag,
                    );
                    return (
                      <li key={it.item_id}>
                        <span className="font-medium">{it.item_name}</span>
                        {shortageRow?.shortage_date ? (
                          <span className="ml-1 opacity-80">
                            — first shortage week of{" "}
                            {fmtDate(shortageRow.shortage_date)}
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })()}
        </>
      )}
    </>
  );
}
