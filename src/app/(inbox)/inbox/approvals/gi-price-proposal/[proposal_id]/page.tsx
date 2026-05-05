"use client";

// gi_price_proposal Decision drawer — planner reviews proposed price-change
// and chooses Approve / Edit→Approve / Reject.
//
// Spec: docs/superpowers/specs/2026-05-04-inbox-typed-cards-and-price-proposals-design.md §1.5.1 + §1.14.5
// Plan: docs/superpowers/plans/2026-05-04-inbox-typed-cards-and-price-proposals.md Task 5.2

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  InboxCard,
  PrimaryActionButton,
  SecondaryActionButton,
} from "@/components/inbox/InboxCard";
import { PriceProposalBody } from "@/components/inbox/bodies/PriceProposalBody";
import { ACTION_DEFER, ACTION_REJECT, DIALOG_COPY } from "@/lib/inbox-copy";

type ActionMode = "approve" | "edit_approve" | "reject";

export default function GiPriceProposalDrawerPage() {
  const router = useRouter();
  const params = useParams<{ proposal_id: string }>();
  const proposalId = params.proposal_id;

  // Demo state: in production this would load via TanStack Query against
  // a /api/v1/queries/inbox/gi-price-proposal/:proposal_id endpoint that
  // returns the proposal row + supplier name + component name + last-change
  // context. For v1 the data is read from the underlying exception's
  // raw_payload->'key_facts' and rendered via the body component.
  const [actionMode, setActionMode] = useState<ActionMode>("approve");
  const [overridePrice, setOverridePrice] = useState<string>("");
  const [overrideReason, setOverrideReason] = useState<string>("");
  const [effectiveAt, setEffectiveAt] = useState<string>("");
  const [rejectReason, setRejectReason] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const approveMut = useMutation({
    mutationFn: async () => {
      const r = await fetch(
        `/api/v1/mutations/inbox/gi-price-proposal/${encodeURIComponent(proposalId)}/approve`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            idempotency_key: `gi-pp-approve:${proposalId}:${Date.now()}`,
          }),
        },
      );
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => router.push("/inbox"),
    onError: (err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
  });

  const editApproveMut = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        idempotency_key: `gi-pp-edit-approve:${proposalId}:${Date.now()}`,
        override_unit_price_net: Number(overridePrice),
        override_reason: overrideReason,
      };
      if (effectiveAt) body.effective_at = effectiveAt;
      const r = await fetch(
        `/api/v1/mutations/inbox/gi-price-proposal/${encodeURIComponent(proposalId)}/edit-approve`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => router.push("/inbox"),
    onError: (err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
  });

  const rejectMut = useMutation({
    mutationFn: async () => {
      const r = await fetch(
        `/api/v1/mutations/inbox/gi-price-proposal/${encodeURIComponent(proposalId)}/reject`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            idempotency_key: `gi-pp-reject:${proposalId}:${Date.now()}`,
            rejection_reason: rejectReason,
          }),
        },
      );
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => router.push("/inbox"),
    onError: (err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
  });

  // Demo body data — wire to real proposal fetch when LIST endpoint exists.
  const demoBody = {
    currentPrice: 0.842,
    proposedPrice: 0.891,
    pctDelta: 0.058,
    absDelta: 0.049,
    confidence: "HIGH" as const,
    supplierName: "מיקי מדבקות",
    componentName: "אריזת מדבקה 30 מ\"מ",
  };

  return (
    <main className="mx-auto max-w-2xl py-6 space-y-4" dir="rtl">
      <header>
        <h1 className="text-lg font-semibold">שינוי מחיר ספק</h1>
        <p className="text-xs text-slate-500" dir="ltr">
          proposal_id={proposalId}
        </p>
      </header>

      <InboxCard
        cardType="decision"
        subtype="gi_price_proposal"
        severity="info"
        subject={`${demoBody.supplierName} · ${demoBody.componentName}`}
        createdAt={new Date().toISOString()}
        status="open"
        keyFacts={[
          { label: "נוכחי", value: `₪${demoBody.currentPrice.toFixed(3)}` },
          { label: "מוצע", value: `₪${demoBody.proposedPrice.toFixed(3)}` },
          {
            label: "דלתא",
            value: `+${(demoBody.pctDelta * 100).toFixed(1)}%`,
          },
          { label: "ביטחון", value: "גבוה" },
        ]}
        mode="drawer"
        auditStrip={`proposal_id=${proposalId} · ${new Date().toISOString()}`}
        actions={
          <>
            {actionMode === "approve" ? (
              <PrimaryActionButton
                onClick={() => {
                  setError(null);
                  approveMut.mutate();
                }}
                disabled={approveMut.isPending}
              >
                {DIALOG_COPY.approveConfirm}
              </PrimaryActionButton>
            ) : null}
            {actionMode === "edit_approve" ? (
              <PrimaryActionButton
                onClick={() => {
                  setError(null);
                  if (
                    !overridePrice ||
                    !overrideReason ||
                    Number(overridePrice) < 0
                  ) {
                    setError("override_unit_price_net + override_reason required");
                    return;
                  }
                  editApproveMut.mutate();
                }}
                disabled={editApproveMut.isPending}
              >
                ערוך ואשר
              </PrimaryActionButton>
            ) : null}
            {actionMode === "reject" ? (
              <PrimaryActionButton
                onClick={() => {
                  setError(null);
                  if (!rejectReason) {
                    setError(DIALOG_COPY.rejectReasonPlaceholder);
                    return;
                  }
                  rejectMut.mutate();
                }}
                disabled={rejectMut.isPending}
              >
                {DIALOG_COPY.rejectConfirm}
              </PrimaryActionButton>
            ) : null}
            <SecondaryActionButton onClick={() => setActionMode("approve")}>
              {DIALOG_COPY.approveConfirm}
            </SecondaryActionButton>
            <SecondaryActionButton onClick={() => setActionMode("edit_approve")}>
              ערוך ואשר
            </SecondaryActionButton>
            <SecondaryActionButton onClick={() => setActionMode("reject")}>
              {ACTION_REJECT}
            </SecondaryActionButton>
            <SecondaryActionButton onClick={() => router.push("/inbox")}>
              {ACTION_DEFER}
            </SecondaryActionButton>
          </>
        }
      >
        <PriceProposalBody data={demoBody} />

        {/* Edit→Approve form — visible only when chosen. */}
        {actionMode === "edit_approve" ? (
          <div className="mt-4 space-y-2 border-t border-slate-200 pt-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">
                {DIALOG_COPY.editApproveOverridePlaceholder}
              </label>
              <input
                type="number"
                step="0.0001"
                min="0"
                value={overridePrice}
                onChange={(e) => setOverridePrice(e.target.value)}
                dir="ltr"
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">
                {DIALOG_COPY.editApproveReasonPlaceholder}
              </label>
              <input
                type="text"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">
                {DIALOG_COPY.editApproveEffectiveAtPlaceholder}
              </label>
              <input
                type="datetime-local"
                value={effectiveAt}
                onChange={(e) => setEffectiveAt(e.target.value)}
                dir="ltr"
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
            </div>
          </div>
        ) : null}

        {actionMode === "reject" ? (
          <div className="mt-4 space-y-2 border-t border-slate-200 pt-3">
            <label className="text-xs text-slate-500 block mb-1">
              {DIALOG_COPY.rejectReasonPlaceholder}
            </label>
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
        ) : null}

        {error ? (
          <p className="text-sm text-red-700 bg-red-50 rounded-md p-2 mt-3">
            {error}
          </p>
        ) : null}
      </InboxCard>
    </main>
  );
}
