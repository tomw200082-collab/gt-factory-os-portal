"use client";

// InventoryImpactPanel — the per-card "inventory impact" disclosure for a
// production plan: what this run adds to stock, plus the raw materials it
// consumes (scaled to the run's quantity).
//
// Extracted from ProductionJobCard (deepen pass): the card no longer owns the
// BOM-snapshot fetch, the consumption-scaling math, the snapshot type, or this
// ~70 lines of JSX — it just renders <InventoryImpactPanel open={…} … />. The
// hard parts (lazy fetch keyed by plan, multiplier math, load/error/empty
// states) are hidden behind a small interface.

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { fmtQty } from "../_lib/helpers";
import type { ProductionPlanRow } from "../_lib/types";

interface BomImpactSnapshot {
  bom_final_output_qty: string;
  bom_final_output_uom: string;
  bom_lines: Array<{
    component_id: string;
    component_name: string;
    final_component_qty: string;
    component_uom: string | null;
  }>;
}

// Lazy: both args are null while the panel is closed, so the query stays
// disabled until it opens.
function useBomImpact(itemId: string | null, planId: string | null) {
  return useQuery<BomImpactSnapshot | null>({
    // Tranche 052 — plan id is part of the key: with from_plan_id the open
    // response's base-source lines reflect that plan's improvised recipe,
    // so snapshots must not be shared across plans of the same item.
    queryKey: ["bom-impact", itemId, planId],
    queryFn: async () => {
      if (!itemId) return null;
      const q = new URLSearchParams({ item_id: itemId });
      if (planId) q.set("from_plan_id", planId);
      const res = await fetch(`/api/production-actuals/open?${q.toString()}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return null;
      return ((await res.json()) as BomImpactSnapshot | null) ?? null;
    },
    // Lazy via `enabled` (Tranche 052): both args are null while the panel
    // is closed; opening it flips the key + enables the fetch. The previous
    // `enabled:false` + manual refetch() raced the key change.
    enabled: itemId !== null,
    staleTime: 5 * 60 * 1000,
  });
}

export function InventoryImpactPanel({
  open,
  plan,
  cardTitle,
  heroQty,
  heroQtyStr,
  heroUom,
}: {
  open: boolean;
  plan: ProductionPlanRow;
  cardTitle: string | null;
  /** Full-precision quantity that drives the consumption multiplier. */
  heroQty: number;
  /** Display string for the quantity banner (matches the card's hero). */
  heroQtyStr: string;
  heroUom: string | null;
}) {
  const bomQuery = useBomImpact(
    open ? plan.item_id : null,
    open ? plan.plan_id : null,
  );

  // Consumption scales off the hero quantity: a done run consumed raw
  // materials against its ACTUAL output, an open plan against its target.
  const rmLines = useMemo(() => {
    const snap = bomQuery.data;
    if (!snap) return [];
    const outputQty = parseFloat(snap.bom_final_output_qty);
    if (!Number.isFinite(outputQty) || outputQty <= 0) return [];
    if (!Number.isFinite(heroQty) || heroQty <= 0) return [];
    const multiplier = heroQty / outputQty;
    return snap.bom_lines.map((line) => ({
      name: line.component_name,
      required: parseFloat(line.final_component_qty) * multiplier,
      uom: line.component_uom ?? "",
    }));
  }, [bomQuery.data, heroQty]);

  if (!open) return null;

  return (
    <div
      className="mx-3 mb-3 rounded border border-info/30 bg-info-softer/20 p-2.5 space-y-2"
      data-testid="impact-panel"
    >
      <div className="flex items-center gap-2 rounded border border-success/30 bg-success-softer/50 px-2 py-1.5">
        <Package className="h-3 w-3 text-success shrink-0" strokeWidth={2} />
        <span className="text-xs text-success-fg">
          <span className="font-semibold tabular-nums">
            +{fmtQty(heroQtyStr, heroUom ?? "")}
          </span>
          {" of "}
          <span className="font-medium">{cardTitle}</span>
          {plan.is_base_batch ? " to base liquid" : " to finished goods"}
        </span>
      </div>

      {bomQuery.isLoading ? (
        <div className="space-y-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-5 w-full animate-pulse rounded bg-bg-subtle" />
          ))}
        </div>
      ) : bomQuery.isError || !bomQuery.data ? (
        <div className="text-xs text-fg-muted">
          BOM data not available.{" "}
          {/* INTER-011 — the fetch can fail transiently; give an in-place
              retry so the planner need not close and reopen the panel. */}
          <button
            type="button"
            onClick={() => void bomQuery.refetch()}
            disabled={bomQuery.isFetching}
            className="text-accent hover:underline disabled:opacity-50"
            data-testid="impact-bom-retry"
          >
            {bomQuery.isFetching ? "Retrying…" : "Try again"}
          </button>
          {" · "}
          <Link href="/planning/inventory-flow" className="text-accent hover:underline">
            Check inventory flow →
          </Link>
        </div>
      ) : rmLines.length === 0 ? (
        <div className="text-xs text-fg-muted">No components in BOM.</div>
      ) : (
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-sops text-fg-faint mb-1">
            Raw materials required
          </div>
          <table className="w-full">
            <thead>
              <tr>
                <th scope="col" className="text-left text-[9px] uppercase tracking-sops text-fg-faint font-semibold pb-1">
                  Material
                </th>
                <th scope="col" className="text-right text-[9px] uppercase tracking-sops text-fg-faint font-semibold pb-1">
                  Required
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {rmLines.map((line, idx) => (
                <tr key={idx}>
                  <td className="text-xs text-fg py-1 pr-2">{line.name}</td>
                  <td className="text-right text-xs tabular-nums text-fg-muted py-1">
                    {line.required % 1 === 0
                      ? line.required.toFixed(0)
                      : line.required.toFixed(2).replace(/\.?0+$/, "")}
                    {" "}{line.uom}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-1.5">
            <Link
              href="/planning/inventory-flow"
              className="text-[10px] text-accent hover:underline"
            >
              Check stock levels in inventory flow →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
