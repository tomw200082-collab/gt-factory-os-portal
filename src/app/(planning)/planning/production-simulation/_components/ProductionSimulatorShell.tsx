"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { SectionCard } from "@/components/workflow/SectionCard";
import { ProductSelector } from "./ProductSelector";
import { QuantityInput } from "./QuantityInput";
import { SimulationResults } from "./SimulationResults";

// ---------------------------------------------------------------------------
// ProductionSimulatorShell — the whole page in one calm flow:
//
//   1. Pick a finished product (searchable).
//   2. Enter a target output quantity and press Simulate.
//   3. See exactly how much of every ingredient and packaging component is
//      needed — in the recipe's exact ratios — and whether stock covers it.
//
// `draftQty` is what the operator is typing; `committedQty` is what the last
// Simulate press locked in. Results recompute only on Simulate, so editing
// the quantity never silently changes the answer on screen.
//
// Data comes from the live API: /api/boms/heads + /api/items for discovery,
// then /api/boms/heads/:id/simulate + /net-requirements for the run. Nothing
// here writes inventory — this is a what-if surface.
// ---------------------------------------------------------------------------

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
}

export interface SimulatableProduct {
  // A product is identified by its PACK / REPACK head — the finished-product
  // recipe. The BASE head (the liquid mix), if any, is reached through
  // packHead.linked_base_bom_head_id.
  packHead: BomHeadRow;
  baseHead: BomHeadRow | null;
  item: ItemRow | null;
  displayName: string;
  packSize: string | null;
  supplyMethod: string;
}

/**
 * One PACK BOM line, reduced to what base-fill resolution needs: the qty of
 * this component consumed per ONE finished unit, plus its UOM.
 */
export interface PackBomLineForFill {
  component_id: string;
  component_uom: string | null;
  qty_per_unit: number;
}

interface ListEnvelope<T> {
  rows: T[];
  count: number;
  total?: number;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(
      "Could not load data. Check your connection and try refreshing.",
    );
  }
  return (await res.json()) as T;
}

/**
 * Resolve litres of BASE liquid per finished unit — strictly from the recipe.
 *
 * The PACK recipe has one line that consumes the linked BASE head as a
 * component; that line's per-unit qty IS the litres of base mix per finished
 * unit. This is the only trustworthy source: it comes straight from the BOM,
 * so the simulation scales on the same ratios the factory actually uses.
 *
 * Earlier versions guessed this value from the product name ("AMERICAN 1L"
 * → 1.0 L) or from pack_size when the recipe link was missing. Those guesses
 * silently produced base quantities that did not match the recipe, so they
 * were removed: if the recipe cannot supply the ratio, the simulation is
 * blocked rather than answered with a guess.
 *
 * Returns null when the PACK recipe has no line consuming the BASE head, or
 * that line is not in a volume UOM.
 */
export function resolveBaseFillFromRecipe(
  packBomLines: PackBomLineForFill[],
  baseHeadId: string,
): number | null {
  const baseLine = packBomLines.find((l) => l.component_id === baseHeadId);
  if (
    !baseLine ||
    !Number.isFinite(baseLine.qty_per_unit) ||
    baseLine.qty_per_unit <= 0
  ) {
    return null;
  }
  const uom = (baseLine.component_uom ?? "").toUpperCase();
  if (uom === "L") return baseLine.qty_per_unit;
  if (uom === "ML") return baseLine.qty_per_unit / 1000;
  return null;
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

  const headById = new Map<string, BomHeadRow>();
  for (const h of heads) headById.set(h.bom_head_id, h);

  // Finished products: PACK / REPACK heads with an active version. BASE heads
  // are liquid-mix recipes — never selected directly, only reached via the
  // PACK head that consumes them.
  const finishedHeads = heads.filter(
    (h) =>
      (h.bom_kind === "PACK" || h.bom_kind === "REPACK") &&
      h.active_version_id !== null,
  );

  // One product per produced item. If two PACK heads target the same item,
  // keep the lexicographically-first head id for a stable, deterministic pick.
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
    products.push({
      packHead,
      baseHead,
      item,
      displayName:
        item?.item_name ?? packHead.parent_name ?? packHead.bom_head_id,
      packSize: item?.pack_size ?? null,
      supplyMethod: item?.supply_method ?? packHead.bom_kind,
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
    queryKey: ["production-simulation", "products", "v3"],
    queryFn: loadSimulatableProducts,
    staleTime: 60_000,
    throwOnError: false,
  });

  const selectedProduct =
    productsQuery.data?.find(
      (p) => p.packHead.bom_head_id === selectedHeadId,
    ) ?? null;

  const canSimulate =
    selectedProduct !== null && Number.isFinite(draftQty) && draftQty > 0;

  function handleSimulate() {
    if (!canSimulate) return;
    setCommittedQty(draftQty);
  }

  return (
    <div className="mt-5 flex flex-col gap-5">
      <SectionCard
        eyebrow="Step 1"
        title="Choose a product and target quantity"
        description="Finished products with an active recipe are listed. Press Simulate to break down the run."
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:gap-6">
          <div className="min-w-0 flex-1">
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
          <QuantityInput
            value={draftQty}
            onChange={setDraftQty}
            onSubmit={handleSimulate}
            disabled={!selectedProduct}
            canSubmit={canSimulate}
          />
        </div>

        {selectedProduct ? (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/60 pt-3 text-2xs text-fg-muted">
            <span>
              Supply method{" "}
              <span className="font-semibold text-fg-strong">
                {selectedProduct.supplyMethod}
              </span>
            </span>
            <span aria-hidden className="text-fg-faint">
              ·
            </span>
            <span className="font-semibold text-fg-strong">PACK recipe</span>
            {selectedProduct.baseHead ? (
              <>
                <span aria-hidden className="text-fg-faint">
                  +
                </span>
                <span className="font-semibold text-fg-strong">
                  BASE recipe
                </span>
              </>
            ) : null}
          </div>
        ) : null}
      </SectionCard>

      {selectedProduct && committedQty !== null ? (
        <SimulationResults product={selectedProduct} targetQty={committedQty} />
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/70 bg-bg-subtle/30 px-6 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border/70 bg-bg-raised">
            <FlaskConical
              className="h-6 w-6 text-fg-muted"
              strokeWidth={1.75}
              aria-hidden
            />
          </span>
          <p className="text-base font-semibold text-fg-strong">
            No simulation yet
          </p>
          <p className="max-w-sm text-sm text-fg-muted">
            Pick a product and a target quantity, then press Simulate to see
            the full ingredient and packaging breakdown.
          </p>
        </div>
      )}
    </div>
  );
}
