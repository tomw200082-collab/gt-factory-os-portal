"use client";

// ---------------------------------------------------------------------------
// useInventoryFlow — TanStack Query hook for /api/inventory/flow.
//
// Cadence: 60s silent refetch (contract §6.5 / amendment §A — 60s plan-locked).
// staleTime: 30s.
// ---------------------------------------------------------------------------

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type {
  FlowItemDetail,
  FlowQueryParams,
  FlowResponse,
} from "./types";

const REFETCH_INTERVAL_MS = 60_000;
const STALE_TIME_MS = 30_000;

function buildQuerystring(params: FlowQueryParams): string {
  const sp = new URLSearchParams();
  if (params.start) sp.set("start", params.start);
  if (params.horizon_weeks != null) sp.set("horizon_weeks", String(params.horizon_weeks));
  if (params.family) sp.set("family", params.family);
  if (params.supply_method) sp.set("supply_method", params.supply_method);
  if (params.at_risk_only) sp.set("at_risk_only", "true");
  return sp.toString();
}

async function fetchFlow(params: FlowQueryParams): Promise<FlowResponse> {
  const qs = buildQuerystring(params);
  const url = qs ? `/api/inventory/flow?${qs}` : "/api/inventory/flow";
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // ignore
    }
    const detail =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : "";
    throw new Error(
      `inventory_flow_${res.status}${detail ? `:${detail}` : ""}`,
    );
  }
  return (await res.json()) as FlowResponse;
}

export function useInventoryFlow(
  params: FlowQueryParams = {},
): UseQueryResult<FlowResponse> {
  return useQuery({
    queryKey: ["inventory-flow", params] as const,
    queryFn: () => fetchFlow(params),
    refetchInterval: REFETCH_INTERVAL_MS,
    staleTime: STALE_TIME_MS,
    retry: false,
  });
}

// ---------------------------------------------------------------------------
// Per-item detail
// ---------------------------------------------------------------------------

async function fetchFlowItem(itemId: string): Promise<FlowItemDetail> {
  const res = await fetch(
    `/api/inventory/flow/item/${encodeURIComponent(itemId)}`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // ignore
    }
    const detail =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : "";
    throw new Error(
      `inventory_flow_item_${res.status}${detail ? `:${detail}` : ""}`,
    );
  }
  return (await res.json()) as FlowItemDetail;
}

export function useInventoryFlowItem(
  itemId: string | null,
): UseQueryResult<FlowItemDetail> {
  return useQuery({
    queryKey: ["inventory-flow-item", itemId] as const,
    queryFn: () => {
      if (!itemId) throw new Error("missing item_id");
      return fetchFlowItem(itemId);
    },
    enabled: Boolean(itemId),
    refetchInterval: REFETCH_INTERVAL_MS,
    staleTime: STALE_TIME_MS,
    retry: false,
  });
}
