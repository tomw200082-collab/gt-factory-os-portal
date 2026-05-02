"use client";

// ---------------------------------------------------------------------------
// /planning/production-simulation — Production Simulation page.
//
// Picks a MANUFACTURED / REPACK item that has at least one BOM head linked
// (PACK and/or BASE), accepts a target output quantity, and computes the
// combined component requirements:
//
//   PACK lines: required = T × final_component_qty
//   BASE lines: required = T × item.base_fill_qty_per_unit × qty_per_l_output
//
// The page intentionally fetches everything client-side from the IDB-backed
// repos used by the rest of the planner sandbox; nothing here calls the API.
//
// AUDIT 2026-05-01 §16 #9 (P0): this page is IDB-backed and may silently
// disagree with live database state. Cycle 11 added a BETA banner; cycle 16
// supersedes that with the dispatch-locked containment copy and gates the
// nav entry to admin per W4 cycle 6 spec PSDP-3 default (ii). Full backend
// wiring is still queued as a separate W4 contract → W1 backend → W2
// portal sequence (out of scope). Page is intentionally NOT removed —
// admin / dev access via direct URL preserved.
// ---------------------------------------------------------------------------

import { Suspense } from "react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { ProductionSimulatorShell } from "./_components/ProductionSimulatorShell";

export default function ProductionSimulationPage() {
  return (
    <>
      <WorkflowHeader
        eyebrow="Planner workspace"
        title="Production simulation"
        description="Pick a finished product and a target quantity. We combine its BASE recipe and PACK recipe and show how much of every component you would need."
      />

      {/* Cycle 16 — containment banner per dispatch (W4 cycle 6 spec
          production_simulation_runtime_decision_pack.md §5 default A+B
          accepted; banner copy verbatim from cycle-16 dispatch). Body
          logic untouched — IDB-backed simulator below this banner is
          preserved verbatim. The banner is non-dismissible by design:
          it must remain visible whenever the page is open, since the
          underlying data discrepancy cannot be detected from the page
          itself. Pairs with the Mode B-Planning-Corridor cycle-16 nav
          gate at src/lib/nav/manifest.ts (Production Simulation entry
          set to min_role:'admin' per PSDP-3 default (ii) so daily
          planners no longer see this surface in the sidebar; admin /
          dev access via direct URL is preserved). */}
      <div
        role="alert"
        aria-live="polite"
        data-testid="production-simulation-containment-banner"
        className="mt-3 rounded border border-warning/40 bg-warning-softer/40 p-3 text-sm text-warning-fg flex items-start gap-2"
      >
        <span aria-hidden="true" className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-warning/60 text-3xs font-bold">i</span>
        <span>
          <span className="font-semibold">Simulation preview only — </span>
          this does not change inventory and is not the production planning source of truth.
        </span>
      </div>

      <Suspense fallback={<div className="text-xs text-fg-muted">Loading…</div>}>
        <ProductionSimulatorShell />
      </Suspense>
    </>
  );
}
