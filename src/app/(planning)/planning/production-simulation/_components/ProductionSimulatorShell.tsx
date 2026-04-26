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
  supply_method: string;
  base_fill_qty_per_unit: number | string | null;
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
  supplyMethod: string;
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
    products.push({
      packHead,
      baseHead,
      item,
      displayName,
      packSize: item?.pack_size ?? null,
      supplyMethod: item?.supply_method ?? packHead.bom_kind,
      baseFillQtyPerUnit: toFiniteNumber(item?.base_fill_qty_per_unit ?? null),
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
