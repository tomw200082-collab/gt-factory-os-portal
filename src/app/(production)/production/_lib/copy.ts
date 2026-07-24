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
  today_empty_body: { en: "When a run is planned for today, it shows up here.", ru: "" },
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
  run_unplanned_tag: { en: "Extra run", ru: "" },
  run_open: { en: "Open", ru: "" },

  // ── unplanned run ────────────────────────────────────────────────────────
  unplanned_button: { en: "+ Extra run", ru: "" },
  unplanned_title: { en: "Start an extra run", ru: "" },
  unplanned_body: { en: "Not on today's plan? Start it here. Tom is told.", ru: "" },
  unplanned_pick_item: { en: "What are you making?", ru: "" },
  unplanned_pick_item_ph: { en: "Search products…", ru: "" },
  unplanned_qty: { en: "How many?", ru: "" },
  unplanned_uom: { en: "Unit", ru: "" },
  unplanned_start: { en: "Start run", ru: "" },
  unplanned_starting: { en: "Starting…", ru: "" },
  unplanned_cancel: { en: "Not now", ru: "" },
  unplanned_flag_sent: { en: "Started. Tom was told.", ru: "" },
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
  pick_took: { en: "You took", ru: "" },
  pick_row_confirm: { en: "Got it", ru: "" }, // tap-row confirm action
  pick_row_ok: { en: "Taken", ru: "" }, // confirmed state
  pick_row_edit_hint: { en: "Tap the number to change", ru: "" },
  pick_change: { en: "Change", ru: "" },
  pick_row_missing: { en: "Less than needed", ru: "" }, // edited below required
  pick_row_extra: { en: "More than stock", ru: "" }, // edited above on-hand
  pick_row_not_collected: { en: "Not taken", ru: "" }, // explicit 0
  pick_mark_not_collected: { en: "I did not take this", ru: "" },
  pick_edit_title: { en: "How much did you take?", ru: "" },
  pick_save: { en: "Save", ru: "" },
  pick_cancel: { en: "Back", ru: "" },

  // ── done / confirm ───────────────────────────────────────────────────────
  pick_progress: { en: "checked", ru: "" }, // "3 / 8 checked"
  pick_done_button: { en: "Done collecting", ru: "" },
  pick_done_blocked: { en: "Check every line first", ru: "" }, // disabled reason
  pick_done_left_one: { en: "1 line left to check", ru: "" },
  pick_done_left_many: { en: "lines left to check", ru: "" }, // "3 lines left to check"
  pick_done_confirm_title: { en: "Take these from stock?", ru: "" },
  pick_done_confirm_body: { en: "Stock goes down now for what you took.", ru: "" },
  pick_done_confirm_yes: { en: "Yes, take from stock", ru: "" },
  pick_done_saving: { en: "Saving…", ru: "" },
  pick_done_confirm_no: { en: "Not yet", ru: "" },
  pick_done_success: { en: "Stock updated. You can start.", ru: "" },
  pick_done_back_to_runs: { en: "Back to today", ru: "" },

  // ── active run — corrections (Add / Return) ──────────────────────────────
  active_heading: { en: "Need a change?", ru: "" },
  active_add: { en: "+ Add material", ru: "" },
  active_return: { en: "Return material", ru: "" },
  active_pick_item: { en: "Which material?", ru: "" },
  active_add_qty: { en: "How much extra?", ru: "" },
  active_return_qty: { en: "How much back?", ru: "" },
  active_notes: { en: "Note (if any)", ru: "" },
  active_add_save: { en: "Add it", ru: "" },
  active_return_save: { en: "Return it", ru: "" },
  active_saving: { en: "Saving…", ru: "" },
  active_add_done: { en: "Added.", ru: "" },
  active_return_done: { en: "Returned.", ru: "" },

  // ── shared: loading / error ──────────────────────────────────────────────
  loading: { en: "Loading…", ru: "" },
  error_generic: { en: "Something went wrong. Try again.", ru: "" },
  error_retry: { en: "Try again", ru: "" },
  error_stale_bom: { en: "The recipe changed. Reload the list.", ru: "" },
  error_break_glass: { en: "Stock is locked right now. Try again soon.", ru: "" },
  back: { en: "Back", ru: "" },
} as const;

export type PickingDictKey = keyof typeof pickingDict;

/** Resolve a dict key to its English string. The single reader used across the
 *  surface, so a missing key is a compile error, not a silent blank. */
export function t(key: PickingDictKey): string {
  return pickingDict[key].en;
}
