"use client";

// The businesses, one server page at a time (GT Pulse Unit B).
//
// Each row answers "who is this and where do we stand": the name, the chain,
// one state in words, and, only when the server published them, the last order
// and the twelve-month value before VAT. A value the server withheld (review,
// unpublished history) is absent, never printed as zero.

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { fmtAgorot, fmtRelative } from "../_lib/format";
import { UI } from "../_lib/labels";
import type { OrgListRow } from "../_lib/types";
import { OrgStateBadge, orgStateKey } from "./OrgStateBadge";

export interface OrgListProps {
  rows: OrgListRow[];
  /** Managers see owners and may select rows for bulk assignment. */
  manager: boolean;
  /** email → display name, for the owner line */
  owners?: Record<string, string>;
  selecting?: boolean;
  selected?: ReadonlySet<string>;
  onToggle?: (id: string) => void;
}

export function OrgList({ rows, manager, owners = {}, selecting = false, selected, onToggle }: OrgListProps) {
  return (
    <ul className="flex flex-col gap-2" data-testid="org-list">
      {rows.map((org) => {
        const checked = selected?.has(org.id) ?? false;
        return (
          <li key={org.id} className="s-enter s-org-row-wrap">
            {selecting ? (
              <label
                className="s-org-check"
                data-checked={checked || undefined}
                title={org.link_status === "retired" ? UI.selectRetiredHint : undefined}
              >
                <input
                  type="checkbox"
                  className="s-checkbox"
                  checked={checked}
                  disabled={org.link_status === "retired"}
                  aria-label={UI.selectOrgNamed(org.name)}
                  onChange={() => onToggle?.(org.id)}
                />
              </label>
            ) : null}
            <Link
              href={`/sales/orgs/${encodeURIComponent(org.id)}`}
              data-testid={`org-row-${org.id}`}
              className="s-card s-org-row"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0 flex-1">
                  <span className="s-org-name">{org.name}</span>
                  {org.chain_name ? <span className="s-org-sub">{org.chain_name}</span> : null}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <OrgStateBadge state={orgStateKey(org.link_status, org.is_active_customer)} />
                  {org.has_open_lead ? <span className="s-badge s-badge-lead">{UI.orgOpenLead}</span> : null}
                </span>
              </span>
              <OrgMeta org={org} manager={manager} owners={owners} />
              <ChevronLeft size={16} aria-hidden className="s-org-chevron" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function OrgMeta({ org, manager, owners }: { org: OrgListRow; manager: boolean; owners: Record<string, string> }) {
  const parts: Array<[string, ReactNode]> = [];
  if (org.last_order_at) parts.push(["last", UI.orgLastOrder(fmtRelative(org.last_order_at))]);
  if (org.ex_vat_12m_agorot !== null && org.ex_vat_12m_agorot > 0) {
    // the amount isolated, so ₪ and the digits keep their order inside the Hebrew line (A11Y-B-010)
    parts.push(["value", <><bdi>{fmtAgorot(org.ex_vat_12m_agorot)}</bdi> {UI.orgValue12mSuffix} · {UI.exVat}</>]);
  }
  const owner = org.owner_email ? (owners[org.owner_email] ?? org.owner_email.split("@")[0]) : null;
  if (parts.length === 0 && !manager) return null;
  return (
    <span className="s-org-meta s-nums">
      {parts.map(([k, p]) => (
        <span key={k}>{p}</span>
      ))}
      {manager ? <span>{owner ? UI.orgOwner(owner) : UI.orgNoOwner}</span> : null}
    </span>
  );
}
