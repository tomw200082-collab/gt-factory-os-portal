// Formatting for the sales workspace. Hebrew output, Israel time.

const IL_LOCALE = "he-IL";
const IL_TZ = "Asia/Jerusalem";

/** 5 באוג׳ 2026 */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(IL_LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: IL_TZ,
  }).format(d);
}

/** 5 באוג׳, 14:30 */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(IL_LOCALE, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: IL_TZ,
  }).format(d);
}

/** For a date input's value. */
export function toDateInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * "לפני שעתיים", "מחר", "לפני 3 ימים". Past and future both read naturally,
 * which matters because the same helper renders lead age and next-touch dates.
 */
export function fmtRelative(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";

  const diffMs = d.getTime() - now.getTime();
  const past = diffMs < 0;
  const abs = Math.abs(diffMs);

  const minutes = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);

  if (minutes < 1) return "עכשיו";
  if (minutes < 60) return past ? `לפני ${minutes} דק׳` : `בעוד ${minutes} דק׳`;
  if (hours < 24) {
    if (hours === 2) return past ? "לפני שעתיים" : "בעוד שעתיים";
    if (hours === 1) return past ? "לפני שעה" : "בעוד שעה";
    return past ? `לפני ${hours} שעות` : `בעוד ${hours} שעות`;
  }
  if (days === 1) return past ? "אתמול" : "מחר";
  if (days === 2) return past ? "שלשום" : "מחרתיים";
  if (days < 30) return past ? `לפני ${days} ימים` : `בעוד ${days} ימים`;

  const months = Math.round(days / 30);
  if (months === 1) return past ? "לפני חודש" : "בעוד חודש";
  if (months < 12) return past ? `לפני ${months} חודשים` : `בעוד ${months} חודשים`;

  const years = Math.round(days / 365);
  if (years === 1) return past ? "לפני שנה" : "בעוד שנה";
  return past ? `לפני ${years} שנים` : `בעוד ${years} שנים`;
}

/** ₪2,152 — no decimals; these are order-of-magnitude figures, not invoices. */
export function fmtMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat(IL_LOCALE, {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(n);
}

export function fmtCount(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat(IL_LOCALE).format(n);
}

/**
 * +972521234567 → 052-1234567. Anything that is not an Israeli mobile in E.164
 * is returned untouched: a number we cannot parse is still a number worth
 * showing.
 */
export function fmtPhone(e164: string | null | undefined): string {
  if (!e164) return "—";
  const m = e164.match(/^\+972(\d{8,9})$/);
  if (!m) return e164;
  const national = `0${m[1]}`;
  if (national.length === 10) return `${national.slice(0, 3)}-${national.slice(3)}`;
  if (national.length === 9) return `${national.slice(0, 2)}-${national.slice(2)}`;
  return national;
}

/**
 * Digits only, with the Israeli country code normalised away, so a number typed
 * as 052-123-4567 matches one stored as +972521234567.
 */
export function phoneSearchKey(input: string | null | undefined): string {
  if (!input) return "";
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("972")) return digits.slice(3).replace(/^0+/, "");
  return digits.replace(/^0+/, "");
}
