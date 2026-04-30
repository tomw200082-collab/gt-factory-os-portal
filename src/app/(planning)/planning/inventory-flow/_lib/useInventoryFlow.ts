"use client";

// ---------------------------------------------------------------------------
// useInventoryFlow — TanStack Query hook for /api/inventory/flow.
//
// Cadence: 60s silent refetch (contract §6.5 / amendment §A — 60s plan-locked).
// staleTime: 30s.
//
// Performance / first-load UX:
//   The upstream SQL projection takes ~22s on cold runs (per the API proxy
//   note in src/app/api/inventory/flow/route.ts). To keep navigation snappy
//   we (a) keep query data in cache for 24h instead of the default 5min so
//   nav-away/nav-back doesn't trigger a fresh 22s wait, and (b) seed the
//   cache from localStorage on mount so the FIRST page render (after a hard
//   refresh) shows the previous response instantly while a fresh refetch
//   runs in the background. The persistence is a tiny 30-line implementation
//   that avoids pulling in @tanstack/query-persist-client.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import type {
  FlowItemDetail,
  FlowQueryParams,
  FlowResponse,
} from "./types";

const REFETCH_INTERVAL_MS = 60_000;
const STALE_TIME_MS = 30_000;
// Keep cached data for 24h so navigating away and back doesn't trigger
// a fresh 22s SQL run. The 60s background refetch will keep the data fresh
// while the user is on the page; nav-away just suspends the timer.
const GC_TIME_MS = 24 * 60 * 60 * 1000;
const PERSIST_KEY_PREFIX = "gtfos:inv_flow:";

interface PersistedEntry {
  ts: number;
  data: FlowResponse;
}

function persistKey(params: FlowQueryParams): string {
  // Stable key — order-independent JSON serialization.
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(params).sort()) {
    sorted[k] = (params as Record<string, unknown>)[k];
  }
  return PERSIST_KEY_PREFIX + JSON.stringify(sorted);
}

function readPersisted(params: FlowQueryParams): FlowResponse | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(persistKey(params));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as PersistedEntry;
    // Drop entries older than GC_TIME_MS — should never happen since we
    // overwrite on every successful fetch, but defensive.
    if (Date.now() - parsed.ts > GC_TIME_MS) return undefined;
    return parsed.data;
  } catch {
    return undefined;
  }
}

function writePersisted(params: FlowQueryParams, data: FlowResponse): void {
  if (typeof window === "undefined") return;
  try {
    const entry: PersistedEntry = { ts: Date.now(), data };
    window.localStorage.setItem(persistKey(params), JSON.stringify(entry));
  } catch {
    // localStorage may be full / disabled; quietly ignore — TanStack Query
    // still works without the persistence layer, just slower on first load.
  }
}

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
  const queryClient = useQueryClient();
  const seededRef = useRef(false);

  // Seed the cache from localStorage on first mount per (params) variant.
  // Has to happen via queryClient.setQueryData so the next useQuery call
  // observes the data synchronously (initialData would also work but we
  // want this to apply globally across hook instances with the same key).
  if (!seededRef.current && typeof window !== "undefined") {
    const persisted = readPersisted(params);
    if (persisted) {
      const existing = queryClient.getQueryData<FlowResponse>([
        "inventory-flow",
        params,
      ]);
      if (!existing) {
        queryClient.setQueryData(["inventory-flow", params], persisted);
      }
    }
    seededRef.current = true;
  }

  const result = useQuery({
    queryKey: ["inventory-flow", params] as const,
    queryFn: () => fetchFlow(params),
    refetchInterval: REFETCH_INTERVAL_MS,
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
    retry: false,
  });

  // Persist on every successful fetch so the next hard-refresh has a warm
  // cache. Effect runs only when new data lands; reads are cheap.
  useEffect(() => {
    if (result.data && result.isSuccess) {
      writePersisted(params, result.data);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.data, result.isSuccess]);

  return result;
}

/**
 * Background prefetch hook. Call from /dashboard or other entry surfaces to
 * warm the cache so when the user clicks "Inventory Flow" the page renders
 * instantly. Idempotent — safe to call repeatedly; TanStack Query
 * dedupes in-flight requests.
 */
export function usePrefetchInventoryFlow(
  params: FlowQueryParams = {},
): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    void queryClient.prefetchQuery({
      queryKey: ["inventory-flow", params] as const,
      queryFn: () => fetchFlow(params),
      staleTime: STALE_TIME_MS,
      gcTime: GC_TIME_MS,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
