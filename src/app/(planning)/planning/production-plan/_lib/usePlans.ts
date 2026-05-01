"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateProductionPlanRequest,
  CreateProductionPlanResponse,
  ListProductionPlanResponse,
  PatchProductionPlanRequest,
  ProductionPlanRow,
  RecommendationCandidatesResponse,
} from "./types";

export function usePlans(from: string, to: string) {
  return useQuery<ListProductionPlanResponse>({
    queryKey: ["production-plan", from, to],
    queryFn: async () => {
      const res = await fetch(
        `/api/production-plan?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      if (!res.ok) {
        throw new Error("We couldn't load the production plan. Check your connection and try again.");
      }
      return (await res.json()) as ListProductionPlanResponse;
    },
    staleTime: 30_000,
  });
}

function genIdempotencyKey(): string {
  try {
    return (
      (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
        ?.randomUUID?.() ??
      `pp-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
  } catch {
    return `pp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

export function useCreatePlan() {
  const qc = useQueryClient();
  return useMutation<CreateProductionPlanResponse, Error, CreateProductionPlanRequest>({
    mutationFn: async (req) => {
      const res = await fetch("/api/production-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency_key: req.idempotency_key ?? genIdempotencyKey(),
          ...req,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        let detail = "";
        try {
          detail = (JSON.parse(text) as { detail?: string }).detail ?? "";
        } catch {
          /* ignore */
        }
        // Use code-mapped English on every status; backend `detail` strings
        // are typically API-internal — don't surface raw to the operator.
        throw new Error(mapStatusToHebrew(res.status) + (detail && res.status === 422 ? ` (${detail})` : ""));
      }
      return (await res.json()) as CreateProductionPlanResponse;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["production-plan"] });
    },
  });
}

export function usePatchPlan() {
  const qc = useQueryClient();
  return useMutation<
    ProductionPlanRow,
    Error,
    { plan_id: string; body: PatchProductionPlanRequest }
  >({
    mutationFn: async ({ plan_id, body }) => {
      const res = await fetch(
        `/api/production-plan/${encodeURIComponent(plan_id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        let detail = "";
        try {
          detail = (JSON.parse(text) as { detail?: string }).detail ?? "";
        } catch {
          /* ignore */
        }
        throw new Error(mapStatusToHebrew(res.status) + (detail && res.status === 422 ? ` (${detail})` : ""));
      }
      return (await res.json()) as ProductionPlanRow;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["production-plan"] });
    },
  });
}

function mapStatusToHebrew(status: number): string {
  // Function name kept for now; copy is English-only per portal standard.
  if (status === 401) return "You need to sign in again.";
  if (status === 403) return "You don't have permission for this action.";
  if (status === 404) return "Plan not found.";
  if (status === 409) return "This plan is already completed or cancelled and cannot be edited.";
  if (status === 422) return "The data you entered isn't valid. Check the form and try again.";
  if (status === 503) return "The system is locked right now. Try again later.";
  return "Something went wrong. Try again.";
}

// ---------------------------------------------------------------------------
// useRecommendationCandidates — read-only query feeding the "Add from
// Recommendations" picker on /planning/production-plan.
//
// Backend: GET /api/v1/queries/production-plan/recommendation-candidates
// Portal proxy: /api/production-plan/recommendation-candidates
// W1 contract: docs/recommendation_candidates_endpoint_checkpoint.md §6.
//
// Filter semantics (W1-enforced; client only passes the params through):
//   - recommendation_type='production' AND recommendation_status='approved'
//   - planning_runs.status='completed'
//   - NOT linked to any production_plan row via source_recommendation_id
//
// Role gate (W1-enforced): planner + admin only. Operator + viewer get 403.
// `enabled` guard lets the page suppress the query for roles that can't act.
// ---------------------------------------------------------------------------
export function useRecommendationCandidates(
  opts: { date?: string; itemId?: string; page?: number; pageSize?: number; enabled?: boolean },
) {
  const { date, itemId, page, pageSize, enabled = true } = opts;
  return useQuery<RecommendationCandidatesResponse>({
    queryKey: [
      "production-plan",
      "recommendation-candidates",
      date ?? null,
      itemId ?? null,
      page ?? 1,
      pageSize ?? 50,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (date) params.set("date", date);
      if (itemId) params.set("item_id", itemId);
      if (page !== undefined) params.set("page", String(page));
      if (pageSize !== undefined) params.set("page_size", String(pageSize));
      const qs = params.toString();
      const res = await fetch(
        `/api/production-plan/recommendation-candidates${qs ? `?${qs}` : ""}`,
      );
      if (!res.ok) {
        // 401/403/422 etc. surface as a generic English message per portal
        // standard; component-level mapping can refine if needed.
        throw new Error(
          "We couldn't load production recommendations. Try again in a moment.",
        );
      }
      return (await res.json()) as RecommendationCandidatesResponse;
    },
    staleTime: 30_000,
    enabled,
  });
}
