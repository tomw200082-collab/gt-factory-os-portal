// Queue shaping — the two decisions that turn 188 rows into a morning.
//
// These live here rather than inside TodayQueue because TodayCard needs
// agedTone too, and importing it back out of the component that renders the
// card would make the two modules circular.

import type { TodayItemType, TodayRow } from "./types";

/**
 * Above this, a section count stops being information and becomes an alarm.
 * Ten is a morning; a hundred is a backlog, and it should look like one.
 */
export const SECTION_ALARM_COUNT = 10;

/**
 * Sections that are workload, and so subject to the daily commitment.
 *
 * A conversion is news and a returning customer is the one case that must never
 * go quiet again — neither is work you can defer to tomorrow, so neither is
 * capped, however long the backlog behind them is.
 */
export const CAPPED_SECTIONS: TodayItemType[] = ["new_lead", "due_follow_up"];

/**
 * Cap a section at the admin-owned daily commitment.
 *
 * A queue of 188 is not a queue, it is a wall (audit P0-1). The answer is not
 * to hide rows — the count stays true — but to say plainly how many belong to
 * today and how many are waiting behind them.
 */
export function capRows(
  rows: TodayRow[],
  cap: number,
): { visible: TodayRow[]; remaining: number } {
  const capped = rows.filter((r) => CAPPED_SECTIONS.includes(r.item_type));
  const uncapped = rows.filter((r) => !CAPPED_SECTIONS.includes(r.item_type));
  const kept = capped.slice(0, Math.max(0, cap));
  return { visible: [...uncapped, ...kept], remaining: capped.length - kept.length };
}

/**
 * Whether a lead's age should read as urgent.
 *
 * Speed-to-lead is the strongest single predictor in the sales doctrine this
 * workspace is built on, and the queue used to render "לפני 19 ימים" in exactly
 * the ink it used for "לפני יום" (audit P1-14). The threshold is the live SLA,
 * so the line Tom sets on the settings screen is the line the colour respects.
 */
export function agedTone(ageDays: number, slaHours: number): "muted" | "overdue" {
  return ageDays > slaHours / 24 ? "overdue" : "muted";
}
