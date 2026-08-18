"use client";

// The full list.
//
// Dense on desktop, cards on a phone — the same rows either way. The business
// name is the anchor and stays put while the rest scrolls, which is the one
// piece of monday's table structure worth taking.

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

export function LeadsTable({ rows, onOpen }: LeadsTableProps) {
  return (
    <>
      {/* Phone: one card per lead. A twelve-column table on a 390px screen is
          a table nobody reads. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => (
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
              ].map((label) => (
                <th
                  key={label}
                  className="sticky top-0 z-10 border-b px-2 py-2 text-start font-medium"
                  style={{
                    background: "hsl(var(--s-surface))",
                    borderColor: "hsl(var(--s-border))",
                  }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
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
