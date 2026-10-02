"use client";

// The workspace's whole-page states and its banners.
//
// A forbidden business and a missing one read the same to a rep (the API
// answers 403 for both), so the words cannot tell them apart either. A manager
// is told when a business does not exist.

import Link from "next/link";
import { Archive, Clock3, Lock, SearchX, ShieldAlert, ShieldQuestion } from "lucide-react";
import { fmtDateTime } from "../../_lib/format";
import { UI, identityReasonLabel } from "../../_lib/labels";
import type { OrgDetail } from "../../_lib/types";

function PageState({ testId, icon, title, hint }: { testId: string; icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div data-testid={testId} role="alert" className="s-card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="s-empty-icon" aria-hidden>{icon}</span>
      <div>
        <p className="text-lg font-semibold" style={{ color: "hsl(var(--s-fg))" }}>{title}</p>
        <p className="mt-1 text-[14px]" style={{ color: "hsl(var(--s-fg-muted))" }}>{hint}</p>
      </div>
      <Link href="/sales/orgs" className="s-btn s-btn-ghost">{UI.backToOrgs}</Link>
    </div>
  );
}

export function OrgForbidden() {
  return <PageState testId="org-forbidden" icon={<Lock size={26} />} title={UI.orgForbiddenTitle} hint={UI.orgForbiddenHint} />;
}

export function OrgNotFound() {
  return <PageState testId="org-not-found" icon={<SearchX size={26} />} title={UI.orgNotFoundTitle} hint={UI.orgNotFoundHint} />;
}

/** Skeleton in the shape of the first viewport: band, then three panels. */
export function OrgLoading() {
  return (
    <div data-testid="org-loading" className="flex flex-col gap-4" aria-busy="true">
      <span className="sr-only">{UI.orgLoading}</span>
      <div aria-hidden className="s-opening animate-pulse" style={{ height: 168 }} />
      {[132, 120, 150].map((h, i) => (
        <div key={i} aria-hidden className="s-panel animate-pulse" style={{ height: h }} />
      ))}
    </div>
  );
}

export function StaleBanner({ asOf }: { asOf: string | null }) {
  return (
    <div data-testid="history-banner" role="status" className="s-banner s-banner-review">
      <Clock3 size={18} aria-hidden />
      <div>
        <p className="font-semibold">{UI.historyStaleTitle}</p>
        {asOf ? <p className="s-nums mt-0.5 text-[13px]">{UI.historyStaleHint(fmtDateTime(asOf))}</p> : null}
      </div>
    </div>
  );
}

export function IdentityBanner({ org, manager }: { org: OrgDetail; manager: boolean }) {
  const disputed = org.link_status === "disputed";
  const Icon = disputed ? ShieldAlert : ShieldQuestion;
  return (
    <div data-testid="identity-banner" role="status" className="s-banner s-banner-review">
      <Icon size={18} aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold">{disputed ? UI.identityDisputedTitle : UI.identityReviewTitle}</p>
        <p className="mt-0.5 text-[13px]">{UI.identityReviewHint}</p>
        {manager && org.identity?.reasons.length ? (
          <ul className="mt-1 list-inside list-disc text-[13px]">
            {org.identity.reasons.map((r) => (
              <li key={r}>{identityReasonLabel(r)}</li>
            ))}
          </ul>
        ) : null}
        {manager ? (
          <Link href="/sales/orgs/review" className="s-link text-[13px]">{UI.identityOpenReview}</Link>
        ) : null}
      </div>
    </div>
  );
}

export function RetiredBanner({ org }: { org: OrgDetail }) {
  return (
    <div data-testid="retired-banner" role="status" className="s-banner s-banner-retired">
      <Archive size={18} aria-hidden />
      <div className="min-w-0">
        {org.merged_into ? (
          <>
            <p className="font-semibold">{UI.retiredMerged(org.merged_into.name)}</p>
            <Link href={`/sales/orgs/${encodeURIComponent(org.merged_into.id)}`} className="s-btn s-btn-primary mt-2">
              {UI.retiredGo(org.merged_into.name)}
            </Link>
          </>
        ) : (
          <p className="font-semibold">{UI.retiredClosed}</p>
        )}
      </div>
    </div>
  );
}
