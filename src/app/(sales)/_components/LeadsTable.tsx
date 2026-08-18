"use client";

// The full list.
//
// Dense on desktop, cards on a phone — the same rows either way. The business
// name is the anchor and stays put while the rest scrolls, which is the one
// piece of monday's table structure worth taking.

import { useMemo, useState } from "react";
import { fmtDate, fmtPhone, fmtRelative } from "../_lib/format";
import { UI } from "../_lib/labels";
import type { SalesLeadRow } from "../_lib/types";
import { CustomerBadge } from "./CustomerBadge";
import { SlaBadge } from "./SlaBadge";
import { StatusPill } from "./StatusPill";

export interface LeadsTableProps {
  rows: SalesLeadRow[];
  onOpen: (lead: SalesLeadRow) => void;
}

function Badges({ row }: { row: SalesLeadRow }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {row.is_existing_customer ? <CustomerBadge /> : null}
      <SlaBadge state={row.sla_state} />
      {row.possible_duplicate_of ? (
        <span data-testid="duplicate-badge" className="s-badge s-badge-customer">
          {UI.duplicateBadge}
        </span>
      ) : null}
    </span>
  );
}

/**
 * How many cards the phone list renders before asking for more.
 *
 * Larger than the Today queue's 12 on purpose: this screen is browsing rather
 * than working, so the batch can be bigger — but it still has to exist. At 188
 * rows the unpaginated list measured 19,879px of scroll (audit P0-1).
 */
const PAGE = 20;

export function LeadsTable({ rows, onOpen }: LeadsTableProps) {
  const [shown, setShown] = useState(PAGE);
  // Descending by default: the oldest lead is the one most likely to be lost,
  // and sorting is here because 188 rows in arrival order hide urgency
  // completely (audit INTER-010).
  const [ageSort, setAgeSort] = useState<"desc" | "asc" | null>(null);

  const sorted = useMemo(() => {
    if (!ageSort) return rows;
    const dir = ageSort === "desc" ? -1 : 1;
    return [...rows].sort((a, b) => (a.age_days - b.age_days) * dir);
  }, [rows, ageSort]);

  const visible = sorted.slice(0, shown);
  const remaining = sorted.length - visible.length;

  return (
    <>
      {/* Phone: one card per lead. A twelve-column table on a 390px screen is
          a table nobody reads. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {visible.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              data-testid={`lead-card-${row.id}`}
              onClick={() => onOpen(row)}
              className="s-card w-full p-3 text-start"
            >
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate font-semibold"
                    style={{ color: "hsl(var(--s-fg))" }}
                  >
                    {row.org_name}
                  </span>
                  <span
                    className="block truncate text-[13px]"
                    style={{ color: "hsl(var(--s-fg-muted))" }}
                  >
                    {row.contact_name ? `${row.contact_name} · ` : ""}
                    <bdi dir="ltr" className="s-nums">
                      {fmtPhone(row.phone_e164)}
                    </bdi>
                  </span>
                </span>
                <StatusPill status={row.status} />
              </span>
              <span className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badges row={row} />
                <span className="s-nums text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
                  {UI.ageDays(row.age_days)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {remaining > 0 ? (
        <button
          type="button"
          data-testid="leads-show-more"
          className="s-btn s-btn-ghost mt-2 gap-2 md:hidden"
          onClick={() => setShown((n) => n + PAGE)}
        >
          {UI.showMore(Math.min(remaining, PAGE))}
          <span className="s-nums text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
            {UI.showMoreRemaining(remaining)}
          </span>
        </button>
      ) : null}

      {/* Desktop: the dense table. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            {/* Every header sticks, and every one carries the surface colour.
                Sticking one column left the other six scrolling away, and a
                transparent sticky cell has 188 rows of text sliding under it. */}
            <tr style={{ color: "hsl(var(--s-fg-muted))" }}>
              {[
                UI.colBusiness,
                UI.colContact,
                UI.colPhone,
                UI.statusLabel,
                UI.colCampaign,
                UI.colAge,
                UI.colNextTouch,
              ].map((label) => {
                const sortable = label === UI.colAge;
                return (
                  <th
                    key={label}
                    // aria-sort belongs on the header cell, not on the button:
                    // it is the column that is sorted, and a screen reader in
                    // table mode reads the cell.
                    aria-sort={
                      !sortable || !ageSort
                        ? undefined
                        : ageSort === "desc"
                          ? "descending"
                          : "ascending"
                    }
                    className="sticky top-0 z-10 border-b px-2 py-2 text-start font-medium"
                    style={{
                      background: "hsl(var(--s-surface))",
                      borderColor: "hsl(var(--s-border))",
                    }}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        data-testid="leads-sort-age"
                        aria-label={UI.sortByAge}
                        className="flex items-center gap-1 font-medium"
                        onClick={() =>
                          setAgeSort((prev) => (prev === "desc" ? "asc" : "desc"))
                        }
                      >
                        {label}
                        <span aria-hidden className="s-nums text-[11px]">
                          {ageSort === "asc" ? "↑" : ageSort === "desc" ? "↓" : "↕"}
                        </span>
                      </button>
                    ) : (
                      label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              // The row stays a row. Putting role="button" on the <tr> replaced
              // its implicit role="row", which severs every cell from the column
              // headers in the accessibility tree — a screen reader in table
              // mode could no longer say which column it was reading. The real
              // control lives in the row header cell instead; the row keeps its
              // click target as a pointer-only convenience on top of that.
              <tr
                key={row.id}
                data-testid={`lead-row-${row.id}`}
                onClick={() => onOpen(row)}
                className="cursor-pointer border-t"
                style={{ borderColor: "hsl(var(--s-border))" }}
              >
                <th
                  scope="row"
                  className="sticky px-2 py-2 text-start font-semibold"
                  style={{
                    insetInlineStart: 0,
                    background: "hsl(var(--s-surface))",
                    color: "hsl(var(--s-fg))",
                  }}
                >
                  <button
                    type="button"
                    data-testid={`lead-open-${row.id}`}
                    onClick={(e) => {
                      // The row handles the click too; without this the drawer
                      // would open and immediately re-open.
                      e.stopPropagation();
                      onOpen(row);
                    }}
                    className="flex items-center gap-1.5 text-start font-semibold"
                    style={{ color: "hsl(var(--s-fg))" }}
                  >
                    {row.org_name}
                    <Badges row={row} />
                  </button>
                </th>
                <td className="px-2 py-2" style={{ color: "hsl(var(--s-fg-muted))" }}>
                  {row.contact_name ?? "—"}
                </td>
                <td className="s-nums px-2 py-2" style={{ color: "hsl(var(--s-fg-muted))" }}>
                  <bdi dir="ltr">{fmtPhone(row.phone_e164)}</bdi>
                </td>
                <td className="px-2 py-2">
                  <StatusPill status={row.status} />
                </td>
                <td className="px-2 py-2" style={{ color: "hsl(var(--s-fg-muted))" }}>
                  {row.campaign_name ?? row.platform ?? "—"}
                </td>
                <td className="s-nums px-2 py-2" style={{ color: "hsl(var(--s-fg-muted))" }}>
                  {UI.ageDays(row.age_days)}
                </td>
                <td
                  className="s-nums px-2 py-2"
                  style={{
                    color: row.next_touch_overdue
                      ? "hsl(var(--s-sla-overdue))"
                      : "hsl(var(--s-fg-muted))",
                  }}
                >
                  {row.next_touch_at ? fmtDate(row.next_touch_at) : "—"}
                  {row.next_touch_overdue ? ` · ${fmtRelative(row.next_touch_at)}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
