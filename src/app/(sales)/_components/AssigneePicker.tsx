"use client";

// Who a lead belongs to.
//
// A text box is why this had to change: `assignee` was free text validated by
// nobody, so a typo assigned the lead to a ghost and no screen ever said so
// (audit P0-2/P0-3). The options come from the roster in app_setting, which is
// curated on the settings screen — never from private_core.app_users, which
// carries roughly a hundred test accounts.

import { UI } from "../_lib/labels";
import type { AssigneeEntry } from "../_lib/types";

export interface AssigneePickerProps {
  value: string | null;
  roster: AssigneeEntry[];
  disabled?: boolean;
  /** Adds the "no owner" option. Unassigning is always legal server-side; it
   *  is how a lead goes back to the pool. */
  allowUnassign?: boolean;
  id?: string;
  onChange: (email: string | null) => void;
}

export function AssigneePicker({
  value,
  roster,
  disabled,
  allowUnassign,
  id,
  onChange,
}: AssigneePickerProps) {
  const active = roster.filter((a) => a.active);

  return (
    <select
      id={id}
      data-testid="assignee-picker"
      className="s-input"
      disabled={disabled}
      aria-label={UI.assigneeLabel}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
    >
      {allowUnassign ? <option value="">{UI.noOwnerOption}</option> : null}
      {/* An assignee already on a lead but no longer on the roster still shows,
          so a deactivated person's leads do not silently read as unowned. */}
      {value && !active.some((a) => a.email === value) ? (
        <option value={value}>{value}</option>
      ) : null}
      {active.map((a) => (
        <option key={a.email} value={a.email}>
          {a.name}
        </option>
      ))}
    </select>
  );
}

/** The roster name for an email, falling back to the local part — never the
 *  raw address, which is noise in a table column. */
export function assigneeName(email: string | null, roster: AssigneeEntry[]): string | null {
  if (!email) return null;
  return roster.find((a) => a.email === email)?.name ?? email.split("@")[0];
}
