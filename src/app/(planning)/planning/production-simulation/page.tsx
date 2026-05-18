"use client";

// ---------------------------------------------------------------------------
// /planning/production-simulation — Production Simulation.
//
// Two modes, picked at the top of the page:
//
//   • Single product — pick one finished product and a target quantity; the
//     page combines its PACK and (when linked) BASE recipe and shows how much
//     of every component the run needs, in exact recipe ratios.
//
//   • Date range plan — pick a date range; the page pulls every planned
//     production job in that window from the daily production plan, explodes
//     each recipe, aggregates the component demand, nets it against on-hand
//     stock, and shows what to buy — grouped by supplier or by product, with
//     the date each component is first needed.
//
// All data is read live from the API. The page is a what-if surface only — it
// never writes inventory and is not the production planning source of truth.
// The nav entry is admin-gated; the URL stays reachable for planners and dev.
// ---------------------------------------------------------------------------

import { Suspense } from "react";
import { Info } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { LoadingState } from "@/components/feedback/states";
import { SimulationModeShell } from "./_components/SimulationModeShell";

export default function ProductionSimulationPage() {
  return (
    <>
      <WorkflowHeader
        eyebrow="Planner workspace"
        title="Production simulation"
        description="Break planned production down into every ingredient and packaging component you need — for one product, or for everything planned across a date range — and check it against on-hand stock."
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
          <div className="mt-5">
            <LoadingState
              title="Loading simulation"
              description="Fetching products and recipes…"
            />
          </div>
        }
      >
        <SimulationModeShell />
      </Suspense>
    </>
  );
}
