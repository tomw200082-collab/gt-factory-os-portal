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

      <Suspense fallback={<div className="text-xs text-fg-muted">Loading…</div>}>
        <ProductionSimulatorShell />
      </Suspense>
    </>
  );
}
