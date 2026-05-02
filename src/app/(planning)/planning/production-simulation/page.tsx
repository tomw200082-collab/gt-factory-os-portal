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
// disagree with live database state. Adding the BETA banner below is the
// audit-cleanup interim fix; full backend wiring is queued as a separate
// W4 contract → W1 backend → W2 portal sequence (out of scope this cycle).
// Page is intentionally NOT removed — some users may rely on it.
// ---------------------------------------------------------------------------

import Link from "next/link";
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

      {/* Audit 2026-05-01 §16 #9 — BETA / cached-data warning. This page
          reads from the client-side IDB sandbox repos, NOT from the live
          API, so its numbers can disagree with current production data
          (BOM updates, item additions, supply-method changes). The
          warning is rendered above the simulator shell so it cannot be
          missed. Do not remove until the backend-wired replacement
          ships; pair-link to /planning/inventory-flow gives operators
          the trusted projection source today. */}
      <div
        role="status"
        aria-live="polite"
        data-testid="production-simulation-beta-banner"
        className="mt-3 rounded border border-warning/30 bg-warning-softer/30 p-3 text-xs text-warning-fg"
      >
        <span className="font-medium">BETA — uses cached data. </span>
        May not match live production. For a trustworthy projection, use{" "}
        <Link
          href="/planning/inventory-flow"
          className="text-accent underline underline-offset-2 hover:text-accent/80"
        >
          Inventory Flow →
        </Link>
      </div>

      <Suspense fallback={<div className="text-xs text-fg-muted">Loading…</div>}>
        <ProductionSimulatorShell />
      </Suspense>
    </>
  );
}
