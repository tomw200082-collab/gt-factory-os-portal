"use client";

// ---------------------------------------------------------------------------
// useSupplyFlow — TanStack Query hook for /api/inventory/supply-flow
// (Wave 3 of supply-side inventory flow, 2026-05-06).
//
// Mirrors useInventoryFlow.ts shape-for-shape:
//   - 60s silent refetch
//   - 30s staleTime
//   - 24h gcTime
//   - localStorage cache seeding to dodge cold-start latency on first paint
//
// Differences from useInventoryFlow:
//   - Endpoint: /api/inventory/supply-flow
//   - Query key prefix: ["inventory", "supply-flow", params]
//   - persist key prefix: gtfos:supply_flow: (so FG and supply caches
//     never alias even when params happen to JSON-encode identically)
//   - Reuses FlowQueryParams from ../../_lib/types — the supply variant
//     ignores `supply_method` server-side, but the field is harmless on
//     the wire (it's just not forwarded by buildQuerystring below).
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import {
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { FlowQueryParams, FlowResponse } from "../../_lib/types";

const REFETCH_INTERVAL_MS = 60_000;
const STALE_TIME_MS = 30_000;
const GC_TIME_MS = 24 * 60 * 60 * 1000;
const PERSIST_KEY_PREFIX = "gtfos:supply_flow:";

interface PersistedEntry {
  ts: number;
  data: FlowResponse;
}

function persistKey(params: FlowQueryParams): string {
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
    // localStorage may be full / disabled — silently ignore.
  }
}

function buildQuerystring(params: FlowQueryParams): string {
  const sp = new URLSearchParams();
  if (params.start) sp.set("start", params.start);
  if (params.horizon_weeks != null) {
    sp.set("horizon_weeks", String(params.horizon_weeks));
  }
  if (params.family) sp.set("family", params.family);
  // Note: supply_method is intentionally NOT forwarded — the supply
  // endpoint has no such filter.
  if (params.at_risk_only) sp.set("at_risk_only", "true");
  // Groups v1 (Tranche 044): supply-side group filters.
  if (params.material_group) sp.set("material_group", params.material_group);
  if (params.used_by_product_group) {
    sp.set("used_by_product_group", params.used_by_product_group);
  }
  return sp.toString();
}

async function fetchSupplyFlow(
  params: FlowQueryParams,
): Promise<FlowResponse> {
  const qs = buildQuerystring(params);
  const url = qs
    ? `/api/inventory/supply-flow?${qs}`
    : "/api/inventory/supply-flow";
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
      `supply_flow_${res.status}${detail ? `:${detail}` : ""}`,
    );
  }
  return (await res.json()) as FlowResponse;
}

export function useSupplyFlow(
  params: FlowQueryParams = {},
): UseQueryResult<FlowResponse> {
  const queryClient = useQueryClient();
  const seededRef = useRef(false);

  if (!seededRef.current && typeof window !== "undefined") {
    const persisted = readPersisted(params);
    if (persisted) {
      const existing = queryClient.getQueryData<FlowResponse>([
        "inventory",
        "supply-flow",
        params,
      ]);
      if (!existing) {
        queryClient.setQueryData(
          ["inventory", "supply-flow", params],
          persisted,
        );
      }
    }
    seededRef.current = true;
  }

  const result = useQuery({
    queryKey: ["inventory", "supply-flow", params] as const,
    queryFn: () => fetchSupplyFlow(params),
    refetchInterval: REFETCH_INTERVAL_MS,
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
    retry: false,
  });

  useEffect(() => {
    if (result.data && result.isSuccess) {
      writePersisted(params, result.data);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.data, result.isSuccess]);

  return result;
}
