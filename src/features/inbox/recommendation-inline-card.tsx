"use client";

// ---------------------------------------------------------------------------
// RecommendationInlineCard — inline approve / dismiss panel for planning
// recommendation rows on the /inbox list (production & purchase).
//
// Pattern: mirrors ApprovalInlineCard (waste / physical-count). It lets a
// planner approve or dismiss a recommendation directly from the Inbox instead
// of deep-linking to the run / recommendation-detail page, which is the only
// path that existed before (the rec rows previously rendered a "Review" link
// and no inline action — features/inbox/client.ts set inline_actions: []).
//
// Supported types:
//   approval:production_recommendation → POST /api/planning/recommendations/:id/{approve,dismiss}
//   approval:purchase_recommendation   → same endpoints
//
// IMPORTANT — stock-truth note: approving a recommendation is a PLANNING
// decision only. The upstream handler (api/src/planning/handler.actions.ts
// handleApproveRecommendation) just flips recommendation_status to 'approved'
// inside a form_submissions envelope; it writes NOTHING to stock_ledger.
// Dismissing flips it to 'dismissed'. Neither touches stock truth.
//
// Request body is exactly { idempotency_key } — the same proven shape used by
// the recommendation detail page (postRecAction). No reason field is sent, to
// stay within the validated contract.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Factory, ShoppingCart } from "lucide-react";
import type { InboxRow } from "@/features/inbox/types";

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `rec_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

type RecAction = "approve" | "dismiss";

type Outcome =
  | { kind: "approved" }
  | { kind: "dismissed" }
  | { kind: "conflict"; detail: string }
  | { kind: "error"; message: string };

async function postRecAction(recId: string, action: RecAction): Promise<Outcome> {
  try {
    const res = await fetch(
      `/api/planning/recommendations/${encodeURIComponent(recId)}/${action}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotency_key: newIdempotencyKey() }),
      },
    );
    const body = (await res.json().catch(() => undefined)) as
      | { detail?: string }
      | undefined;
    if (res.status === 200) {
      return { kind: action === "approve" ? "approved" : "dismissed" };
    }
    if (res.status === 409) {
      return {
        kind: "conflict",
        detail:
          body?.detail ??
          "ההמלצה כבר טופלה (אושרה או נדחתה) — לא ניתן לפעול עליה שוב.",
      };
    }
    return { kind: "error", message: "הפעולה נכשלה. בדוק את החיבור ונסה שוב." };
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

/** Defensive read of the recommended quantity off the untyped raw row. */
function readRecommendedQty(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const v = r.recommended_qty ?? r.required_qty;
  if (v == null) return null;
  const n = Number(v);
  if (Number.isNaN(n)) return null;
  return String(n);
}

export function RecommendationInlineCard({ row }: { row: InboxRow }) {
  const recId = row.id;
  const isProduction = row.type === "approval:production_recommendation";
  const [busy, setBusy] = useState<RecAction | null>(null);
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const qc = useQueryClient();

  // FLOW-A / FLOW-E: approving or dismissing here flips recommendation_status
  // server-side. Without invalidation the downstream surfaces stay stale — the
  // Procurement convert-queue keeps showing a not-yet-approved rec (or hides a
  // just-approved one), the rec-detail drill-down shows the old status, and the
  // run / planning-overview counts lag. Refresh them all on a real outcome.
  function invalidateAfterRecAction() {
    void qc.invalidateQueries({ queryKey: ["procurement", "approved-purchase-recs"] });
    void qc.invalidateQueries({ queryKey: ["rec-detail", recId] });
    void qc.invalidateQueries({ queryKey: ["planning"] });
    void qc.invalidateQueries({ queryKey: ["inbox"] });
  }

  const qty = readRecommendedQty(row.raw);

  if (outcome?.kind === "approved") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mt-3 flex items-center gap-2 rounded-md border border-success/40 bg-success-subtle/30 px-3 py-2.5 text-sm text-success-fg"
        data-testid="rec-inline-success"
      >
        <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2} />
        ההמלצה אושרה
      </div>
    );
  }
  if (outcome?.kind === "dismissed") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mt-3 flex items-center gap-2 rounded-md border border-border/60 bg-bg-subtle/50 px-3 py-2.5 text-sm text-fg-muted"
        data-testid="rec-inline-dismissed"
      >
        <XCircle className="h-4 w-4 shrink-0" strokeWidth={2} />
        ההמלצה נדחתה
      </div>
    );
  }
  if (outcome?.kind === "conflict" || outcome?.kind === "error") {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="mt-3 rounded-md border border-warning/40 bg-warning-softer px-3 py-2.5 text-sm text-warning-fg"
        data-testid="rec-inline-problem"
      >
        {outcome.kind === "conflict" ? outcome.detail : outcome.message}
      </div>
    );
  }

  const TypeIcon = isProduction ? Factory : ShoppingCart;

  return (
    <div
      className="mt-3 space-y-3 rounded-md border border-warning/30 bg-warning-softer/40 p-4"
      data-testid="rec-inline-card"
    >
      <div className="flex flex-wrap items-center gap-2 text-sm text-fg">
        <TypeIcon className="h-4 w-4 shrink-0 text-warning" strokeWidth={2} />
        <span className="font-medium text-fg-strong">
          {isProduction ? "המלצת ייצור" : "המלצת רכש"}
        </span>
        {qty ? (
          <span className="text-fg-muted">
            · כמות מומלצת: <span className="font-medium text-fg">{qty}</span>
          </span>
        ) : null}
      </div>

      {!confirmDismiss ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-sm btn-primary gap-1.5"
            data-testid="rec-inline-approve"
            disabled={busy !== null}
            onClick={async () => {
              setBusy("approve");
              const result = await postRecAction(recId, "approve");
              setOutcome(result);
              if (result.kind === "approved") invalidateAfterRecAction();
              setBusy(null);
            }}
          >
            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.25} />
            {busy === "approve" ? "שולח…" : "אשר"}
          </button>
          <button
            type="button"
            className="btn btn-sm border-danger/40 text-danger hover:bg-danger-softer"
            data-testid="rec-inline-dismiss-open"
            disabled={busy !== null}
            onClick={() => setConfirmDismiss(true)}
          >
            דחה
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-danger/40 bg-danger-softer/60 p-3">
          <span className="text-sm text-danger-fg">לדחות את ההמלצה?</span>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            data-testid="rec-inline-dismiss-confirm"
            disabled={busy !== null}
            onClick={async () => {
              setBusy("dismiss");
              const result = await postRecAction(recId, "dismiss");
              setOutcome(result);
              if (result.kind === "dismissed") invalidateAfterRecAction();
              setBusy(null);
            }}
          >
            {busy === "dismiss" ? "שולח…" : "אשר דחיה"}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy !== null}
            onClick={() => setConfirmDismiss(false)}
          >
            ביטול
          </button>
        </div>
      )}
    </div>
  );
}
