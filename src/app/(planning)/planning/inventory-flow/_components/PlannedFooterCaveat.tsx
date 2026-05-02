"use client";

// ---------------------------------------------------------------------------
// PlannedFooterCaveat — board-level non-dismissible footer caveat per
// inventory_flow_planned_inflow_overlay_contract.md §7.2.
//
// Tom-locked verbatim copy (overrides contract §7.2 wording):
//   "Planned production is not inventory. Inventory changes only after
//    actual production is reported."
//
// Always rendered at the bottom of the page so the visual anchor sits in
// the same place every time, regardless of whether the overlay toggle is
// on or off (a planner who toggles overlay OFF still benefits from the
// principle being visible — but per §7 the caveat anchors the WHOLE board,
// not just the overlay).
// ---------------------------------------------------------------------------

export function PlannedFooterCaveat() {
  return (
    <p
      role="note"
      className="mt-6 rounded-sm border border-dashed border-info/40 bg-info-softer/40 px-3 py-2 text-3xs leading-relaxed text-info-fg"
    >
      <span className="font-semibold">Planned production is not inventory.</span>{" "}
      Inventory changes only after actual production is reported.
    </p>
  );
}
