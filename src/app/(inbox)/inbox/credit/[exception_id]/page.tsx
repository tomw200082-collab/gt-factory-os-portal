"use client";

// ---------------------------------------------------------------------------
// /inbox/credit/[exception_id] — credit-needed detail page.
//
// Originally authored under Mode B-LionWheelCreditInbox-NightRun (2026-04-30,
// plan §Chunk 5b) with 503 NOT_YET_WIRED stubs. Wave 3 Chunk C.3
// (Mode B-LionWheelCreditDecisionPortal, 2026-05-02) flipped the proxies
// to live `proxyRequest` calls now that signal #28
// RUNTIME_READY(LionWheelCreditDecisionBackend) authorizes the swap.
//
// Consumes the W4 Doc B DTO
// (`docs/integrations/lionwheel_credit_inbox_contract.md`) verbatim and
// surfaces the four-fact card (Tom-locked per Doc B §7) plus three inline
// actions:
//   - אשר זיכוי (Approve)    — planner+admin (Doc B §3.2);
//                               persists state='pending_gi_action' (SC-A3:
//                               no Green Invoice call)
//   - דחה זיכוי  (Reject)     — planner+admin (Doc B §3.3); reason ≥5 chars
//   - ראיתי       (Acknowledge) — operator+planner+admin (Doc B §3.1)
//
// HTTP status mapping (per Wave 3 dispatch + W4 Doc B §3 + W1 schemas):
//   200/201            success → Hebrew register success banner
//   201 idempotent_replay  silent re-success (treat as 200)
//   401                redirect to /login
//   403                "אין הרשאה — נדרש planner או admin"
//   409 EXCEPTION_NOT_PENDING        "הבקשה כבר טופלה"
//   409 EXCEPTION_WRONG_CATEGORY    defensive (page guards on category already)
//   422 reason validation             inline error on reject panel
//   503 break-glass                  "בעיה זמנית — נסה שוב בעוד דקה"
//
// Acknowledge wires through the existing /api/exceptions/[id]/acknowledge
// endpoint (Doc B §3.1 explicitly notes "existing inbox handler from
// gate3_exceptions_inbox_evidence.md").
//
// Until the first lionwheel_credit_needed row arrives in production
// (post-soak), this page returns a clean "exception not found" empty state.
// ---------------------------------------------------------------------------

import { useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { useSession } from "@/lib/auth/session-provider";
import { useCapability } from "@/lib/auth/role-gate";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { NotesBox } from "@/components/fields/NotesBox";

import {
  CreditNeededFactCard,
  extractCreditNeededPayload,
  type CreditNeededDetailPayload,
} from "@/features/inbox/credit-card";
import {
  acknowledgeException,
  newIdempotencyKey,
} from "@/features/inbox/actions";

// ---------------------------------------------------------------------------
// Upstream exception row shape — same as features/inbox/client.ts but kept
// local because we read the credit-specific status lifecycle (W4 Doc B §3.4
// state machine: open → acknowledged | pending_gi_action | gi_draft_created
// | gi_action_failed | resolved | auto_resolved).
// ---------------------------------------------------------------------------
type CreditExceptionStatus =
  | "open"
  | "acknowledged"
  | "resolved"
  | "auto_resolved"
  | "pending_gi_action"
  | "gi_draft_created"
  | "gi_action_failed";

interface CreditExceptionRow {
  exception_id: string;
  category: string;
  severity: "info" | "warning" | "critical";
  source: string;
  title: string | null;
  detail: string | null;
  status: CreditExceptionStatus;
  created_at: string;
  resolved_at?: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  // Some backends pass the structured payload directly:
  detail_payload?: CreditNeededDetailPayload;
}

// W4 Doc B §6 — Tom-locked Hebrew status labels.
const STATUS_LABEL_HE: Record<CreditExceptionStatus, string> = {
  open: "פתוח",
  acknowledged: "ראיתי",
  resolved: "נסגר",
  auto_resolved: "נסגר אוטומטית",
  pending_gi_action: "ממתין לאישור",
  gi_draft_created: "נוצר זיכוי",
  gi_action_failed: "לא נוצר זיכוי עדיין",
};

// ---------------------------------------------------------------------------
// HTTP response → discriminated outcome mapping. Per Wave 3 dispatch +
// W4 Doc B §3 + W1 backend schemas.ts CreditDecisionConflictReason union.
//
// Note: 201 with idempotent_replay=true is treated as silent success (kind=ok)
// — same outcome as a fresh 201 from the operator's perspective.
//
// `kind: "auth_required"` triggers a redirect to /login at the call-site
// (handles session expiry mid-action without surfacing a confusing toast).
// ---------------------------------------------------------------------------
type CreditActionOutcome =
  | { kind: "ok"; data: { decision_id?: string; idempotent_replay?: boolean } }
  | { kind: "auth_required" }
  | { kind: "forbidden" }
  | { kind: "validation_error"; message: string }
  | { kind: "not_pending" }
  | { kind: "wrong_category" }
  | { kind: "transient"; message: string }
  | { kind: "error"; message: string };

// W1 backend body shape (api/src/inbox/credit_decisions/schemas.ts):
//   request:  { idempotency_key, reason? }   on approve
//             { idempotency_key, reason }    on reject (reason ≥5 chars)
//   response success: { exception_id, decision_id, status, decided_at,
//                       decided_by_user_id, decided_by_snapshot,
//                       idempotent_replay }
//   conflict 409:    { reason_code: 'EXCEPTION_NOT_FOUND'|'EXCEPTION_WRONG_CATEGORY'
//                                  |'EXCEPTION_NOT_PENDING'|'IDEMPOTENCY_KEY_REUSED',
//                       detail, current_status?, current_category? }
// exception_id is in the URL — NOT in the body.
async function postCreditAction(
  endpoint: "approve" | "reject",
  exceptionId: string,
  body: { idempotency_key: string; reason?: string },
  fallbackErrorHe: string,
): Promise<CreditActionOutcome> {
  let res: Response;
  try {
    res = await fetch(
      `/api/inbox/credit/${encodeURIComponent(exceptionId)}/${endpoint}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  } catch (err) {
    return {
      kind: "error",
      message: err instanceof Error ? err.message : fallbackErrorHe,
    };
  }

  const responseBody = (await res.json().catch(() => ({}))) as {
    error?: string;
    detail?: string;
    message?: string;
    reason_code?: string;
    decision_id?: string;
    idempotent_replay?: boolean;
    validation_errors?: Array<{ message?: string }>;
  };

  if (res.ok) {
    return {
      kind: "ok",
      data: {
        decision_id: responseBody.decision_id,
        idempotent_replay: responseBody.idempotent_replay,
      },
    };
  }
  if (res.status === 401) return { kind: "auth_required" };
  if (res.status === 403) return { kind: "forbidden" };
  if (res.status === 422) {
    const firstFieldMessage =
      responseBody.validation_errors?.[0]?.message ??
      responseBody.detail ??
      responseBody.message ??
      fallbackErrorHe;
    return { kind: "validation_error", message: firstFieldMessage };
  }
  if (res.status === 409) {
    const code = responseBody.reason_code;
    if (code === "EXCEPTION_NOT_PENDING") return { kind: "not_pending" };
    if (code === "EXCEPTION_WRONG_CATEGORY") return { kind: "wrong_category" };
    // IDEMPOTENCY_KEY_REUSED is treated as silent re-success by the W1
    // handler (returns 201 with idempotent_replay=true), so it should never
    // reach this branch. EXCEPTION_NOT_FOUND falls through to generic error.
    return {
      kind: "error",
      message:
        responseBody.detail ?? responseBody.message ?? fallbackErrorHe,
    };
  }
  if (res.status === 503) {
    return { kind: "transient", message: "בעיה זמנית — נסה שוב בעוד דקה." };
  }
  return {
    kind: "error",
    message: responseBody.detail ?? responseBody.message ?? fallbackErrorHe,
  };
}

// W4 Doc B §3.2 — Approve.
function postApprove(exceptionId: string): Promise<CreditActionOutcome> {
  return postCreditAction(
    "approve",
    exceptionId,
    { idempotency_key: newIdempotencyKey() },
    "האישור נכשל.",
  );
}

// W4 Doc B §3.3 — Reject (reason REQUIRED, min 5 chars; enforced both
// client-side here and server-side via Zod min(5)).
function postReject(
  exceptionId: string,
  reason: string,
): Promise<CreditActionOutcome> {
  return postCreditAction(
    "reject",
    exceptionId,
    { idempotency_key: newIdempotencyKey(), reason },
    "הדחייה נכשלה.",
  );
}

// ---------------------------------------------------------------------------
// Page component.
// ---------------------------------------------------------------------------
export default function CreditDetailPage(): ReactNode {
  const params = useParams<{ exception_id: string }>();
  const exceptionId = params.exception_id;
  useSession(); // ensures session is available; role-gate is via useCapability below
  const canActOnCredits = useCapability("planning:execute");

  const [now] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<
    | null
    | { kind: "success"; text: string }
    | { kind: "warning"; text: string }
    | { kind: "error"; text: string }
  >(null);

  const [showRejectPanel, setShowRejectPanel] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // Fetch the exception. The existing /api/exceptions handler returns rows
  // by status filter, not by id, so we list and find. This is fine for v1
  // (low row count for credit-needed; no expected scale). When W1 lands a
  // /api/exceptions/[id] GET, swap to that.
  const exceptionQuery = useQuery<CreditExceptionRow | null>({
    queryKey: ["credit-exception-detail", exceptionId],
    queryFn: async () => {
      // Fetch open + acknowledged + the post-Approve states; this catches
      // the Doc B §3.4 lifecycle states a planner might land on.
      const res = await fetch(
        "/api/exceptions?status=open,acknowledged,resolved,auto_resolved",
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) {
        throw new Error("טעינת בקשת הזיכוי נכשלה. נסה לרענן את הדף.");
      }
      const body = (await res.json()) as { rows: CreditExceptionRow[] };
      const found = body.rows.find((r) => r.exception_id === exceptionId);
      return found ?? null;
    },
    enabled: !!exceptionId,
    staleTime: 30_000,
    retry: false,
  });

  const handleAck = async () => {
    setBusy(true);
    setFeedback(null);
    const res = await acknowledgeException(exceptionId, newIdempotencyKey());
    setBusy(false);
    if (res.ok) {
      setFeedback({ kind: "success", text: "ראיתי — הבקשה סומנה." });
      void exceptionQuery.refetch();
    } else if (res.status === 401) {
      setFeedback({ kind: "error", text: "נדרשת התחברות מחדש." });
    } else {
      setFeedback({
        kind: "error",
        text: res.detail ?? "סימון 'ראיתי' נכשל. נסה שוב.",
      });
    }
  };

  const handleApprove = async () => {
    setBusy(true);
    setFeedback(null);
    const res = await postApprove(exceptionId);
    setBusy(false);
    if (res.kind === "ok") {
      // W4 Doc B §6 Hebrew register — Tom-locked phrasing for post-Approve
      // pending_gi_action state. Note this is the operator-facing copy from
      // the Wave 3 dispatch ("the credit will be created in Green Invoice
      // after document approval"); it intentionally does not promise a
      // synchronous GI write (SC-A3).
      setFeedback({
        kind: "success",
        text: "זיכוי אושר — הזיכוי ייווצר ב-Green Invoice לאחר אישור הקובץ.",
      });
      void exceptionQuery.refetch();
    } else if (res.kind === "auth_required") {
      window.location.href = `/login?redirectTo=${encodeURIComponent(window.location.pathname)}`;
    } else if (res.kind === "forbidden") {
      setFeedback({
        kind: "error",
        text: "אין הרשאה — נדרש planner או admin.",
      });
    } else if (res.kind === "not_pending") {
      setFeedback({ kind: "warning", text: "הבקשה כבר טופלה." });
      void exceptionQuery.refetch();
    } else if (res.kind === "wrong_category") {
      // Defensive: the page guards on category before rendering action
      // buttons, so this is unreachable in practice. If it fires, the
      // exception was racy-mutated between render and submit.
      setFeedback({
        kind: "error",
        text: "זו אינה בקשת זיכוי. רענן את הדף.",
      });
    } else if (res.kind === "transient") {
      setFeedback({ kind: "warning", text: res.message });
    } else {
      // Approve has no client-side validation_error path (no reason field
      // requirement), so this branch covers generic 5xx / network errors.
      setFeedback({ kind: "error", text: res.message });
    }
  };

  const handleReject = async () => {
    if (rejectReason.trim().length < 5) {
      setFeedback({
        kind: "error",
        text: "סיבת הדחייה חייבת להכיל לפחות 5 תווים.",
      });
      return;
    }
    setBusy(true);
    setFeedback(null);
    const res = await postReject(exceptionId, rejectReason);
    setBusy(false);
    if (res.kind === "ok") {
      // W4 Doc B §6 Hebrew register — Tom-locked phrasing for post-Reject
      // resolved state.
      setFeedback({ kind: "success", text: "בקשת הזיכוי נדחתה." });
      setShowRejectPanel(false);
      setRejectReason("");
      void exceptionQuery.refetch();
    } else if (res.kind === "auth_required") {
      window.location.href = `/login?redirectTo=${encodeURIComponent(window.location.pathname)}`;
    } else if (res.kind === "forbidden") {
      setFeedback({
        kind: "error",
        text: "אין הרשאה — נדרש planner או admin.",
      });
    } else if (res.kind === "validation_error") {
      // Server-side Zod min(5) — should be unreachable given the client-
      // side guard above, but render the server's message verbatim if it
      // ever fires (e.g., schema drift).
      setFeedback({ kind: "error", text: res.message });
    } else if (res.kind === "not_pending") {
      setFeedback({ kind: "warning", text: "הבקשה כבר טופלה." });
      setShowRejectPanel(false);
      setRejectReason("");
      void exceptionQuery.refetch();
    } else if (res.kind === "wrong_category") {
      setFeedback({
        kind: "error",
        text: "זו אינה בקשת זיכוי. רענן את הדף.",
      });
    } else if (res.kind === "transient") {
      setFeedback({ kind: "warning", text: res.message });
    } else {
      setFeedback({ kind: "error", text: res.message });
    }
  };

  // -------------------------------------------------------------------------
  // Render.
  // -------------------------------------------------------------------------
  if (exceptionQuery.isLoading) {
    return (
      <>
        <WorkflowHeader
          eyebrow="Inbox"
          title="נדרש אישור זיכוי"
          description={`Exception ${exceptionId}`}
        />
        <LoadingState title="טוען..." />
      </>
    );
  }

  if (exceptionQuery.isError) {
    return (
      <>
        <WorkflowHeader
          eyebrow="Inbox"
          title="נדרש אישור זיכוי"
          description={`Exception ${exceptionId}`}
        />
        <ErrorState
          title="טעינה נכשלה"
          description={
            exceptionQuery.error instanceof Error
              ? exceptionQuery.error.message
              : "לא הצלחנו לטעון את בקשת הזיכוי."
          }
          action={
            <Link href="/inbox" className="btn btn-sm">
              <ArrowLeft className="h-3 w-3" />
              חזרה לתיבת הדואר
            </Link>
          }
        />
      </>
    );
  }

  const row = exceptionQuery.data;

  // Empty state — exception not found. This is the expected state until
  // the first credit-needed row is emitted post-soak.
  if (!row) {
    return (
      <>
        <WorkflowHeader
          eyebrow="Inbox"
          title="נדרש אישור זיכוי"
          description={`Exception ${exceptionId}`}
        />
        <EmptyState
          title="אין בקשות זיכוי פתוחות"
          description="לא נמצאה בקשת זיכוי עם המזהה הזה. ייתכן שהבקשה נסגרה כבר, או שטרם נוצרו בקשות זיכוי במערכת."
          action={
            <Link href="/inbox" className="btn btn-sm btn-primary">
              <ArrowLeft className="h-3 w-3" />
              חזרה לתיבת הדואר
            </Link>
          }
        />
      </>
    );
  }

  // Wrong category guard — defensive. If someone points to a non-credit
  // exception by id, render the empty state honestly.
  if (row.category !== "lionwheel_credit_needed") {
    return (
      <>
        <WorkflowHeader
          eyebrow="Inbox"
          title="נדרש אישור זיכוי"
          description={`Exception ${exceptionId}`}
        />
        <EmptyState
          title="זו אינה בקשת זיכוי"
          description={`קטגוריה: ${row.category}. דף זה תומך רק בקטגוריית lionwheel_credit_needed.`}
          action={
            <Link href="/inbox" className="btn btn-sm btn-primary">
              <ArrowLeft className="h-3 w-3" />
              חזרה לתיבת הדואר
            </Link>
          }
        />
      </>
    );
  }

  const payload = row.detail_payload ?? extractCreditNeededPayload(row);
  const statusHe = STATUS_LABEL_HE[row.status] ?? row.status;
  const isTerminal =
    row.status === "resolved" ||
    row.status === "auto_resolved" ||
    row.status === "gi_draft_created";

  return (
    <>
      <WorkflowHeader
        eyebrow="Inbox"
        title="נדרש אישור זיכוי"
        description={
          payload.wp_order_id
            ? `הזמנה ${payload.wp_order_id} · ${statusHe}`
            : `Exception ${exceptionId} · ${statusHe}`
        }
        meta={
          <Link href="/inbox" className="btn btn-sm">
            <ArrowLeft className="h-3 w-3" />
            חזרה
          </Link>
        }
      />

      {feedback ? (
        <div
          className={
            feedback.kind === "success"
              ? "mb-4 rounded border border-success/40 bg-success-softer px-4 py-2 text-xs text-success-fg"
              : feedback.kind === "warning"
                ? "mb-4 rounded border border-warning/40 bg-warning-softer px-4 py-2 text-xs text-warning-fg"
                : "mb-4 rounded border border-danger/40 bg-danger-softer px-4 py-2 text-xs text-danger-fg"
          }
          data-testid="credit-detail-feedback"
        >
          {feedback.text}
        </div>
      ) : null}

      <SectionCard>
        <CreditNeededFactCard payload={payload} now={now} showDebug />
      </SectionCard>

      <SectionCard
        eyebrow="פעולות"
        title="מה לעשות עם הבקשה"
        description={
          isTerminal
            ? "הבקשה כבר נסגרה. אין פעולות זמינות."
            : canActOnCredits
              ? "אישור או דחייה מחייבים תפקיד planner או admin. סימון 'ראיתי' פתוח לכולם."
              : "סימון 'ראיתי' זמין לכל המשתמשים. אישור או דחייה מחייבים תפקיד planner או admin."
        }
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="credit-action-acknowledge"
            className="btn btn-sm"
            disabled={busy || isTerminal || row.status === "acknowledged"}
            onClick={handleAck}
          >
            {busy ? "שולח..." : "ראיתי"}
          </button>
          <button
            type="button"
            data-testid="credit-action-approve"
            className="btn btn-sm btn-primary"
            disabled={busy || isTerminal || !canActOnCredits}
            onClick={handleApprove}
          >
            {busy ? "שולח..." : "אשר זיכוי"}
          </button>
          <button
            type="button"
            data-testid="credit-action-reject"
            className="btn btn-sm"
            disabled={busy || isTerminal || !canActOnCredits}
            onClick={() => {
              setShowRejectPanel(true);
              setFeedback(null);
            }}
          >
            דחה זיכוי
          </button>
        </div>

        {showRejectPanel ? (
          <div
            className="mt-4 rounded border border-warning/40 bg-warning-softer p-3"
            data-testid="credit-reject-panel"
          >
            <div className="text-3xs font-semibold uppercase tracking-sops text-warning-fg">
              סיבת דחייה (חובה — לפחות 5 תווים)
            </div>
            <NotesBox
              data-testid="credit-reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="לדוגמה: ליקוט חלקי בהוראת לקוח."
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                data-testid="credit-reject-confirm"
                className="btn btn-primary btn-sm"
                disabled={busy || rejectReason.trim().length < 5}
                onClick={handleReject}
              >
                {busy ? "שולח..." : "אישור דחייה"}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={busy}
                onClick={() => {
                  setShowRejectPanel(false);
                  setRejectReason("");
                }}
              >
                ביטול
              </button>
            </div>
          </div>
        ) : null}
      </SectionCard>
    </>
  );
}
