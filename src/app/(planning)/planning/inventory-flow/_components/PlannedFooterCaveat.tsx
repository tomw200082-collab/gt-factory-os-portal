"use client";

// ---------------------------------------------------------------------------
// PlannedFooterCaveat — board-level footer caveat per contract §7.2.
//
// The text is the Tom-locked dispatch override of contract §7.2 wording:
//
//   "Planned production is not inventory. Inventory changes only after
//    actual production is reported."
//
// VERBATIM. Do not paraphrase. Always rendered when the planned-overlay
// toggle is ON. Localization register = English/LTR.
// ---------------------------------------------------------------------------

export function PlannedFooterCaveat() {
  return (
    <div
      role="note"
      aria-label="Planned production caveat"
      className="mt-2 rounded-sm border border-info/30 bg-info-softer/60 px-3 py-2 text-2xs leading-relaxed text-info-fg"
      data-testid="planned-footer-caveat"
    >
      <span className="font-semibold uppercase tracking-sops">
        Planned production is not inventory.
      </span>{" "}
      Inventory changes only after actual production is reported.
    </div>
  );
}
