"use client";

// ---------------------------------------------------------------------------
// /planning/production-simulation — Production Simulation.
//
// Pick a finished product and a target quantity; the page combines its PACK
// recipe and (when linked) its BASE recipe and shows exactly how much of
// every ingredient and packaging component the run needs, in the recipe's
// exact ratios, with on-hand stock coverage.
//
// All data is read live from the API (/api/boms/heads, /api/items,
// /api/boms/heads/:id/simulate, /net-requirements). The page is a what-if
// surface only — it never writes inventory and is not the production
// planning source of truth. The nav entry is admin-gated; the URL stays
// reachable for planners and dev.
// ---------------------------------------------------------------------------

import { Suspense } from "react";
import { Info } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { ProductionSimulatorShell } from "./_components/ProductionSimulatorShell";

export default function ProductionSimulationPage() {
  return (
    <>
      <WorkflowHeader
        eyebrow="Planner workspace"
        title="Production simulation"
        description="Pick a finished product and a target quantity. The page breaks the run down into every ingredient and packaging component you would need — in exact recipe ratios — and checks it against on-hand stock."
      />

      <div
        role="note"
        data-testid="production-simulation-containment-banner"
        className="flex items-center gap-2 rounded-md border border-border/60 bg-bg-subtle/50 px-3.5 py-2.5 text-xs text-fg-muted"
      >
        <Info className="h-4 w-4 shrink-0 text-fg-faint" strokeWidth={2} aria-hidden />
        <span>
          <span className="font-semibold text-fg-strong">
            What-if preview.
          </span>{" "}
          This does not change inventory and is not the production planning
          source of truth.
        </span>
      </div>

      <Suspense
        fallback={
          <div className="mt-5 text-sm text-fg-muted">Loading…</div>
        }
      >
        <ProductionSimulatorShell />
      </Suspense>
    </>
  );
}
