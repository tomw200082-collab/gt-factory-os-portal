"use client";

// The businesses behind the leads.
//
// This is the seam the churn radar and white-space mapping attach to later.
// Today it answers one question well: who is this business, and when did we
// last hear from them?

import { fmtPhone, fmtRelative } from "../_lib/format";
import { UI } from "../_lib/labels";
import type { OrgRow } from "../_lib/types";
import { CustomerBadge } from "./CustomerBadge";

export function OrgList({ rows, onOpen }: { rows: OrgRow[]; onOpen: (org: OrgRow) => void }) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((org) => (
        <li key={org.id}>
          <button
            type="button"
            data-testid={`org-row-${org.id}`}
            onClick={() => onOpen(org)}
            className="s-card w-full p-3 text-start"
          >
            <span className="flex items-start justify-between gap-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold" style={{ color: "hsl(var(--s-fg))" }}>
                  {org.display_name}
                </span>
                <span
                  className="s-nums block truncate text-[13px]"
                  style={{ color: "hsl(var(--s-fg-muted))" }}
                >
                  <bdi dir="ltr">{fmtPhone(org.phone_e164)}</bdi>
                </span>
              </span>
              {org.is_existing_customer ? <CustomerBadge /> : null}
            </span>
            <span
              className="mt-2 flex flex-wrap items-center gap-2 text-[12px]"
              style={{ color: "hsl(var(--s-fg-faint))" }}
            >
              <span className="s-nums">{UI.orgLeads(Number(org.lead_count))}</span>
              <span>·</span>
              <span>
                {org.last_activity_at
                  ? `${UI.orgLastActivity}: ${fmtRelative(org.last_activity_at)}`
                  : UI.orgNoActivity}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
