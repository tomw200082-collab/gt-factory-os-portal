import { useMemo } from "react";
import { isAtRisk } from "./risk";
import type { FlowItem } from "./types";

// useFlowItems — the single source of flow item-derivation for both the FG
// (InventoryFlowClient) and the components (SupplyFlowClient) surfaces.
//
// Hides one decision: how a raw flow payload becomes the client-side filtered
// item list + the family facet — including the `data.items` null-safety. Before
// tranche 089 this block was copy-pasted into both clients, which is how the
// same null-guard bug (tranche 088) had to be fixed twice. Callers now get the
// simple path; the filtering rule lives here and cannot re-diverge.
export function useFlowItems(
  data: { items?: FlowItem[] } | null | undefined,
  q: string,
  atRiskOnly: boolean,
): { filteredItems: FlowItem[]; families: string[] } {
  const filteredItems = useMemo<FlowItem[]>(() => {
    if (!data) return [];
    let items = data.items ?? [];
    if (q) {
      items = items.filter(
        (it) =>
          it.item_name.toLowerCase().includes(q) ||
          it.item_id.toLowerCase().includes(q) ||
          (it.family ?? "").toLowerCase().includes(q),
      );
    }
    if (atRiskOnly) {
      items = items.filter((it) => isAtRisk(it.risk_tier));
    }
    return items;
  }, [data, q, atRiskOnly]);

  const families = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    for (const it of data.items ?? []) {
      if (it.family) seen.add(it.family);
    }
    return [...seen].sort();
  }, [data]);

  return { filteredItems, families };
}
