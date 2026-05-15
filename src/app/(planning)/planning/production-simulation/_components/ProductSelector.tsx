"use client";

import { useMemo } from "react";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/fields/SearchableSelect";
import type { SimulatableProduct } from "./ProductionSimulatorShell";

interface ProductSelectorProps {
  products: SimulatableProduct[];
  loading: boolean;
  error: boolean;
  selectedHeadId: string | null;
  onSelect: (id: string | null) => void;
}

/**
 * Searchable finished-product picker. Replaces the old native <select> with
 * the portal's standard type-ahead combobox so a planner can find a product
 * by typing part of its name instead of scrolling a long list.
 */
export function ProductSelector({
  products,
  loading,
  error,
  selectedHeadId,
  onSelect,
}: ProductSelectorProps) {
  const options = useMemo<SearchableSelectOption[]>(
    () =>
      products.map((p) => ({
        value: p.packHead.bom_head_id,
        label: p.displayName,
        meta: p.packSize
          ? `${p.supplyMethod} · ${p.packSize}`
          : p.supplyMethod,
      })),
    [products],
  );

  const emptyMessage = error
    ? "Could not load products"
    : "No simulatable products found";

  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs font-bold uppercase tracking-sops text-fg-subtle">
        Product
      </span>
      <SearchableSelect
        value={selectedHeadId ?? ""}
        onChange={(id) => onSelect(id || null)}
        options={options}
        loading={loading}
        disabled={error}
        placeholder="Select a finished product…"
        searchPlaceholder="Search products by name…"
        emptyMessage={emptyMessage}
        invalid={error}
        ariaLabel="Finished product"
        testId="production-simulation-product-select"
        className="h-12 text-base"
      />
    </label>
  );
}
