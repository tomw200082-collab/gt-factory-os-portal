"use client";

// Tranche 052 — TanStack Query hooks for the per-plan recipe override
// ("improvised liquid recipe"). Backend contract: recipe-types.ts.
//
// Cache design — the plan-list reads DTO does NOT carry an override flag, and
// fetching the recipe per card would be too heavy. The card badge therefore
// reads a tiny boolean query (planRecipeFlagKey) that is:
//   (a) written client-side by the save/clear mutations (immediate), and
//   (b) lazily populated by a GET when the card's BOM-impact panel opens.
// Cards that never opened the panel and never saved show no badge — honest
// lazy state, no per-card fan-out.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type {
  LastOverrideResponse,
  PlanRecipeConflictResponse,
  PlanRecipeResponse,
  PutPlanRecipeRequest,
  PutPlanRecipeResponse,
} from "./recipe-types";

export function planRecipeKey(planId: string): unknown[] {
  return ["plan-recipe", planId];
}

export function planRecipeFlagKey(planId: string): unknown[] {
  return ["plan-recipe-flag", planId];
}

// ---------------------------------------------------------------------------
// RecipeFetchError — carries the 409 conflict body so the panel can render
// reason-specific copy (NO_LIQUID_RECIPE vs PLAN_NOT_EDITABLE etc.).
// ---------------------------------------------------------------------------
export class RecipeFetchError extends Error {
  status: number;
  conflict: PlanRecipeConflictResponse | null;
  constructor(
    status: number,
    conflict: PlanRecipeConflictResponse | null,
    message: string,
  ) {
    super(message);
    this.name = "RecipeFetchError";
    this.status = status;
    this.conflict = conflict;
  }
}

async function readConflict(
  res: Response,
): Promise<PlanRecipeConflictResponse | null> {
  try {
    const body = (await res.json()) as Partial<PlanRecipeConflictResponse>;
    if (body && typeof body.reason_code === "string") {
      return body as PlanRecipeConflictResponse;
    }
  } catch {
    /* not JSON */
  }
  return null;
}

export function recipeErrorMessage(err: unknown): string {
  if (err instanceof RecipeFetchError && err.conflict) {
    switch (err.conflict.reason_code) {
      case "PLAN_NOT_EDITABLE":
        return "This plan is already reported or cancelled — its recipe can no longer be adjusted.";
      case "ITEM_NOT_MANUFACTURED":
        return "Recipe adjustments are only available for manufactured products.";
      case "NO_LIQUID_RECIPE":
        return "This product has no liquid recipe to adjust.";
      case "COMPONENT_IS_PACKAGING":
        return "Packaging components can't enter the liquid recipe. Packaging always follows the standard BOM.";
      case "DUPLICATE_COMPONENT":
        return "A component appears more than once. Remove the duplicate and try again.";
      case "UOM_UNKNOWN":
        return "One of the units isn't recognized. Check the unit fields and try again.";
      case "PLAN_NOT_FOUND":
        return "This plan no longer exists. Refresh the board and try again.";
      case "PLAN_IS_NOTE":
        return "Notes don't have a recipe.";
      default:
        return "The recipe could not be saved. Refresh and try again.";
    }
  }
  if (err instanceof RecipeFetchError) {
    if (err.status === 401) return "You need to sign in again.";
    if (err.status === 403)
      return "You don't have permission to adjust recipes.";
    if (err.status === 503)
      return "The system is locked right now (read-only mode). Try again later.";
    return "Something went wrong. Try again.";
  }
  return err instanceof Error ? err.message : "Something went wrong. Try again.";
}

// ---------------------------------------------------------------------------
// GET /api/production-plan/[plan_id]/recipe
// ---------------------------------------------------------------------------
async function fetchPlanRecipe(planId: string): Promise<PlanRecipeResponse> {
  let res: Response;
  try {
    res = await fetch(
      `/api/production-plan/${encodeURIComponent(planId)}/recipe`,
    );
  } catch {
    throw new RecipeFetchError(
      0,
      null,
      "We couldn't reach the server. Check your connection.",
    );
  }
  if (!res.ok) {
    const conflict = res.status === 409 ? await readConflict(res) : null;
    throw new RecipeFetchError(
      res.status,
      conflict,
      `Could not load the recipe (HTTP ${res.status}).`,
    );
  }
  return (await res.json()) as PlanRecipeResponse;
}

export function usePlanRecipe(planId: string | null) {
  return useQuery<PlanRecipeResponse, RecipeFetchError>({
    queryKey: planRecipeKey(planId ?? "none"),
    queryFn: () => fetchPlanRecipe(planId as string),
    enabled: planId !== null,
    staleTime: 30_000,
    retry: (failureCount, err) =>
      err.status >= 500 || err.status === 0 ? failureCount < 2 : false,
  });
}

// ---------------------------------------------------------------------------
// Card-badge flag query — see cache-design note at the top of this file.
// Treats 409 (note rows, non-manufactured, no liquid recipe) as "not
// customized" rather than an error: the badge simply never shows.
// ---------------------------------------------------------------------------
export function usePlanRecipeFlag(
  planId: string,
  opts: { enabled: boolean },
): boolean | undefined {
  const query = useQuery<boolean>({
    queryKey: planRecipeFlagKey(planId),
    queryFn: async () => {
      try {
        const recipe = await fetchPlanRecipe(planId);
        return recipe.customized;
      } catch (err) {
        if (err instanceof RecipeFetchError && err.status === 409) return false;
        throw err;
      }
    },
    enabled: opts.enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return query.data;
}

/** Mutation-side cache write so the badge updates without a refetch. */
export function setPlanRecipeFlag(
  qc: QueryClient,
  planId: string,
  customized: boolean,
): void {
  qc.setQueryData(planRecipeFlagKey(planId), customized);
}

// ---------------------------------------------------------------------------
// PUT (save / clear) — body carries the idempotency envelope, matching the
// repo convention used by useCreatePlan (key in the JSON body, generated
// client-side per attempt).
// ---------------------------------------------------------------------------
function genIdempotencyKey(): string {
  try {
    return (
      (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
        ?.randomUUID?.() ??
      `ppr-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
  } catch {
    return `ppr-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

export function useSavePlanRecipe() {
  const qc = useQueryClient();
  return useMutation<
    PutPlanRecipeResponse,
    RecipeFetchError,
    { plan_id: string; lines: PutPlanRecipeRequest["lines"]; note?: string | null }
  >({
    mutationFn: async ({ plan_id, lines, note }) => {
      let res: Response;
      try {
        res = await fetch(
          `/api/production-plan/${encodeURIComponent(plan_id)}/recipe`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              idempotency_key: genIdempotencyKey(),
              lines,
              ...(note !== undefined ? { note } : {}),
            } satisfies PutPlanRecipeRequest),
          },
        );
      } catch {
        throw new RecipeFetchError(
          0,
          null,
          "We couldn't reach the server. Check your connection.",
        );
      }
      if (!res.ok) {
        const conflict = res.status === 409 ? await readConflict(res) : null;
        throw new RecipeFetchError(
          res.status,
          conflict,
          `Could not save the recipe (HTTP ${res.status}).`,
        );
      }
      return (await res.json()) as PutPlanRecipeResponse;
    },
    onSuccess: (data, vars) => {
      setPlanRecipeFlag(qc, vars.plan_id, data.action === "set");
      void qc.invalidateQueries({ queryKey: planRecipeKey(vars.plan_id) });
      // FLOW-023 — a saved/cleared recipe changes the per-plan material
      // breakdown the card's BOM-impact panel shows (keyed
      // ["bom-impact", itemId, planId]). Without this it keeps rendering the
      // pre-save consumption. Scoped to this plan so other cards don't refetch.
      void qc.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === "bom-impact" && q.queryKey[2] === vars.plan_id,
      });
    },
  });
}

// ---------------------------------------------------------------------------
// GET /api/production-plan/recipe-overrides/last?item_id=
// ---------------------------------------------------------------------------
export function useLastOverride(itemId: string | null) {
  return useQuery<LastOverrideResponse>({
    queryKey: ["plan-recipe-last-override", itemId],
    queryFn: async () => {
      const res = await fetch(
        `/api/production-plan/recipe-overrides/last?item_id=${encodeURIComponent(itemId as string)}`,
      );
      if (!res.ok) {
        throw new Error(
          "We couldn't check for a previous improvisation. Try again in a moment.",
        );
      }
      return (await res.json()) as LastOverrideResponse;
    },
    enabled: itemId !== null,
    staleTime: 60_000,
    retry: 1,
  });
}

// ---------------------------------------------------------------------------
// RM components for the swap/add picker — packaging-side classes excluded
// (the server enforces this with 409 COMPONENT_IS_PACKAGING; the filter just
// keeps packaging out of the picker entirely).
// ---------------------------------------------------------------------------
export interface RecipeComponentOption {
  component_id: string;
  component_name: string;
  component_class: string | null;
  bom_uom: string | null;
  inventory_uom: string | null;
}

export function isPackagingClass(componentClass: string | null): boolean {
  return componentClass !== null && componentClass.startsWith("PACKAGING");
}

export function useRecipeComponents(opts: { enabled: boolean }) {
  return useQuery<RecipeComponentOption[]>({
    queryKey: ["plan-recipe", "rm-components"],
    queryFn: async () => {
      const res = await fetch("/api/components?status=ACTIVE&limit=1000");
      if (!res.ok) throw new Error("Could not load components.");
      const body = (await res.json()) as {
        rows: Array<RecipeComponentOption & Record<string, unknown>>;
      };
      return (body.rows ?? [])
        .filter((c) => !isPackagingClass(c.component_class))
        .map((c) => ({
          component_id: c.component_id,
          component_name: c.component_name,
          component_class: c.component_class,
          bom_uom: c.bom_uom,
          inventory_uom: c.inventory_uom,
        }))
        .sort((a, b) => a.component_name.localeCompare(b.component_name));
    },
    enabled: opts.enabled,
    staleTime: 5 * 60 * 1000,
  });
}
