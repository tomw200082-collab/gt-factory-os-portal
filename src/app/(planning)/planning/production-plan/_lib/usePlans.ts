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
        throw new Error("לא ניתן לטעון את תכנון הייצור. בדוק את החיבור ונסה שוב.");
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
        throw new Error(detail || mapStatusToHebrew(res.status));
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
        throw new Error(detail || mapStatusToHebrew(res.status));
      }
      return (await res.json()) as ProductionPlanRow;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["production-plan"] });
    },
  });
}

function mapStatusToHebrew(status: number): string {
  if (status === 401) return "נדרש להתחבר מחדש למערכת.";
  if (status === 403) return "אין הרשאה לבצע פעולה זו.";
  if (status === 404) return "התכנון לא נמצא.";
  if (status === 409) return "התכנון כבר בוצע או בוטל ולא ניתן לערוך אותו.";
  if (status === 422) return "הנתונים שהוזנו אינם תקינים. בדוק את הטופס ונסה שוב.";
  if (status === 503) return "המערכת בנעילה כרגע. נסה מאוחר יותר.";
  return "אירעה שגיאה. נסה שוב.";
}
