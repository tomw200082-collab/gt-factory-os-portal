"use client";

// One state per business, in words with an icon: never colour alone (D1 V5).
//
// The state comes from the link status first, because nothing derived from
// Shopify is true for an org whose link is not verified (gate 4). Only a
// verified link may say "active" or "not active", and only when the server
// sent that label (it withholds it while history is unpublished).

import { Archive, BadgeCheck, CircleDashed, Moon, ShieldAlert, ShieldQuestion } from "lucide-react";
import { ORG_STATE_LABELS, type OrgStateKey } from "../_lib/labels";
import type { LinkStatus } from "../_lib/types";

export function orgStateKey(link: LinkStatus, active: boolean | null): OrgStateKey {
  if (link === "retired") return "retired";
  if (link === "review") return "review";
  if (link === "disputed") return "disputed";
  if (link === "verified") return active === true ? "active" : active === false ? "inactive" : "verifiedNoHistory";
  return "prospect";
}

const ICONS = {
  active: BadgeCheck,
  inactive: Moon,
  verifiedNoHistory: BadgeCheck,
  prospect: CircleDashed,
  review: ShieldQuestion,
  disputed: ShieldAlert,
  retired: Archive,
} as const;

const TONE: Record<OrgStateKey, string> = {
  active: "s-badge-active",
  inactive: "s-badge-customer",
  verifiedNoHistory: "s-badge-customer",
  prospect: "s-badge-prospect",
  review: "s-badge-review",
  disputed: "s-badge-review",
  retired: "s-badge-retired",
};

export function OrgStateBadge({ state }: { state: OrgStateKey }) {
  const Icon = ICONS[state];
  return (
    <span data-testid="org-state" data-state={state} className={`s-badge ${TONE[state]} shrink-0`}>
      <Icon size={13} aria-hidden />
      {ORG_STATE_LABELS[state]}
    </span>
  );
}
