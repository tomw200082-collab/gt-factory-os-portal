// ---------------------------------------------------------------------------
// /planning/inventory-flow/supply — Supply-side daily projection.
//
// Sister page to /planning/inventory-flow (FG flow). Shows daily projection
// for raw-material + packaging components and BOUGHT_FINISHED items over
// the same 14-day daily band + 6-week weekly tail.
//
// Wave 3 of the supply-side inventory flow plan (2026-05-06). v1 does NOT
// render the planned-production overlay (no inflow_from_production model
// for supply yet) and does NOT have a per-SKU drill-down page (deferred
// to v2 — backend route exists but no UI consumes it).
// ---------------------------------------------------------------------------

import type { Metadata } from "next";
import { SupplyFlowClient } from "./SupplyFlowClient";

export const metadata: Metadata = {
  title: "Components Flow — GT Factory OS",
  description:
    "Daily projection for raw materials and packaging components.",
};

export default function SupplyFlowPage() {
  return <SupplyFlowClient />;
}
