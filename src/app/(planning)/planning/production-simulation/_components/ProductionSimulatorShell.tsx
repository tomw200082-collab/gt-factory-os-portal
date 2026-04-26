"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SectionCard } from "@/components/workflow/SectionCard";
import { ProductSelector } from "./ProductSelector";
import { QuantityInput } from "./QuantityInput";
import { SimulationResults } from "./SimulationResults";

// ---------------------------------------------------------------------------
// ProductionSimulatorShell — owns selected product, draft quantity, and
// committed simulation target. Splitting the draft from the committed target
// lets us recompute results only when the operator presses "Simulate", which
// matches the plan's UX intent.
//
// Data source switched from IndexedDB itemsRepo (which held only seed
// fixtures keyed off items.primary_bom_head_id / items.base_bom_head_id —
// fields that are NULL on real production data) to the live API endpoints
// /api/boms/heads and /api/items. The real BOM-to-item linkage lives on
// bom_head.parent_ref_id; we discover finished products by walking BOM heads
// of kind PACK / REPACK that have an active version.
// ---------------------------------------------------------------------------

// Mirror of BomHeadDto / ItemDto shapes used by the Railway API. Kept local
// to this page so the simulation flow does not reach into the IDB repo
// contracts that no longer apply on real prod data.
export interface BomHeadRow {
  bom_head_id: string;
  bom_kind: string;
  parent_ref_id: string | null;
  parent_name: string | null;
  active_version_id: string | null;
  linked_base_bom_head_id: string | null;
  final_bom_output_qty: string;
  final_bom_output_uom: string | null;
  status: string;
}

export interface ItemRow {
  item_id: string;
  item_name: string;
  pack_size: string | null;
  sales_uom: string | null;
  supply_method: string;
  base_fill_qty_per_unit: number | string | null;
}

export type BaseFillSource =
  | "explicit"
  | "derived_from_bom"
  | "derived_from_pack_size"
  | "unresolved";

export interface BaseFillResolution {
  // L of base liquid per finished unit, or null if it cannot be resolved.
  qtyPerUnit: number | null;
  // How the value was determined:
  //   - "explicit"               → items.base_fill_qty_per_unit was set
  //   - "derived_from_bom"       → read from the PACK BOM line that consumes
  //                                the BASE component (most accurate auto-source)
  //   - "derived_from_pack_size" → derived from pack_size + sales_uom for
  //                                volume UOMs (L, ML); fallback for items
  //                                whose sales_uom is L/ML
  //   - "unresolved"             → none of the above could yield a value
  source: BaseFillSource;
}

/**
 * Minimal shape of a PACK BOM line used for base-fill derivation. Compatible
 * with both the simulator's `SimulatorLine` (component_id + component_uom +
 * unit_ratio) and a raw bom_lines row (final_component_id + component_uom +
 * final_component_qty), via field aliasing in the caller.
 */
export interface PackBomLineForFill {
  component_id: string;
  component_uom: string | null;
  // Qty of this component required per ONE finished unit produced by the
  // PACK head. For the simulator response this is `unit_ratio` (parsed).
  qty_per_unit: number;
}

export interface SimulatableProduct {
  // The product is identified by its PACK or REPACK head (the "finished
  // product" BOM). The BASE head, if any, is found via
  // packHead.linked_base_bom_head_id.
  packHead: BomHeadRow;
  baseHead: BomHeadRow | null;
  item: ItemRow | null;
  displayName: string;
  packSize: string | null;
  salesUom: string | null;
  supplyMethod: string;
  baseFill: BaseFillResolution;
  // Back-compat shortcut: the resolved L-per-unit (or null), regardless of
  // whether it was explicit or derived. Consumers that only need the number
  // can keep reading this; consumers that want to render different notices
  // for "explicit" vs "derived" vs "unresolved" should read `baseFill`.
  baseFillQtyPerUnit: number | null;
}

interface ListEnvelope<T> {
  rows: T[];
  count: number;
  total?: number;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error("Could not load data. Check your connection and try refreshing.");
  }
  return (await res.json()) as T;
}

function toFiniteNumber(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export interface BaseFillContext {
  item: ItemRow | null;
  // PACK BOM lines (e.g. from the simulator response, mapped into the
  // PackBomLineForFill shape). Used to find the line consuming the BASE
  // component and derive the liquid volume from it.
  packBomLines?: PackBomLineForFill[];
  // The BASE BOM head's `parent_ref_id` — i.e. the BASE component_id that
  // the PACK BOM should be consuming as its liquid input.
  baseBomParentRefId?: string | null;
}

/**
 * Determine the base liquid volume (in L) per finished unit.
 * Priority:
 *   1. items.base_fill_qty_per_unit (explicit override) — used as-is
 *   2. derive from the PACK BOM line that consumes the BASE component
 *      (most accurate; works regardless of sales_uom being BOTTLE/UNIT/etc.)
 *   3. derive from pack_size + sales_uom for volume UOMs (L, ML)
 *   4. otherwise → unresolved (caller should warn the operator)
 *
 * Why step 2 is preferred: many beverage SKUs are sold as `BOTTLE` (a
 * piece UOM), so pack_size + sales_uom can't tell us the liquid volume.
 * The PACK recipe, however, explicitly states how much BASE mix it
 * consumes per finished unit (e.g. "0.5 L of CALM BASE MIX per bottle").
 * That recipe value is what actually drives BASE component scaling, so we
 * read it directly when available.
 */
export function resolveBaseFillQtyPerUnit(
  ctx: ItemRow | BaseFillContext | null,
): BaseFillResolution {
  // Back-compat: callers that still pass a bare ItemRow are treated as
  // { item } with no PACK context.
  const context: BaseFillContext =
    ctx === null
      ? { item: null }
      : "item" in ctx || "packBomLines" in ctx || "baseBomParentRefId" in ctx
        ? (ctx as BaseFillContext)
        : { item: ctx as ItemRow };
  const { item, packBomLines, baseBomParentRefId } = context;

  // 1. Explicit override on the item master.
  if (item) {
    const explicit = toFiniteNumber(item.base_fill_qty_per_unit);
    if (explicit !== null && explicit > 0) {
      return { qtyPerUnit: explicit, source: "explicit" };
    }
  }

  // 2. Derive from the PACK BOM line that consumes the BASE component.
  if (packBomLines && packBomLines.length > 0 && baseBomParentRefId) {
    const baseLine = packBomLines.find(
      (l) => l.component_id === baseBomParentRefId,
    );
    if (
      baseLine &&
      Number.isFinite(baseLine.qty_per_unit) &&
      baseLine.qty_per_unit > 0
    ) {
      const uom = (baseLine.component_uom ?? "").toUpperCase();
      if (uom === "L") {
        return { qtyPerUnit: baseLine.qty_per_unit, source: "derived_from_bom" };
      }
      if (uom === "ML") {
        return {
          qtyPerUnit: baseLine.qty_per_unit / 1000,
          source: "derived_from_bom",
        };
      }
      // Non-volume UOM on the BASE-mix line → fall through to pack_size.
    }
  }

  // 3. Derive from pack_size + sales_uom (legacy fallback for L/ML SKUs).
  if (item) {
    const packSize = toFiniteNumber(item.pack_size);
    const uom = item.sales_uom?.toUpperCase() ?? null;
    if (packSize !== null && packSize > 0 && uom) {
      if (uom === "L")
        return { qtyPerUnit: packSize, source: "derived_from_pack_size" };
      if (uom === "ML")
        return {
          qtyPerUnit: packSize / 1000,
          source: "derived_from_pack_size",
        };
      // KG / G / UNIT / BOTTLE / other non-volume UOMs → cannot derive.
    }
  }

  return { qtyPerUnit: null, source: "unresolved" };
}

async function loadSimulatableProducts(): Promise<SimulatableProduct[]> {
  const [headsEnv, itemsEnv] = await Promise.all([
    fetchJson<ListEnvelope<BomHeadRow>>("/api/boms/heads?limit=1000"),
    fetchJson<ListEnvelope<ItemRow>>("/api/items?limit=1000"),
  ]);

  const heads = headsEnv.rows ?? [];
  const items = itemsEnv.rows ?? [];

  const itemsById = new Map<string, ItemRow>();
  for (const it of items) itemsById.set(it.item_id, it);

  // Index BASE heads by their bom_head_id so PACK heads can find their
  // linked BASE quickly.
  const headById = new Map<string, BomHeadRow>();
  for (const h of heads) headById.set(h.bom_head_id, h);

  // Finished-product heads: PACK or REPACK with an active version.
  // (BASE heads are recipes for liquid mixes and are never selected directly
  // in the Production Simulation flow — they're discovered via the linked
  // pack head.)
  const finishedHeads = heads.filter(
    (h) =>
      (h.bom_kind === "PACK" || h.bom_kind === "REPACK") &&
      h.active_version_id !== null,
  );

  // Dedup by parent_ref_id (the item being produced). If two PACK heads
  // somehow target the same item, prefer the one with an active version
  // and a stable bom_head_id ordering.
  const byParent = new Map<string, BomHeadRow>();
  for (const h of finishedHeads) {
    const key = h.parent_ref_id ?? `__head__:${h.bom_head_id}`;
    const existing = byParent.get(key);
    if (!existing || h.bom_head_id.localeCompare(existing.bom_head_id) < 0) {
      byParent.set(key, h);
    }
  }

  const products: SimulatableProduct[] = [];
  for (const packHead of byParent.values()) {
    const item = packHead.parent_ref_id
      ? itemsById.get(packHead.parent_ref_id) ?? null
      : null;
    const baseHead = packHead.linked_base_bom_head_id
      ? headById.get(packHead.linked_base_bom_head_id) ?? null
      : null;
    const displayName =
      item?.item_name ?? packHead.parent_name ?? packHead.bom_head_id;
    const baseFill = resolveBaseFillQtyPerUnit(item);
    products.push({
      packHead,
      baseHead,
      item,
      displayName,
      packSize: item?.pack_size ?? null,
      salesUom: item?.sales_uom ?? null,
      supplyMethod: item?.supply_method ?? packHead.bom_kind,
      baseFill,
      baseFillQtyPerUnit: baseFill.qtyPerUnit,
    });
  }

  products.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return products;
}

export function ProductionSimulatorShell() {
  const [selectedHeadId, setSelectedHeadId] = useState<string | null>(null);
  const [draftQty, setDraftQty] = useState<number>(100);
  const [committedQty, setCommittedQty] = useState<number | null>(null);

  const productsQuery = useQuery<SimulatableProduct[]>({
    queryKey: ["production-simulation", "products", "v2"],
    queryFn: loadSimulatableProducts,
    staleTime: 60_000,
  });

  const selectedProduct =
    productsQuery.data?.find((p) => p.packHead.bom_head_id === selectedHeadId) ??
    null;

  const handleSimulate = () => {
    if (!selectedProduct) return;
    if (!Number.isFinite(draftQty) || draftQty <= 0) return;
    setCommittedQty(draftQty);
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        eyebrow="Inputs"
        title="Pick a product and target output"
        description="Finished products (MANUFACTURED + REPACK) with an active BOM are listed."
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
          <div className="flex-1 min-w-0">
            <ProductSelector
              products={productsQuery.data ?? []}
              loading={productsQuery.isLoading}
              error={productsQuery.isError}
              selectedHeadId={selectedHeadId}
              onSelect={(id) => {
                setSelectedHeadId(id);
                setCommittedQty(null);
              }}
            />
          </div>
          <div className="shrink-0">
            <QuantityInput
              value={draftQty}
              onChange={setDraftQty}
              onSubmit={handleSimulate}
              disabled={!selectedProduct}
            />
          </div>
        </div>

        {selectedProduct ? (
          <div className="mt-3 flex flex-wrap gap-2 text-3xs text-fg-muted">
            <span>
              Supply method:{" "}
              <span className="font-semibold text-fg">
                {selectedProduct.supplyMethod}
              </span>
            </span>
            {selectedProduct.baseFillQtyPerUnit ? (
              <span>
                · Base fill per unit:{" "}
                <span className="font-semibold text-fg">
                  {selectedProduct.baseFillQtyPerUnit} L
                </span>
              </span>
            ) : null}
            <span>· PACK linked</span>
            {selectedProduct.baseHead ? <span>· BASE linked</span> : null}
          </div>
        ) : null}
      </SectionCard>

      {selectedProduct && committedQty !== null ? (
        <SimulationResults product={selectedProduct} targetQty={committedQty} />
      ) : (
        <SectionCard>
          <div className="text-xs text-fg-muted">
            Pick a product, enter a target quantity, then press Simulate to see
            the combined BASE + PACK component requirements.
          </div>
        </SectionCard>
      )}
    </div>
  );
}
