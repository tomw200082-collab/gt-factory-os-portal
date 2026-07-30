/**
 * Date display helpers for Hebrew/RTL operator surfaces.
 *
 * Tranche 154 (ux-release-gate 2026-07-30, COPY-103): the placement queue
 * rendered API dates verbatim as ISO `YYYY-MM-DD`. Read inside a right-to-left
 * sentence by a bookkeeper, "2026-07-10" is genuinely ambiguous — Israeli
 * convention is DD/MM/YYYY, and the leading four-digit year is the one part
 * that never appears first locally. Every operator-facing date on an RTL
 * surface goes through this.
 */

/**
 * Render an ISO `YYYY-MM-DD` date as Israeli `DD/MM/YYYY`.
 *
 * Input that is null, empty, or not an ISO date is returned unchanged (as a
 * string) rather than throwing or printing "Invalid Date" — an operator surface
 * must degrade to showing the raw value, never to a crash or to a lie.
 * Datetime strings are accepted and their date part is used.
 */
export function formatIsraeliDate(
  iso: string | null | undefined,
): string {
  if (iso == null) return "";
  const s = String(iso).trim();
  if (s === "") return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  const [, year, month, day] = m;
  return `${day}/${month}/${year}`;
}
