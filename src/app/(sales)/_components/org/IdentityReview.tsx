"use client";

// The managers' identity review (GT Pulse Unit B, spec §3.6 "Manager resolution").
//
// Each card is one business whose Shopify link waits for a person: why, in
// plain words, and the candidate customers side by side, their numbers marked
// as evidence for the decision, never as the business's own history. Only the
// actions the API accepts for those reasons are offered, and each one asks
// first and says exactly what will change. A card the portal cannot resolve
// (the held customer is not in the mirror) says so instead of offering a
// button that would only fail.

import { useCallback, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, Lock, ShieldAlert, ShieldQuestion } from "lucide-react";
import { useSession } from "@/lib/auth/session-provider";
import { useIdentityReview, useResolveIdentity } from "../../_lib/api";
import { fmtDate, fmtDateTime } from "../../_lib/format";
import { UI, exceptionLabel, identityReasonLabel } from "../../_lib/labels";
import { useAutoClear } from "../../_lib/useAutoClear";
import type { Candidate, IdentityAction, IdentityOrg } from "../../_lib/types";
import { ListEmpty, QueueError } from "../EmptyStates";
import { Toast } from "../Toast";
import { Sheet } from "./Sheet";

const LINK_REASONS = new Set(["id_unproven", "phone_shared", "chain_branch"]);
const CHAIN = "chain_rule_hit";

type Pending =
  | { kind: "link"; org: IdentityOrg; candidate: Candidate; action: IdentityAction }
  | { kind: "reject"; org: IdentityOrg }
  | { kind: "chain"; org: IdentityOrg };

/** What the API will accept for this card (mirrors orgs_handler.ts resolveIdentity). */
export function actionsFor(org: IdentityOrg): { pick: boolean; reject: boolean; chain: boolean; blocked: boolean } {
  const identity = org.reasons.filter((r) => r !== CHAIN);
  if (identity.length === 0) return { pick: false, reject: false, chain: true, blocked: false };
  if (org.candidates.length === 0) return { pick: false, reject: false, chain: false, blocked: true };
  const allLink = identity.every((r) => LINK_REASONS.has(r));
  return { pick: true, reject: allLink, chain: false, blocked: false };
}

export function IdentityReview() {
  const { session } = useSession();
  const manager = session?.role === "admin" || session?.role === "planner";
  const review = useIdentityReview(manager);
  const resolve = useResolveIdentity();
  const [pending, setPending] = useState<Pending | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  useAutoClear(toast, clearToast);

  if (!manager) {
    return (
      <div data-testid="review-forbidden" role="alert" className="s-card flex flex-col items-center gap-3 px-6 py-12 text-center">
        <span className="s-empty-icon" aria-hidden><Lock size={26} /></span>
        <p className="text-lg font-semibold" style={{ color: "hsl(var(--s-fg))" }}>{UI.reviewForbiddenTitle}</p>
        <p className="text-[14px]" style={{ color: "hsl(var(--s-fg-muted))" }}>{UI.reviewForbiddenHint}</p>
        <Link href="/sales/orgs" className="s-btn s-btn-ghost">{UI.backToOrgs}</Link>
      </div>
    );
  }

  function run(p: Pending) {
    const orgId = p.org.org_id;
    const vars =
      p.kind === "link"
        ? { orgId, action: p.action, customer_gid: p.candidate.customer_gid }
        : { orgId, action: (p.kind === "reject" ? "reject" : "confirm") as IdentityAction };
    setErrors((e) => ({ ...e, [orgId]: "" }));
    resolve.mutate(vars, {
      onSuccess: (result) => {
        const name = p.org.name;
        setToast(
          p.kind === "reject" ? UI.reviewRejected(name)
            : p.kind === "chain" ? UI.reviewChained(name)
            : result.merged_into ? UI.reviewMerged(name)
            : UI.reviewLinked(name),
        );
      },
      onError: (err) => setErrors((e) => ({ ...e, [orgId]: err.message })),
    });
  }

  const data = review.data;

  return (
    <div className="flex flex-col gap-4">
      <header className="s-opening s-opening-compact flex flex-col gap-2">
        <Link href="/sales/orgs" className="s-org-back">
          <ChevronRight size={16} aria-hidden />
          {UI.backToOrgs}
        </Link>
        <h1 className="font-semibold" style={{ color: "hsl(var(--s-fg))" }}>{UI.reviewTitle}</h1>
        <p className="text-[14px] leading-relaxed" style={{ color: "hsl(var(--s-fg-muted))" }}>{UI.reviewIntro}</p>
        {data?.coverage ? (
          <p data-testid="review-coverage" className="s-nums text-[13px]" style={{ color: "hsl(var(--s-fg))" }}>
            {UI.reviewCoverage(data.coverage.verified_active, data.coverage.census_active)}
            <span className="block text-[12px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
              {UI.reviewCoverageSource} · <bdi>{fmtDateTime(data.coverage.as_of)}</bdi>
            </span>
          </p>
        ) : null}
        {data ? (
          <p className="s-nums text-[13px] font-medium" style={{ color: "hsl(var(--s-fg))" }}>{UI.reviewCount(data.orgs.length)}</p>
        ) : null}
      </header>

      {review.isLoading ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <span className="sr-only">{UI.loading}</span>
          {[0, 1].map((i) => <div key={i} aria-hidden className="s-panel animate-pulse" style={{ height: 220 }} />)}
        </div>
      ) : null}
      {review.isError ? <QueueError onRetry={() => void review.refetch()} what={UI.reviewTitle} /> : null}

      {data && data.orgs.length === 0 ? (
        <div data-testid="review-empty">
          <ListEmpty label={UI.reviewEmpty} />
        </div>
      ) : null}

      {data?.orgs.map((org) => (
        <ReviewCard
          key={org.org_id}
          org={org}
          busy={resolve.isPending && resolve.variables?.orgId === org.org_id}
          error={errors[org.org_id] ?? ""}
          onAsk={setPending}
        />
      ))}

      {data ? (
        <section data-testid="review-exceptions" aria-labelledby="review-exceptions-title" className="s-panel">
          <h2 id="review-exceptions-title" className="s-section-heading">{UI.exceptionsTitle}</h2>
          {data.exceptions.length === 0 ? (
            <p className="mt-2 text-[14px]" style={{ color: "hsl(var(--s-fg-muted))" }}>{UI.exceptionsEmpty}</p>
          ) : (
            <ul className="mt-2 flex flex-col">
              {data.exceptions.map((x) => (
                <li key={x.id} className="s-field flex items-start gap-2">
                  <AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0" style={{ color: "hsl(var(--s-review))" }} />
                  <span className="min-w-0 flex-1 text-[14px]" style={{ color: "hsl(var(--s-fg))" }}>{exceptionLabel(x.kind)}</span>
                  <time dateTime={x.created_at} className="s-nums shrink-0 text-[12px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
                    {fmtDateTime(x.created_at)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {pending ? (
        <Sheet
          alert
          testId="review-confirm"
          title={
            pending.kind === "link" ? UI.linkTitle(pending.org.name, pending.candidate.name ?? UI.candidateUnnamed)
              : pending.kind === "reject" ? UI.rejectTitle(pending.org.name)
              : UI.chainTitle(pending.org.name)
          }
          onClose={() => setPending(null)}
          footer={
            <>
              <button
                type="button"
                className={`s-btn ${pending.kind === "reject" ? "s-btn-danger-quiet" : "s-btn-primary"}`}
                onClick={() => {
                  run(pending);
                  setPending(null);
                }}
              >
                {pending.kind === "link" ? UI.linkConfirm : pending.kind === "reject" ? UI.rejectConfirm : UI.chainConfirm}
              </button>
              <button type="button" className="s-btn s-btn-ghost" onClick={() => setPending(null)}>{UI.cancel}</button>
            </>
          }
        >
          <p className="text-[15px] leading-relaxed" style={{ color: "hsl(var(--s-fg))" }}>
            {pending.kind === "link" ? UI.linkConsequence : pending.kind === "reject" ? UI.rejectConsequence : UI.chainConsequence}
          </p>
          {pending.kind === "link" ? <CandidateFacts candidate={pending.candidate} /> : null}
        </Sheet>
      ) : null}

      {toast ? <Toast message={toast} onClose={clearToast} /> : null}
    </div>
  );
}

function ReviewCard({ org, busy, error, onAsk }: { org: IdentityOrg; busy: boolean; error: string; onAsk: (p: Pending) => void }) {
  const a = actionsFor(org);
  const disputed = org.link_status === "disputed";
  const Icon = disputed ? ShieldAlert : ShieldQuestion;
  return (
    <article data-testid={`review-${org.org_id}`} aria-labelledby={`review-${org.org_id}-name`} className="s-panel s-review-card" aria-busy={busy || undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`review-${org.org_id}-name`} className="text-[17px] font-semibold leading-snug [overflow-wrap:anywhere]">
            <Link href={`/sales/orgs/${encodeURIComponent(org.org_id)}`} className="s-review-name" aria-label={UI.openOrg(org.name)}>
              {org.name}
            </Link>
          </h2>
          <p className="s-nums mt-0.5 text-[12px]" style={{ color: "hsl(var(--s-fg-muted))" }}>{UI.reviewSince(fmtDate(org.created_at))}</p>
        </div>
        <span className="s-badge s-badge-review shrink-0">
          <Icon size={13} aria-hidden />
          {disputed ? UI.identityDisputedTitle : UI.identityReviewTitle}
        </span>
      </div>

      <ul className="mt-2 flex flex-col gap-1 text-[14px]" style={{ color: "hsl(var(--s-fg))" }}>
        {org.reasons.map((r) => (
          <li key={r} className="flex items-start gap-1.5">
            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "hsl(var(--s-review))" }} />
            {identityReasonLabel(r)}
          </li>
        ))}
      </ul>

      {a.blocked ? (
        <p className="s-banner s-banner-review mt-3 text-[13px]">{UI.reviewBlocked}</p>
      ) : null}

      {org.candidates.length > 0 ? (
        <>
          <h3 className="s-eyebrow mt-4">{UI.candidatesTitle}</h3>
          <p className="text-[12px]" style={{ color: "hsl(var(--s-fg-muted))" }}>{UI.candidateEvidence}</p>
          <div className="s-candidates mt-2">
            {org.candidates.map((c) => (
              <div key={c.customer_gid} data-testid="candidate" className="s-candidate">
                <CandidateFacts candidate={c} />
                {a.pick ? (
                  <button
                    type="button"
                    className="s-btn s-btn-primary mt-3 w-full"
                    disabled={busy}
                    onClick={() => onAsk({ kind: "link", org, candidate: c, action: c.basis === "held" ? "confirm" : "pick" })}
                  >
                    {a.reject ? UI.chooseCandidate : UI.confirmCustomer}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </>
      ) : null}

      {a.reject || a.chain ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {a.reject ? (
            <button type="button" className="s-btn s-btn-danger-quiet" disabled={busy} onClick={() => onAsk({ kind: "reject", org })}>
              {UI.rejectAll}
            </button>
          ) : null}
          {a.chain ? (
            <button type="button" className="s-btn s-btn-primary" disabled={busy} onClick={() => onAsk({ kind: "chain", org })}>
              {UI.confirmChain}
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-[13px]" style={{ color: "hsl(var(--s-danger-quiet))" }}>{error}</p>
      ) : null}
    </article>
  );
}

function CandidateFacts({ candidate }: { candidate: Candidate }) {
  return (
    <div className="min-w-0">
      <p className="text-[15px] font-medium [overflow-wrap:anywhere]" style={{ color: "hsl(var(--s-fg))" }}>
        {candidate.name ?? UI.candidateUnnamed}
      </p>
      <p className="mt-0.5 text-[12px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
        {candidate.basis === "held" ? UI.candidateHeld : UI.candidatePhone}
      </p>
      <p className="s-nums mt-1 text-[13px]" style={{ color: "hsl(var(--s-fg))" }}>
        {candidate.order_count > 0 ? UI.candidateOrders(candidate.order_count) : UI.candidateNoOrders}
        {candidate.last_order_at ? ` · ${UI.candidateLast(fmtDate(candidate.last_order_at))}` : ""}
      </p>
    </div>
  );
}
