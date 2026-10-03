// Response time in working hours (D-043, tranche 204): the wording of the time left, and
// the settings validation. The rules are the server's (api/src/sales/schemas.ts
// responseTimeSchema), restated so the form can say what is wrong before a save is refused.

import { UI } from "./labels";
import type { ResponseTime } from "./types";

/** Working time left, plainly: minutes under an hour, then hours rounded down to a half. */
export function fmtWorkLeft(minutes: number): string {
  const m = Math.max(1, Math.floor(minutes));
  if (m < 60) return UI.workLeftMinutes(m);
  return UI.workLeftHours(Math.floor(m / 30) / 2);
}

export type ResponseTimeProblems = Partial<Record<"days" | "hours" | "hot" | "normal", string>>;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const targetOk = (n: number) => Number.isFinite(n) && n >= 0.5 && n <= 40 && Number.isInteger(n * 2);

/** Empty object = valid. One message per field, the first rule it breaks. */
export function validateResponseTime(v: ResponseTime): ResponseTimeProblems {
  const out: ResponseTimeProblems = {};
  if (v.days.length === 0) out.days = UI.rtDaysEmpty;
  if (!HHMM.test(v.start) || !HHMM.test(v.end)) out.hours = UI.rtTimeMissing;
  else if (v.end <= v.start) out.hours = UI.rtEndBeforeStart;
  if (!targetOk(v.hot_hours)) out.hot = UI.rtHoursRange;
  if (!targetOk(v.normal_hours)) out.normal = UI.rtHoursRange;
  if (!out.hot && !out.normal && v.hot_hours > v.normal_hours) out.hot = UI.rtHotSlower;
  return out;
}
