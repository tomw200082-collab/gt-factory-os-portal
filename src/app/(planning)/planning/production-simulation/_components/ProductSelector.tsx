"use client";

import type { ItemDto } from "@/lib/contracts/dto";

interface SimulatableProduct {
  item: ItemDto;
  hasPack: boolean;
  hasBase: boolean;
}

interface ProductSelectorProps {
  products: SimulatableProduct[];
  loading: boolean;
  error: boolean;
  selectedItemId: string | null;
  onSelect: (id: string | null) => void;
}

export function ProductSelector({
  products,
  loading,
  error,
  selectedItemId,
  onSelect,
}: ProductSelectorProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
        Product
      </span>
      <select
        className="select select-bordered w-full rounded-sm border border-border/70 bg-bg-raised px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
        value={selectedItemId ?? ""}
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
                : "Select a product…"}
        </option>
        {products.map((p) => (
          <option key={p.item.item_id} value={p.item.item_id}>
            {p.item.item_name}
            {p.item.pack_size ? ` — ${p.item.pack_size}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
