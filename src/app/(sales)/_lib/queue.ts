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
 * Exactly one section is. An untouched new lead is work nobody has been
 * promised anything about, and how much of that backlog is owed today is a
 * number Tom sets. The other three are not workload at all: a conversion is
 * news, a returning customer is the one case that must never go quiet again,
 * and a due follow-up is a callback the rep already promised, on a date they
 * chose. None of those three can be deferred to tomorrow, so none is capped,
 * however long the backlog behind them is.
 *
 * `due_follow_up` sat in this list until tranche 173, which is not a bug this
 * file introduced by accident — tranche 164 specified it, tested it and ticked
 * it off. Against the live shape (189 untouched leads, cap 15) one shared
 * budget drained in render order rendered the follow-up section as zero cards:
 * a promise made to a named person lost to the backlog, every morning, in
 * silence.
 */
export const CAPPED_SECTIONS: TodayItemType[] = ["new_lead"];

/**
 * Cap the queue at the admin-owned daily commitment.
 *
 * A queue of 188 is not a queue, it is a wall (audit P0-1). The answer is not
 * to hide rows — the count stays true — but to say plainly how many belong to
 * today and how many are waiting behind them.
 *
 * The cap is **one budget across the whole queue**, not one per section. It was
 * applied per section, so a cap of 15 produced 15 new leads *and* 15 follow-ups
 * — thirty calls from a setting whose own label reads "כמה שיחות ביום" (gate
 * P1). The budget now has exactly one claimant, so "one budget" and "one per
 * section" describe the same behaviour and the 15+15=30 bug cannot return by
 * either route. Everything ahead of new leads in render order — conversions,
 * returning customers, due follow-ups — passes through untouched.
 *
 * `budget` is what is left after earlier sections took their share; pass the
 * full daily cap for the first capped section.
 */
export function capRows(
  rows: TodayRow[],
  budget: number,
): { visible: TodayRow[]; remaining: number } {
  const capped = rows.filter((r) => CAPPED_SECTIONS.includes(r.item_type));
  const uncapped = rows.filter((r) => !CAPPED_SECTIONS.includes(r.item_type));
  const kept = capped.slice(0, Math.max(0, budget));
  return { visible: [...uncapped, ...kept], remaining: capped.length - kept.length };
}

/**
 * How much of the daily budget a section consumes — only capped sections spend
 * it, and a section never spends more than it has rows for.
 */
export function budgetSpent(rows: TodayRow[], budget: number): number {
  const capped = rows.filter((r) => CAPPED_SECTIONS.includes(r.item_type)).length;
  return Math.min(capped, Math.max(0, budget));
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
