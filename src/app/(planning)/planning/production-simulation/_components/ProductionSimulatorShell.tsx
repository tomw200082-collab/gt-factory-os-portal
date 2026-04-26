"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SectionCard } from "@/components/workflow/SectionCard";
import { itemsRepo, bomsRepo } from "@/lib/repositories";
import type { ItemDto } from "@/lib/contracts/dto";
import { ProductSelector } from "./ProductSelector";
import { QuantityInput } from "./QuantityInput";
import { SimulationResults } from "./SimulationResults";

// ---------------------------------------------------------------------------
// ProductionSimulatorShell — owns selected product, draft quantity, and
// committed simulation target. Splitting the draft from the committed target
// lets us recompute results only when the operator presses "Simulate", which
// matches the plan's UX intent.
// ---------------------------------------------------------------------------

interface SimulatableProduct {
  item: ItemDto;
  hasPack: boolean;
  hasBase: boolean;
}

async function loadSimulatableProducts(): Promise<SimulatableProduct[]> {
  const items = await itemsRepo.list();
  const eligible: SimulatableProduct[] = [];
  for (const item of items) {
    if (item.supply_method !== "MANUFACTURED" && item.supply_method !== "REPACK") {
      continue;
    }
    const hasPack = !!item.primary_bom_head_id;
    const hasBase = !!item.base_bom_head_id;
    if (!hasPack && !hasBase) continue;
    // Confirm the head(s) actually exist before listing the item.
    const { pack, base } = await bomsRepo.getProductBoms(item);
    if (!pack && !base) continue;
    eligible.push({
      item,
      hasPack: !!pack,
      hasBase: !!base,
    });
  }
  // Stable sort by name for the dropdown.
  eligible.sort((a, b) => a.item.item_name.localeCompare(b.item.item_name));
  return eligible;
}

export function ProductionSimulatorShell() {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [draftQty, setDraftQty] = useState<number>(100);
  const [committedQty, setCommittedQty] = useState<number | null>(null);

  const productsQuery = useQuery<SimulatableProduct[]>({
    queryKey: ["production-simulation", "products"],
    queryFn: loadSimulatableProducts,
    staleTime: 60_000,
  });

  const selectedProduct =
    productsQuery.data?.find((p) => p.item.item_id === selectedItemId) ?? null;

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
        description="Only MANUFACTURED and REPACK items with at least one linked BOM are listed."
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
          <div className="flex-1 min-w-0">
            <ProductSelector
              products={productsQuery.data ?? []}
              loading={productsQuery.isLoading}
              error={productsQuery.isError}
              selectedItemId={selectedItemId}
              onSelect={(id) => {
                setSelectedItemId(id);
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
                {selectedProduct.item.supply_method}
              </span>
            </span>
            {selectedProduct.item.base_fill_qty_per_unit ? (
              <span>
                · Base fill per unit:{" "}
                <span className="font-semibold text-fg">
                  {selectedProduct.item.base_fill_qty_per_unit} L
                </span>
              </span>
            ) : null}
            {selectedProduct.hasPack ? <span>· PACK linked</span> : null}
            {selectedProduct.hasBase ? <span>· BASE linked</span> : null}
          </div>
        ) : null}
      </SectionCard>

      {selectedProduct && committedQty !== null ? (
        <SimulationResults
          product={selectedProduct.item}
          targetQty={committedQty}
        />
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
