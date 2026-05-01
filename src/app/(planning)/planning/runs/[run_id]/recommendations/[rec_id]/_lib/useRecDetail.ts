"use client";

// ---------------------------------------------------------------------------
// useRecDetail — TanStack Query hook for recommendation drill-down
//
// queryKey: ['rec-detail', rec_id]
// staleTime: 60_000 ms
// ---------------------------------------------------------------------------

import { useQuery } from "@tanstack/react-query";
import type { RecommendationDetailResponse } from "./types";

interface RecDetailResult {
  data: RecommendationDetailResponse | null;
  notFound: boolean;
  error: string | null;
}

async function fetchRecDetail(recId: string): Promise<RecDetailResult> {
  const res = await fetch(
    `/api/planning/recommendations/${encodeURIComponent(recId)}/detail`,
    { method: "GET" },
  );

  if (res.status === 404) {
    return { data: null, notFound: true, error: null };
  }
  if (!res.ok) {
    return {
      data: null,
      notFound: false,
      error: "Could not load recommendation details. Check your connection and try again.",
    };
  }

  const json = (await res.json()) as RecommendationDetailResponse;
  return { data: json, notFound: false, error: null };
}

export function useRecDetail(recId: string) {
  return useQuery({
    queryKey: ["rec-detail", recId],
    queryFn: () => fetchRecDetail(recId),
    staleTime: 60_000,
    enabled: !!recId,
  });
}
