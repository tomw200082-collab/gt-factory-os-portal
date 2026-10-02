const zone = "Asia/Jerusalem";

function parts(date: Date): Record<string, number> {
  const fields = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hourCycle: "h23", minute: "2-digit", second: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(fields.filter((field) => field.type !== "literal")
    .map((field) => [field.type, Number(field.value)]));
}

export function israelDate(date: Date = new Date()): string {
  const { year, month, day } = parts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addIsraelDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/** Resolve the local 09:00 wall time using the offset on that date, including DST. */
export function israelNineAM(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid Israel date");
  const target = Date.parse(`${date}T09:00:00Z`);
  let instant = target;
  for (let i = 0; i < 3; i++) {
    const p = parts(new Date(instant));
    const localAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const resolved = target - (localAsUtc - instant);
    if (resolved === instant) break;
    instant = resolved;
  }
  return new Date(instant).toISOString();
}

/** The first date whose 09:00 Israel is still ahead: today before 09:00, else
 *  tomorrow. A next touch saves at 09:00, so an earlier date is overdue work
 *  the moment it is written (UX gate and portal review, 2026-10-01). */
export function israelFirstSchedulableDate(now: Date = new Date()): string {
  const today = israelDate(now);
  return Date.parse(israelNineAM(today)) > now.getTime() ? today : addIsraelDays(today, 1);
}

/** Lift a date below the first schedulable one up to it; "" stays "". */
export function atLeastSchedulable(date: string): string {
  const floor = israelFirstSchedulableDate();
  return date && date < floor ? floor : date;
}

export function israelNineAMAfter(days: number, from: Date = new Date()): string {
  return israelNineAM(addIsraelDays(israelDate(from), days));
}

/**
 * Whole calendar days in Israel between a past instant and now (GT Pulse Unit B:
 * "days since the last order"). Calendar days, not 24-hour blocks: an order at
 * 23:30 yesterday is "one day ago" this morning, as a salesperson would say it.
 */
export function daysSinceIsrael(iso: string, now: Date = new Date()): number {
  const from = Date.parse(`${israelDate(new Date(iso))}T00:00:00Z`);
  const to = Date.parse(`${israelDate(now)}T00:00:00Z`);
  return Math.max(0, Math.round((to - from) / 86_400_000));
}
