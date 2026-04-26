// ---------------------------------------------------------------------------
// /planning/inventory-flow — Inventory Flow daily control tower.
//
// Replaces the legacy /planning/weekly-outlook view with a daily-granular
// 14-day grid + weekly outlook 6 weeks beyond. Authored under Mode B-
// InventoryFlow (corridor amendment §C, single tranche, 2026-04-26).
// ---------------------------------------------------------------------------

import type { Metadata } from "next";
import { InventoryFlowClient } from "./InventoryFlowClient";

export const metadata: Metadata = {
  title: "Inventory Flow",
  description:
    "Daily FG stock projection — at-risk products, projected stockouts, incoming POs.",
};

export default function InventoryFlowPage() {
  return <InventoryFlowClient />;
}
