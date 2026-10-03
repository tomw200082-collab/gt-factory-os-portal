// One line per settings change, in words a manager reads (D-045, tranche 205).
//
// sales_core.setting_event keeps the old and the new value of a key. A list ("lost_reasons",
// test phones) says what was added and what was removed; a map says which of its entries
// changed, by their own names, and a plain value inside it says from what to what. Anything
// else says "עודכן". Pure: no I/O.

import { DAY_SHORT, QUICK_SITUATION_LABELS, TEAM_UI } from "./labels";

const FIELD_LABELS: Record<string, Record<string, string>> = {
  queue: { daily_cap: "כמה שיחות ביום", order: "סדר התור" },
  response_time: { days: "ימי עבודה", start: "שעת התחלה", end: "שעת סיום", hot_hours: "יעד לליד חם", normal_hours: "יעד לכל ליד אחר" },
  whatsapp_quick_messages: QUICK_SITUATION_LABELS as Record<string, string>,
  lead_menus: { matcha: "מאצ׳ה", ube: "אובה", chai: "צ׳אי מסאלה", tea: "תמציות תה", opening: "תפריט הפתיחה" },
};
const VALUE_LABELS: Record<string, string> = { newest_first: "חדשים קודם", oldest_first: "ישנים קודם" };

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const show = (v: unknown, field?: string): string => {
  if (field === "days" && Array.isArray(v)) return v.map((d) => DAY_SHORT[Number(d)] ?? String(d)).join(" ");
  if (typeof v === "string") return VALUE_LABELS[v] ?? v;
  return String(v);
};

export function describeChange(
  key: string,
  oldValue: unknown,
  newValue: unknown,
  names: Record<string, string> = {},
): string[] {
  if (oldValue === null || oldValue === undefined) return [TEAM_UI.historyFirst];
  if (Array.isArray(oldValue) && Array.isArray(newValue)) {
    const before = oldValue.map(String);
    const after = newValue.map(String);
    const added = after.filter((x) => !before.includes(x));
    const removed = before.filter((x) => !after.includes(x));
    const out: string[] = [];
    if (added.length) out.push(TEAM_UI.historyAdded(added.join(", ")));
    if (removed.length) out.push(TEAM_UI.historyRemoved(removed.join(", ")));
    return out.length ? out : [TEAM_UI.historyUpdated];
  }
  if (isObj(oldValue) && isObj(newValue)) {
    const fields = FIELD_LABELS[key] ?? {};
    const keys = [...new Set([...Object.keys(oldValue), ...Object.keys(newValue)])];
    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];
    for (const k of keys) {
      const label = fields[k] ?? names[k] ?? k;
      const a = oldValue[k];
      const b = newValue[k];
      if (same(a, b)) continue;
      if (a === undefined) added.push(label);
      else if (b === undefined) removed.push(label);
      else if (typeof a !== "object" || k === "days") changed.push(`${label} מ־${show(a, k)} ל־${show(b, k)}`);
      else changed.push(label);
    }
    const out: string[] = [];
    if (added.length) out.push(TEAM_UI.historyAdded(added.join(", ")));
    if (removed.length) out.push(TEAM_UI.historyRemoved(removed.join(", ")));
    if (changed.length) out.push(TEAM_UI.historyChanged(changed.join(", ")));
    return out.length ? out : [TEAM_UI.historyUpdated];
  }
  if (!same(oldValue, newValue) && typeof oldValue !== "object" && typeof newValue !== "object") {
    return [TEAM_UI.historyChanged(`מ־${show(oldValue)} ל־${show(newValue)}`)];
  }
  return [TEAM_UI.historyUpdated];
}
