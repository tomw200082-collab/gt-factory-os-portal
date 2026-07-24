// ---------------------------------------------------------------------------
// Production Order Picking — UI dictionary (single source of every
// user-facing string on the /production surface).
//
// Simple English, weak-reader level (Denis reads English poorly): short words,
// no jargon, ≤4-5 words per action. The screen leans on numbers, units, ✓ and
// colour+icon rather than sentences.
//
// Structure mirrors the house dict pattern (one field per key, `en` + reserved
// `ru`). The `ru` slot is intentionally EMPTY and NOT built now — kept so a
// future language is a contained job (tranche spec §C). `t(key)` reads `en`.
// ---------------------------------------------------------------------------

export const pickingDict = {
  // ── /production — today's run list (operator landing) ────────────────────
  today_title: { en: "Today", ru: "" },
  today_subtitle: { en: "Your work for today", ru: "" },
  today_empty_title: { en: "No production today.", ru: "" },
  today_empty_body: { en: "When a job is planned for today, it shows up here.", ru: "" },
  today_eyebrow: { en: "Production", ru: "" },
  run_step_prefix: { en: "Step", ru: "" }, // "Step 1", "Step 2"
  run_tank_kind: { en: "Make tank", ru: "" }, // liquids stage (TANK)
  run_fill_kind: { en: "Fill", ru: "" }, // packaging stage (PACK)
  run_single_kind: { en: "Make & fill", ru: "" }, // both (SINGLE)
  run_status_todo: { en: "To do", ru: "" },
  run_status_picking: { en: "Collecting", ru: "" },
  run_status_making: { en: "In production", ru: "" },
  run_status_done: { en: "Done", ru: "" },
  run_status_cancelled: { en: "Cancelled", ru: "" },
  run_unplanned_tag: { en: "Extra job", ru: "" },
  run_open: { en: "Open", ru: "" },

  // ── unplanned run ────────────────────────────────────────────────────────
  unplanned_button: { en: "+ Extra job", ru: "" },
  unplanned_title: { en: "Start an extra job", ru: "" },
  unplanned_body: { en: "Not on today's plan? Start it here. Tom will be told.", ru: "" },
  unplanned_pick_item: { en: "What are you making?", ru: "" },
  unplanned_pick_item_ph: { en: "Search products…", ru: "" },
  unplanned_qty: { en: "How many?", ru: "" },
  unplanned_start: { en: "Start", ru: "" },
  unplanned_starting: { en: "Starting…", ru: "" },
  unplanned_cancel: { en: "Not now", ru: "" },
  unplanned_need_item: { en: "Pick a product first.", ru: "" },
  unplanned_need_qty: { en: "Type how many.", ru: "" },

  // ── /production/runs/[id] — picking screen ───────────────────────────────
  pick_tank_heading: { en: "Collect for the tank", ru: "" },
  pick_pack_heading: { en: "Collect packaging", ru: "" },
  pick_both_heading: { en: "Collect everything", ru: "" },
  pick_target: { en: "Making", ru: "" }, // "Making 200 L"
  pick_group_liquids: { en: "Liquids", ru: "" },
  pick_group_packaging: { en: "Packaging", ru: "" },
  pick_need: { en: "Take", ru: "" }, // "Take 14 kg" — row required qty
  pick_on_hand: { en: "In stock", ru: "" },
  pick_row_confirm: { en: "Got it", ru: "" }, // tap-row confirm action
  pick_row_ok: { en: "Taken", ru: "" }, // confirmed state
  pick_row_changed_to: { en: "Changed to", ru: "" }, // aria: "Changed to 5 L"
  pick_change: { en: "Change", ru: "" },
  pick_row_missing: { en: "Less than needed", ru: "" }, // edited below required
  pick_row_extra: { en: "More than in stock", ru: "" }, // edited above on-hand
  pick_row_not_collected: { en: "Not taken", ru: "" }, // explicit 0
  pick_mark_not_collected: { en: "I did not take this", ru: "" },
  pick_not_taken_hint: { en: "0 means you did not take this.", ru: "" },
  pick_edit_title: { en: "How much did you take?", ru: "" },
  pick_save: { en: "Save", ru: "" },
  pick_cancel: { en: "Cancel", ru: "" },
  pick_list_empty: {
    en: "No materials listed for this job. Contact the planner.",
    ru: "",
  },

  // ── done / confirm ───────────────────────────────────────────────────────
  pick_progress: { en: "checked", ru: "" }, // "3 / 8 checked"
  pick_done_button: { en: "Done collecting", ru: "" },
  pick_done_left_one: { en: "1 item left to check", ru: "" },
  pick_done_left_many: { en: "items left to check", ru: "" }, // "3 items left to check"
  pick_done_confirm_title: { en: "Take these from stock?", ru: "" },
  pick_done_confirm_body: { en: "Stock goes down now for what you took.", ru: "" },
  pick_done_confirm_yes: { en: "Yes, take from stock", ru: "" },
  pick_done_saving: { en: "Saving…", ru: "" },
  pick_done_confirm_no: { en: "Not yet", ru: "" },
  pick_done_success: { en: "Materials taken. You can start making.", ru: "" },
  pick_terminal_done: { en: "Materials were taken from stock.", ru: "" },
  pick_terminal_cancelled: {
    en: "This job was cancelled. No materials were taken.",
    ru: "",
  },
  pick_in_production_banner: {
    en: "Collecting is done. This job is being made.",
    ru: "",
  },
  pick_done_back_to_runs: { en: "Back to today", ru: "" },

  // ── active run — corrections (Add / Return) ──────────────────────────────
  active_heading: { en: "Need a change?", ru: "" },
  active_add: { en: "+ Add material", ru: "" },
  active_return: { en: "Return material", ru: "" },
  active_pick_item: { en: "Which material?", ru: "" },
  active_need_item: { en: "Pick a material first.", ru: "" },
  active_add_qty: { en: "How much extra?", ru: "" },
  active_return_qty: { en: "How much back?", ru: "" },
  active_notes: { en: "Note (if any)", ru: "" },
  active_add_save: { en: "Add it", ru: "" },
  active_return_save: { en: "Return it", ru: "" },
  active_saving: { en: "Saving…", ru: "" },
  active_add_done: { en: "Added to the job.", ru: "" },
  active_return_done: { en: "Returned to stock.", ru: "" },

  // ── shared: loading / error ──────────────────────────────────────────────
  loading: { en: "Loading…", ru: "" },
  error_generic: { en: "Something went wrong. Try again.", ru: "" },
  error_retry: { en: "Try again", ru: "" },
  error_stale_bom: { en: "The recipe changed. Tap to reload.", ru: "" },
  error_stale_bom_warn: {
    en: "Reloading clears your picks — you'll check them again.",
    ru: "",
  },
  error_break_glass: {
    en: "The system is busy. Try again in a few minutes.",
    ru: "",
  },
  error_load_runs: {
    en: "Could not load today's work. Check your connection and try again.",
    ru: "",
  },
  error_load_products: {
    en: "Could not load the product list. Try again.",
    ru: "",
  },
  error_load_pick_list: {
    en: "Could not load the materials. Check your connection and try again.",
    ru: "",
  },
  // ── /production/runs/[id]/report — end-of-run report ─────────────────────
  report_title: { en: "Finish the run", ru: "" },
  report_eyebrow: { en: "Production", ru: "" },
  report_output: { en: "How many good units?", ru: "" },
  report_scrap: { en: "How many bad / thrown?", ru: "" },
  report_qc_heading: { en: "Quality check (optional)", ru: "" },
  report_qc_hint: { en: "You can skip this. It never stops you.", ru: "" },
  report_brix: { en: "Brix", ru: "" },
  report_ph: { en: "pH", ru: "" },
  report_sample_taken: { en: "Sample taken", ru: "" },
  report_qc_note: { en: "Note", ru: "" },
  report_notes: { en: "Anything to add?", ru: "" },
  report_notes_ph: { en: "Type here…", ru: "" },
  report_submit: { en: "Finish run", ru: "" },
  report_saving: { en: "Saving…", ru: "" },
  report_need_output: { en: "Type the good units first.", ru: "" },
  report_success: { en: "Run finished. Good job.", ru: "" },
  report_cta: { en: "Report production", ru: "" },
  report_already_title: { en: "This run is already finished.", ru: "" },
  report_already_body: { en: "The work was saved. Nothing to add.", ru: "" },
  report_err_not_reportable: {
    en: "This run is not ready to finish. Ask the planner.",
    ru: "",
  },
  report_err_already: { en: "This run was already finished.", ru: "" },

  close_dialog: { en: "Close", ru: "" },
} as const;

export type PickingDictKey = keyof typeof pickingDict;

/** Resolve a dict key to its English string. The single reader used across the
 *  surface, so a missing key is a compile error, not a silent blank. */
export function t(key: PickingDictKey): string {
  return pickingDict[key].en;
}
