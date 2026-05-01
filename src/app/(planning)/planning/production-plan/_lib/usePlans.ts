"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateProductionPlanRequest,
  CreateProductionPlanResponse,
  ListProductionPlanResponse,
  PatchProductionPlanRequest,
  ProductionPlanRow,
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
