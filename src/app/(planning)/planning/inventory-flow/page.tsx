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
    "Daily finished-goods stock projection — at-risk products, projected stockouts, incoming POs. Run this before locking a week to check coverage gaps, or after receiving goods to confirm the week is covered.",
};

export default function InventoryFlowPage() {
  return <InventoryFlowClient />;
}
