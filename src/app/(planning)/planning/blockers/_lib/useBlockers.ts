"use client";

// ---------------------------------------------------------------------------
// useBlockers — TanStack Query hook for /planning/blockers
//
// queryKey: ['blockers', run_id, severity[], category[], item_id, page, page_size]
// staleTime: 60_000 ms
// retry: false (we render error state honestly per Tom's no-mock-data rule)
// ---------------------------------------------------------------------------

import { useQuery } from "@tanstack/react-query";
import type {
  BlockerCategory,
  BlockerSeverity,
  BlockersResponse,
} from "./types";

export interface BlockersFilters {
  run_id?: string;
  severity?: BlockerSeverity[];
  category?: BlockerCategory[];
  item_id?: string;
  page?: number;
  page_size?: number;
}

export interface BlockersResult {
  data: BlockersResponse | null;
  notFound: boolean; // 404 RUN_NOT_FOUND
  unauthorized: boolean; // 401
  error: string | null;
}

function buildQs(filters: BlockersFilters): string {
  const sp = new URLSearchParams();
  if (filters.run_id) sp.set("run_id", filters.run_id);
  for (const s of filters.severity ?? []) sp.append("severity", s);
  for (const c of filters.category ?? []) sp.append("category", c);
  if (filters.item_id && filters.item_id.trim() !== "")
    sp.set("item_id", filters.item_id.trim());
  if (filters.page !== undefined) sp.set("page", String(filters.page));
  if (filters.page_size !== undefined)
    sp.set("page_size", String(filters.page_size));
  const s = sp.toString();
  return s.length > 0 ? `?${s}` : "";
}

async function fetchBlockers(filters: BlockersFilters): Promise<BlockersResult> {
  const url = `/api/planning/blockers${buildQs(filters)}`;
  let res: Response;
  try {
    res = await fetch(url, { method: "GET" });
  } catch {
    return {
      data: null,
      notFound: false,
      unauthorized: false,
      error: "לא ניתן לטעון את החסמים. בדוק את החיבור ונסה שוב.",
    };
  }

  if (res.status === 401) {
    return {
      data: null,
      notFound: false,
      unauthorized: true,
      error: null,
    };
  }
  if (res.status === 404) {
    return {
      data: null,
      notFound: true,
      unauthorized: false,
      error: null,
    };
  }
  if (!res.ok) {
    return {
      data: null,
      notFound: false,
      unauthorized: false,
      error: "לא ניתן לטעון את החסמים. בדוק את החיבור ונסה שוב.",
    };
  }
  let json: BlockersResponse;
  try {
    json = (await res.json()) as BlockersResponse;
  } catch {
    return {
      data: null,
      notFound: false,
      unauthorized: false,
      error: "לא ניתן לטעון את החסמים. בדוק את החיבור ונסה שוב.",
    };
  }
  return { data: json, notFound: false, unauthorized: false, error: null };
}

export function useBlockers(filters: BlockersFilters) {
  return useQuery({
    queryKey: [
      "blockers",
      filters.run_id ?? null,
      [...(filters.severity ?? [])].sort(),
      [...(filters.category ?? [])].sort(),
      filters.item_id ?? null,
      filters.page ?? 1,
      filters.page_size ?? 50,
    ],
    queryFn: () => fetchBlockers(filters),
    staleTime: 60_000,
    retry: false,
  });
}
