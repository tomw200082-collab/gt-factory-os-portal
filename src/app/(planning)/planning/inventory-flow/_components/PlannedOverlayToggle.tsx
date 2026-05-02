"use client";

// ---------------------------------------------------------------------------
// PlannedOverlayToggle — checkbox controlling visibility of the planned
// production overlay across the inventory-flow board.
//
// Contract (inventory_flow_planned_inflow_overlay_contract.md §5.1 toggle
// requirements + §10 row 3 + §10 row 4):
//   - Persisted in localStorage under the stable key
//     `gtfos.inventoryFlow.plannedOverlayEnabled` (per plannedInflow.ts).
//   - Default = ON (contract §10 row 4; dispatch confirms).
//   - Position on desktop: filter row, alongside "Show only at-risk".
//   - Position on mobile @ 390px: page header (handled by InventoryFlowClient
//     placement; this component is layout-agnostic).
//
// State is managed by the parent (InventoryFlowClient) via props, not by this
// component itself, so the toggle and the data-fetch hook share a single
// source of truth.
// ---------------------------------------------------------------------------

interface PlannedOverlayToggleProps {
  enabled: boolean;
  onChange: (next: boolean) => void;
  /** Optional small badge content shown when the overlay is on (e.g., "stale"). */
  badge?: React.ReactNode;
  className?: string;
}

export function PlannedOverlayToggle({
  enabled,
  onChange,
  badge,
  className,
}: PlannedOverlayToggleProps) {
  return (
    <label
      className={`inline-flex shrink-0 items-center gap-2 rounded-sm border border-info/40 bg-info-softer/50 px-2.5 py-1.5 text-xs font-medium text-info-fg ${className ?? ""}`}
      title="Show production plans on the grid as a secondary 'Planned: N' chip in each day. Plans never affect inventory."
    >
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded-sm border-info accent-info"
        data-testid="planned-overlay-toggle"
      />
      <span>Show planned production overlay</span>
      {badge}
    </label>
  );
}
