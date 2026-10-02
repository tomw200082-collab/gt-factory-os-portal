"use client";

// Who is this? The business opens on petrol: its whole name, the chain or the
// distributor it moved to, one state in words, the owner, and how current the
// Shopify numbers below are (tap for the source).

import { useEffect, useRef } from "react";
import { Info, Network, Truck, UserRound } from "lucide-react";
import { fmtDate, fmtDateTime, fmtPhone } from "../../_lib/format";
import { UI } from "../../_lib/labels";
import { cameFromSalesScreen } from "../../_lib/salesHistory";
import { BackLink } from "../BackLink";
import { historyShown, type HistoryView } from "../../_lib/orgTruth";
import type { OrgDetail } from "../../_lib/types";
import { OrgStateBadge, orgStateKey } from "../OrgStateBadge";

export interface OrgHeaderProps {
  org: OrgDetail;
  view: HistoryView;
  ownerName: string | null;
  onSource: () => void;
}

export function OrgHeader({ org, view, ownerName, onSource }: OrgHeaderProps) {
  const title = useRef<HTMLHeadingElement>(null);
  const name = org.header.name;
  // A tab says which business it holds (A11Y-B-004); arriving from another sales
  // screen, focus lands on the name so a screen reader announces where it is (A11Y-B-011).
  useEffect(() => {
    const before = document.title;
    document.title = UI.orgPageTitle(name);
    return () => {
      document.title = before;
    };
  }, [name]);
  useEffect(() => {
    if (cameFromSalesScreen(window.location.pathname)) title.current?.focus({ preventScroll: true });
  }, [org.header.id]);
  return (
    <header data-testid="org-header" className="s-opening s-org-band flex flex-col gap-3">
      <BackLink fallbackHref="/sales/orgs" fallbackLabel={UI.backToOrgs} testId="org-back" />

      <div className="flex flex-col gap-1.5">
        <h1 ref={title} tabIndex={-1} className="s-org-title">{org.header.name}</h1>
        {org.chain ? (
          <p className="s-org-line">
            <Network size={14} aria-hidden />
            <span>{UI.chainLine(org.chain.kind, org.chain.name, org.chain.branch_count)}</span>
          </p>
        ) : null}
        {org.moved ? (
          <p className="s-org-line" data-testid="org-moved">
            <Truck size={14} aria-hidden />
            <span>{UI.movedLine(org.moved.to, fmtDate(org.moved.on))}</span>
          </p>
        ) : null}
        {org.header.phone ? (
          <p className="s-org-line s-nums">
            <bdi dir="ltr">{fmtPhone(org.header.phone)}</bdi>
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <OrgStateBadge state={orgStateKey(org.link_status, historyShown(view) ? org.active : null)} />
        <span className="s-badge s-badge-glass">
          <UserRound size={13} aria-hidden />
          {ownerName ? UI.ownerLine(ownerName) : UI.orgNoOwner}
        </span>
        {historyShown(view) && org.as_of ? (
          <button type="button" className="s-fresh" onClick={onSource} aria-haspopup="dialog">
            <span className="s-badge s-badge-glass">
              <Info size={13} aria-hidden />
              <span className="s-nums">{UI.freshness(fmtDateTime(org.as_of))}</span>
            </span>
          </button>
        ) : null}
      </div>
    </header>
  );
}
