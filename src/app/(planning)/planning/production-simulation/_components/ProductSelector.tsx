"use client";

import type { SimulatableProduct } from "./ProductionSimulatorShell";

interface ProductSelectorProps {
  products: SimulatableProduct[];
  loading: boolean;
  error: boolean;
  selectedHeadId: string | null;
  onSelect: (id: string | null) => void;
}

export function ProductSelector({
  products,
  loading,
  error,
  selectedHeadId,
  onSelect,
}: ProductSelectorProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
        Product
      </span>
      <select
        className="select select-bordered w-full rounded-sm border border-border/70 bg-bg-raised px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
        value={selectedHeadId ?? ""}
        onChange={(e) => onSelect(e.target.value || null)}
        disabled={loading || error}
        data-testid="production-simulation-product-select"
      >
        <option value="">
          {loading
            ? "Loading products…"
            : error
              ? "Could not load products"
              : products.length === 0
                ? "No simulatable products found"
                : `Select a product… (${products.length} available)`}
        </option>
        {products.map((p) => (
          <option key={p.packHead.bom_head_id} value={p.packHead.bom_head_id}>
            {p.displayName}
            {p.packSize ? ` — ${p.packSize}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
