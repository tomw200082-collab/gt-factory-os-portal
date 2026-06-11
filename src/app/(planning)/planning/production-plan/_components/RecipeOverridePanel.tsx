"use client";

// RecipeOverridePanel — Tranche 052, the "improvised liquid recipe" editor.
//
// Edits the LIQUID side of a single production plan's recipe (per-output-unit
// quantities). Packaging always consumes per the standard BOM and never
// appears here. Saving PUTs the FULL replacement liquid set; a working set
// numerically identical to the standard recipe is saved as lines:[] so the
// plan reverts to the standard BOM instead of storing a no-op override.
//
// Layout: bottom-sheet on mobile / centered modal on desktop, following the
// page's established `items-end sm:items-center` modal pattern.

import { useEffect, useMemo, useState } from "react";
import {
  FlaskConical,
  History,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { SearchableSelect } from "@/components/fields/SearchableSelect";
import {
  availabilityTier,
  buildPutLines,
  computeLineTotal,
  fmtComputedQty,
  isSameAsStandard,
  lineDiffStatus,
  standardWorkingLines,
  toWorkingLines,
  trimQtyText,
  validateWorkingSet,
  type AvailabilityTier,
  type WorkingRecipeLine,
} from "../_lib/recipe-helpers";
import {
  recipeErrorMessage,
  useLastOverride,
  usePlanRecipe,
  useRecipeComponents,
  useSavePlanRecipe,
} from "../_lib/useRecipe";

// ---------------------------------------------------------------------------
// Availability chip — green enough / amber tight / red short vs the run total.
// ---------------------------------------------------------------------------
const TIER_STYLE: Record<AvailabilityTier, string> = {
  ok: "chip-success",
  tight: "chip-warning",
  short: "chip-danger",
  unknown: "text-fg-faint",
};
const TIER_LABEL: Record<AvailabilityTier, string> = {
  ok: "Enough",
  tight: "Tight",
  short: "Short",
  unknown: "—",
};

function AvailabilityChip({
  line,
  total,
}: {
  line: WorkingRecipeLine;
  total: number | null;
}) {
  const tier = availabilityTier(line.available_qty, total);
  const onHand =
    line.available_qty !== null ? trimQtyText(line.available_qty) : null;
  return (
    <span
      className={cn("chip gap-1 text-[10px] whitespace-nowrap", TIER_STYLE[tier])}
      title={
        onHand !== null
          ? `${onHand} ${line.uom} on hand · ${total !== null ? `${fmtComputedQty(total)} ${line.uom} needed for this run` : "enter a quantity to compare"}`
          : "On-hand balance unknown until the recipe is saved"
      }
      data-testid="recipe-line-availability"
      data-tier={tier}
    >
      {TIER_LABEL[tier]}
      {onHand !== null && tier !== "unknown" ? (
        <span className="font-mono tabular-nums">{onHand}</span>
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------
export function RecipeOverridePanel({
  planId,
  onClose,
  onSaved,
}: {
  planId: string;
  onClose: () => void;
  /** Called with a toast-ready success message after a save lands. */
  onSaved: (message: string) => void;
}) {
  const recipeQuery = usePlanRecipe(planId);
  const recipe = recipeQuery.data ?? null;
  const lastQuery = useLastOverride(recipe?.item_id ?? null);
  const componentsQuery = useRecipeComponents({ enabled: recipe !== null });
  const saveMut = useSavePlanRecipe();

  // Working set — seeded once from the GET response.
  const [working, setWorking] = useState<WorkingRecipeLine[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [addValue, setAddValue] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (recipe && working === null) {
      setWorking(toWorkingLines(recipe));
    }
  }, [recipe, working]);

  const standard = useMemo(
    () => (recipe ? standardWorkingLines(recipe) : []),
    [recipe],
  );

  // Standard components currently absent from the working set — rendered
  // struck-through with a restore affordance.
  const removedStandard = useMemo(() => {
    if (!working) return [];
    const present = new Set(working.map((l) => l.component_id));
    return standard.filter((s) => !present.has(s.component_id));
  }, [standard, working]);

  const validation = useMemo(
    () => (working ? validateWorkingSet(working) : { ok: false, problem: null }),
    [working],
  );
  const sameAsStandard = useMemo(
    () => (working ? isSameAsStandard(working, standard) : false),
    [working, standard],
  );

  const editable =
    recipe !== null && !["completed", "cancelled"].includes(recipe.status);

  // ---- mutations on the working set --------------------------------------
  function patchWorking(fn: (prev: WorkingRecipeLine[]) => WorkingRecipeLine[]) {
    setWorking((prev) => (prev ? fn(prev) : prev));
    setDirty(true);
    setSaveError(null);
  }

  function updateQty(componentId: string, qty: string) {
    patchWorking((prev) =>
      prev.map((l) => (l.component_id === componentId ? { ...l, qty } : l)),
    );
  }

  function updateUom(componentId: string, uom: string) {
    patchWorking((prev) =>
      prev.map((l) => (l.component_id === componentId ? { ...l, uom } : l)),
    );
  }

  function removeLine(componentId: string) {
    setConfirmRemoveId(null);
    patchWorking((prev) => prev.filter((l) => l.component_id !== componentId));
  }

  function restoreLine(std: WorkingRecipeLine) {
    patchWorking((prev) => [...prev, { ...std }]);
  }

  function addComponent(componentId: string) {
    setAddValue("");
    if (!componentId) return;
    const comp = (componentsQuery.data ?? []).find(
      (c) => c.component_id === componentId,
    );
    if (!comp) return;
    const std = standard.find((s) => s.component_id === componentId);
    patchWorking((prev) => {
      if (prev.some((l) => l.component_id === componentId)) return prev;
      return [
        ...prev,
        std
          ? { ...std } // re-adding a removed standard component = restore
          : {
              component_id: comp.component_id,
              component_name: comp.component_name,
              qty: "",
              uom: comp.bom_uom ?? comp.inventory_uom ?? "",
              available_qty: null,
              standard_qty_per_unit: null,
              in_standard: false,
            },
      ];
    });
  }

  function loadLastImprovisation() {
    const last = lastQuery.data?.override;
    if (!last) return;
    const stdById = new Map(standard.map((s) => [s.component_id, s]));
    const effectiveById = new Map(
      (recipe?.liquid_lines ?? []).map((l) => [l.component_id, l]),
    );
    patchWorking(() =>
      last.lines.map((l) => {
        const std = stdById.get(l.component_id) ?? null;
        const eff = effectiveById.get(l.component_id) ?? null;
        return {
          component_id: l.component_id,
          component_name: l.component_name ?? std?.component_name ?? null,
          qty: trimQtyText(l.qty_per_output_unit),
          uom: l.uom,
          available_qty: eff?.available_qty ?? std?.available_qty ?? null,
          standard_qty_per_unit: std?.standard_qty_per_unit ?? null,
          in_standard: std !== null,
        };
      }),
    );
  }

  function resetToStandard() {
    patchWorking(() => standard.map((s) => ({ ...s })));
  }

  function handleSave() {
    if (!recipe || !working) return;
    setSaveError(null);
    // A working set identical to the standard recipe clears the override —
    // the plan reverts to the standard BOM (no no-op override rows).
    const clearing = sameAsStandard;
    if (!clearing && !validation.ok) {
      setSaveError(validation.problem);
      return;
    }
    saveMut.mutate(
      {
        plan_id: recipe.plan_id,
        lines: clearing ? [] : buildPutLines(working),
        note: recipe.note ?? null,
      },
      {
        onSuccess: (resp) => {
          onSaved(
            resp.action === "set"
              ? "Custom recipe saved for this run. Packaging stays on the standard BOM."
              : "Recipe reset to standard for this run.",
          );
          onClose();
        },
        onError: (err) => setSaveError(recipeErrorMessage(err)),
      },
    );
  }

  // ---- save-button disabled reason (INTER-012 convention) ----------------
  const saveDisabledReason = saveMut.isPending
    ? "Saving the recipe…"
    : !editable
      ? "This plan is already reported or cancelled"
      : !dirty
        ? "No changes to save yet"
        : !sameAsStandard && !validation.ok
          ? (validation.problem ?? "Fix the highlighted lines first")
          : null;

  const componentOptions = useMemo(() => {
    const present = new Set((working ?? []).map((l) => l.component_id));
    return (componentsQuery.data ?? [])
      .filter((c) => !present.has(c.component_id))
      .map((c) => ({
        value: c.component_id,
        label: c.component_name,
        meta: c.component_class ?? undefined,
      }));
  }, [componentsQuery.data, working]);

  const plannedQtyLabel = recipe
    ? `${trimQtyText(recipe.planned_qty)} ${recipe.uom}`
    : "";

  // ---- non-editable 409 conflicts get an informational body, not a form --
  const conflictReason =
    recipeQuery.error?.status === 409
      ? recipeQuery.error.conflict?.reason_code ?? null
      : null;

  return (
    <div
      dir="ltr"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-2 sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Adjust recipe for this run"
      data-testid="recipe-override-panel"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-t-lg sm:rounded-lg border border-border bg-bg-raised p-5 shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 text-base font-semibold text-fg-strong">
              <FlaskConical className="h-4 w-4 text-accent" strokeWidth={2} />
              Recipe for this run
              {recipe?.customized ? (
                <span className="chip chip-accent text-[10px]">Custom</span>
              ) : null}
            </h2>
            {recipe ? (
              <p className="mt-1 text-3xs text-fg-muted" data-testid="recipe-panel-subtitle">
                <span className="font-medium text-fg">
                  {recipe.item_name ?? recipe.item_id}
                </span>
                {" · planned "}
                <span className="font-mono tabular-nums">{plannedQtyLabel}</span>
                {" — quantities below are per 1 "}
                {recipe.uom}
                {". Applies to this run only; the master recipe is unchanged."}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="btn btn-sm shrink-0"
            onClick={onClose}
            disabled={saveMut.isPending}
            title="Close"
            aria-label="Close"
          >
            <XCircle className="h-3 w-3" strokeWidth={2.5} />
          </button>
        </div>

        {/* Body */}
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {recipeQuery.isLoading || (recipe && working === null) ? (
            <div className="space-y-2" aria-busy="true" aria-live="polite" data-testid="recipe-panel-loading">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 w-full animate-pulse rounded-md bg-bg-subtle" />
              ))}
            </div>
          ) : recipeQuery.isError ? (
            <div
              className="rounded border border-danger/40 bg-danger-softer p-3 text-xs text-danger-fg"
              data-testid="recipe-panel-error"
              data-conflict-reason={conflictReason ?? undefined}
            >
              <div className="font-semibold">
                {conflictReason
                  ? recipeErrorMessage(recipeQuery.error)
                  : "We couldn't load the recipe."}
              </div>
              {!conflictReason ? (
                <button
                  type="button"
                  onClick={() => void recipeQuery.refetch()}
                  className="mt-2 text-3xs font-medium underline hover:no-underline"
                >
                  Try again
                </button>
              ) : null}
            </div>
          ) : recipe && working ? (
            <div className="space-y-4">
              {!editable ? (
                <div className="rounded border border-warning/30 bg-warning-softer/30 px-3 py-2 text-xs text-warning-fg" role="note">
                  This plan is already reported or cancelled — the recipe is shown read-only.
                </div>
              ) : null}

              {/* Liquid lines table */}
              <div className="overflow-x-auto rounded border border-border/60">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border/70 bg-bg-subtle/60">
                      <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        Component
                      </th>
                      <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        Per {recipe.uom}
                      </th>
                      <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        Unit
                      </th>
                      <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        Run total
                      </th>
                      <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        Stock
                      </th>
                      <th className="px-2 py-2" aria-hidden />
                    </tr>
                  </thead>
                  <tbody>
                    {working.map((l) => {
                      const total = computeLineTotal(l.qty, recipe.planned_qty);
                      const diff = lineDiffStatus(l);
                      const confirming = confirmRemoveId === l.component_id;
                      return (
                        <tr
                          key={l.component_id}
                          className="border-b border-border/40 last:border-b-0 even:bg-bg-subtle/30"
                          data-testid="recipe-line-row"
                          data-component-id={l.component_id}
                          data-diff={diff}
                        >
                          <td className="px-3 py-2">
                            <div className="text-fg-strong">
                              {l.component_name ?? l.component_id}
                            </div>
                            {diff === "changed" ? (
                              <span
                                className="chip chip-warning mt-1 text-[10px]"
                                data-testid="recipe-line-changed-chip"
                              >
                                Changed (was {trimQtyText(l.standard_qty_per_unit)})
                              </span>
                            ) : diff === "added" ? (
                              <span
                                className="chip chip-success mt-1 text-[10px]"
                                data-testid="recipe-line-added-chip"
                              >
                                Added
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              inputMode="decimal"
                              step="any"
                              min="0"
                              className="input min-h-[40px] w-24 text-right font-mono tabular-nums"
                              value={l.qty}
                              onChange={(e) => updateQty(l.component_id, e.target.value)}
                              disabled={!editable || saveMut.isPending}
                              aria-label={`Quantity per unit for ${l.component_name ?? l.component_id}`}
                              data-testid="recipe-line-qty"
                            />
                          </td>
                          <td className="px-3 py-2 text-fg-muted">
                            {l.in_standard ? (
                              l.uom
                            ) : (
                              <input
                                className="input min-h-[40px] w-16 font-mono"
                                value={l.uom}
                                onChange={(e) => updateUom(l.component_id, e.target.value)}
                                disabled={!editable || saveMut.isPending}
                                placeholder="UOM"
                                aria-label={`Unit for ${l.component_name ?? l.component_id}`}
                                data-testid="recipe-line-uom"
                              />
                            )}
                          </td>
                          <td
                            className="px-3 py-2 text-right font-mono tabular-nums text-fg"
                            data-testid="recipe-line-total"
                          >
                            {fmtComputedQty(total)}
                            {total !== null ? (
                              <span className="ml-1 text-fg-muted">{l.uom}</span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            <AvailabilityChip line={l} total={total} />
                          </td>
                          <td className="px-2 py-2 text-right whitespace-nowrap">
                            {editable ? (
                              confirming ? (
                                <span className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    className="btn btn-xs btn-danger"
                                    onClick={() => removeLine(l.component_id)}
                                    data-testid="recipe-line-remove-confirm"
                                  >
                                    Remove
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-xs"
                                    onClick={() => setConfirmRemoveId(null)}
                                  >
                                    Keep
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-xs min-h-[32px] min-w-[32px] text-danger"
                                  onClick={() => setConfirmRemoveId(l.component_id)}
                                  disabled={saveMut.isPending}
                                  title={`Remove ${l.component_name ?? l.component_id} from this run's recipe`}
                                  aria-label={`Remove ${l.component_name ?? l.component_id}`}
                                  data-testid="recipe-line-remove"
                                >
                                  <Trash2 className="h-2.5 w-2.5" strokeWidth={2.5} />
                                </button>
                              )
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                    {working.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-4 text-center text-fg-muted">
                          No liquid components on this run. Use “Reset to standard” or add a component below.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              {/* Removed standard lines — struck-through + restore */}
              {removedStandard.length > 0 ? (
                <div data-testid="recipe-removed-section">
                  <div className="mb-1 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Removed from the standard recipe
                  </div>
                  <div className="space-y-1">
                    {removedStandard.map((s) => (
                      <div
                        key={s.component_id}
                        className="flex items-center justify-between gap-2 rounded border border-border/40 bg-bg-subtle/40 px-3 py-1.5 text-xs"
                        data-testid="recipe-removed-row"
                        data-component-id={s.component_id}
                      >
                        <span className="min-w-0 truncate text-fg-muted line-through">
                          {s.component_name ?? s.component_id}{" "}
                          <span className="font-mono tabular-nums">
                            {trimQtyText(s.standard_qty_per_unit)} {s.uom}
                          </span>
                        </span>
                        {editable ? (
                          <button
                            type="button"
                            className="btn btn-xs gap-1 shrink-0"
                            onClick={() => restoreLine(s)}
                            disabled={saveMut.isPending}
                            title="Put this component back at its standard quantity"
                            data-testid="recipe-line-restore"
                          >
                            <Undo2 className="h-2.5 w-2.5" strokeWidth={2.5} />
                            Restore
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Add / swap component */}
              {editable ? (
                <div>
                  <div className="mb-1 flex items-center gap-1 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    <Plus className="h-2.5 w-2.5" strokeWidth={2.5} />
                    Add a component
                  </div>
                  <SearchableSelect
                    value={addValue}
                    onChange={addComponent}
                    options={componentOptions}
                    placeholder="— Search raw materials —"
                    searchPlaceholder="Search by name or class…"
                    emptyMessage="No matching components"
                    loading={componentsQuery.isLoading}
                    disabled={saveMut.isPending}
                    testId="recipe-add-component"
                    ariaLabel="Add a component to this run's recipe"
                  />
                  <p className="mt-1 text-3xs text-fg-faint">
                    Liquid-side materials only — packaging always follows the standard BOM.
                  </p>
                </div>
              ) : null}

              {/* Save error */}
              {saveError ? (
                <div
                  className="rounded border border-danger/40 bg-danger-softer px-3 py-2 text-3xs text-danger-fg"
                  role="alert"
                  data-testid="recipe-save-error"
                >
                  {saveError}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        {recipe && working ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
            <button
              type="button"
              className="btn btn-sm gap-1.5"
              onClick={loadLastImprovisation}
              disabled={
                !editable ||
                saveMut.isPending ||
                lastQuery.isLoading ||
                lastQuery.data?.found !== true
              }
              title={
                lastQuery.isLoading
                  ? "Checking for a previous improvisation…"
                  : lastQuery.data?.found
                    ? `Load the improvisation last used on ${lastQuery.data.override?.plan_date ?? "a previous run"}`
                    : "No previous improvisation saved for this product"
              }
              data-testid="recipe-load-last"
            >
              <History className="h-3 w-3" strokeWidth={2} />
              Load last improvisation
            </button>
            <button
              type="button"
              className="btn btn-sm gap-1.5"
              onClick={resetToStandard}
              disabled={!editable || saveMut.isPending || sameAsStandard}
              title={
                sameAsStandard
                  ? "Already matching the standard recipe"
                  : "Replace all lines with the standard recipe"
              }
              data-testid="recipe-reset-standard"
            >
              <RotateCcw className="h-3 w-3" strokeWidth={2} />
              Reset to standard
            </button>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                className="btn btn-sm"
                onClick={onClose}
                disabled={saveMut.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm gap-1.5"
                onClick={handleSave}
                disabled={saveDisabledReason !== null}
                title={saveDisabledReason ?? undefined}
                data-testid="recipe-save"
              >
                <FlaskConical className="h-3 w-3" strokeWidth={2.5} />
                {saveMut.isPending ? "Saving…" : "Save recipe for this run"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
