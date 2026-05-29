"use client";

// ---------------------------------------------------------------------------
// Procurement — unified procurement page (Tranche 028).
//
// The merged front door for the Sunday procurement close. Default (and, this
// tranche, only) view: a single action list grouped by decision —
// 🔴 must-send-today / 🟡 can-wait / ✅ handled — built from the open purchase
// session. Replaces hunting across Purchase Session + Purchase Calendar with
// one "what has to happen now" surface.
//
// Reuses the purchase-session data layer (useCurrentSession / useStartSession)
// — no new backend dependency. Per-PO actions still live on the classic session
// screen; focus mode lands in Tranche 029, at which point the row "open" action
// flips from a link into inline focus via ActionList's onOpen prop.
//
// Gating: the (planning) layout already wraps children in
// <RoleGate minimum="planning:read">, so planners/admins/viewers reach this
// page and operators are blocked there — no extra gate needed here.
// ---------------------------------------------------------------------------

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Target } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { cn } from "@/lib/cn";
import {
  useCurrentSession,
  useStartSession,
} from "../purchase-session/_lib/api";
import type { PurchaseSessionPo } from "../purchase-session/_lib/types";
import { formatIls } from "@/lib/utils/format-money";
import { ActionList } from "./_components/ActionList";
import { FocusMode } from "./_components/FocusMode";
import { buildFocusQueue } from "./_lib/focus-queue";

export default function ProcurementPage(): JSX.Element {
  const { data, isLoading, isError, error, refetch } = useCurrentSession();
  const startMut = useStartSession();
  const session = data?.session ?? null;

  // Focus mode: open flag + the order to start on (null = first queued).
  const [focusOpen, setFocusOpen] = useState(false);
  const [focusStartId, setFocusStartId] = useState<string | null>(null);

  function openFocus(startId: string | null): void {
    setFocusStartId(startId);
    setFocusOpen(true);
  }

  function handleStart(): void {
    if (
      session?.status === "open" &&
      !window.confirm(
        "קיים מושב רכש פתוח. הרצת מושב חדש תחליף אותו וכל פעולה שלא נשמרה תאבד. להמשיך?",
      )
    ) {
      return;
    }
    startMut.mutate({ session_type: "weekly" });
  }

  return (
    <div className="space-y-5">
      <WorkflowHeader
        eyebrow="מרחב התכנון"
        title="רכש"
        description="כל הזמנות הרכש במקום אחד, מסודרות לפי החלטה: מה חייב לצאת היום, מה יכול לחכות, ומה כבר טופל."
        meta={
          <button
            type="button"
            onClick={handleStart}
            disabled={startMut.isPending}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors",
              "bg-accent text-accent-fg hover:bg-accent/90 disabled:opacity-60",
            )}
            data-testid="procurement-start"
          >
            {startMut.isPending
              ? "מריץ…"
              : session
                ? "הרצת מושב חדש"
                : "התחל מושב רכש"}
          </button>
        }
      />

      {startMut.isError && (
        <ErrorBanner
          message={(startMut.error as Error).message}
          onRetry={handleStart}
        />
      )}

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorBanner
          message={(error as Error)?.message ?? "לא ניתן לטעון את מושב הרכש."}
          onRetry={() => void refetch()}
        />
      ) : !session ? (
        <EmptyNoSession />
      ) : (
        <SessionView
          pos={session.pos}
          sessionDate={session.session_date}
          totalCost={session.totals.total_cost}
          onStartFocus={() => openFocus(null)}
          onOpenOrder={(po) => openFocus(po.session_po_id)}
        />
      )}

      {focusOpen && session && (
        <FocusMode
          pos={session.pos}
          startId={focusStartId}
          onClose={() => setFocusOpen(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session view — summary strip + the decision-grouped action list
// ---------------------------------------------------------------------------

function SessionView({
  pos,
  sessionDate,
  totalCost,
  onStartFocus,
  onOpenOrder,
}: {
  pos: PurchaseSessionPo[];
  sessionDate: string;
  totalCost: number;
  onStartFocus: () => void;
  onOpenOrder: (po: PurchaseSessionPo) => void;
}): JSX.Element {
  const actionableCount = buildFocusQueue(pos).length;

  if (pos.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-3 p-6 text-center text-sm text-fg-muted">
        <div>
          המנוע רץ בהצלחה — אין כרגע הזמנות רכש שדורשות פעולה בתוך האופק.
        </div>
        <Link
          href="/planning/purchase-calendar"
          className="btn btn-sm btn-outline"
        >
          ללוח הרכש ←
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div
        className="card flex flex-wrap items-center justify-between gap-3 p-4"
        data-testid="procurement-summary"
      >
        <div className="flex flex-col gap-0.5">
          <div className="text-sm text-fg">
            מושב מתאריך <span className="font-semibold">{sessionDate}</span>
          </div>
          <div className="text-xs text-fg-muted">
            סה״כ:{" "}
            <span className="font-mono tabular-nums text-fg">
              {formatIls(totalCost)}
            </span>
          </div>
        </div>
        {actionableCount > 0 && (
          <button
            type="button"
            onClick={onStartFocus}
            className="btn btn-accent"
            data-testid="procurement-start-focus"
          >
            <Target className="h-4 w-4" aria-hidden />
            התחל מיקוד · {actionableCount}
          </button>
        )}
      </div>

      <ActionList pos={pos} onOpen={onOpenOrder} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

function LoadingState(): JSX.Element {
  return (
    <div
      className="card p-6 text-center text-sm text-fg-muted"
      data-testid="procurement-loading"
    >
      טוען מושב רכש…
    </div>
  );
}

function EmptyNoSession(): JSX.Element {
  return (
    <div
      className="card flex flex-col items-center gap-3 p-8 text-center"
      data-testid="procurement-no-session"
    >
      <div className="text-sm font-semibold text-fg">אין מושב רכש פעיל</div>
      <div className="max-w-md text-xs text-fg-muted">
        התחילו מושב רכש שבועי כדי לראות את כל ההזמנות המוצעות, מסודרות לפי מה
        שחייב לצאת היום ומה יכול לחכות.
      </div>
    </div>
  );
}

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): JSX.Element {
  return (
    <div
      role="alert"
      className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger-fg flex items-start gap-2"
      data-testid="procurement-error"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
      <div className="flex-1">{message}</div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1 text-xs font-medium text-danger-fg underline hover:no-underline"
      >
        <RefreshCw className="h-3 w-3" aria-hidden />
        נסה שוב
      </button>
    </div>
  );
}
