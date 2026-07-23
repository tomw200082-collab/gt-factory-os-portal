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

import { useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ListChecks,
  RefreshCw,
  Target,
  X,
} from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { cn } from "@/lib/cn";
import {
  useCurrentSession,
  useStartSession,
} from "../purchase-session/_lib/api";
import type {
  PurchaseSessionPo,
  PurchaseSessionWarning,
} from "../purchase-session/_lib/types";
import { formatIls } from "@/lib/utils/format-money";
import { ActionList } from "./_components/ActionList";
import { IntegrityStrip } from "./_components/IntegrityStrip";
import { CalendarView } from "./_components/CalendarView";
import { RecommendationsToConvert } from "./_components/RecommendationsToConvert";
import { FocusMode } from "./_components/FocusMode";
import { buildFocusQueue } from "./_lib/focus-queue";
import { fmtDateHe } from "./_lib/decision";
import { useRovingTabList } from "@/components/a11y/useRovingTabList";

export default function ProcurementPage(): JSX.Element {
  const { data, isLoading, isError, error, refetch } = useCurrentSession();
  const startMut = useStartSession();
  const session = data?.session ?? null;

  // Tranche 065 (FLOW-A14) — ?view=calendar deep-links straight into the
  // calendar view (the purchase-calendar redirect targets it).
  const searchParams = useSearchParams();
  const initialView: "list" | "calendar" =
    searchParams.get("view") === "calendar" ? "calendar" : "list";

  // Focus mode: open flag + the order to start on (null = first queued).
  const [focusOpen, setFocusOpen] = useState(false);
  const [focusStartId, setFocusStartId] = useState<string | null>(null);

  // Tranche 065 (FLOW-PC02) — inline supersede confirmation replaces the
  // old window.confirm. While true, the start button area swaps for a
  // warning zone (matches the PO-detail inline cancel-confirm pattern).
  const [confirmingStart, setConfirmingStart] = useState(false);
  // Tranche 065 (FLOW-PC03) — dismissible success banner after a start.
  const [startBannerDismissed, setStartBannerDismissed] = useState(false);

  function openFocus(startId: string | null): void {
    setFocusStartId(startId);
    setFocusOpen(true);
  }

  function handleStart(): void {
    if (session?.status === "open" && !confirmingStart) {
      setConfirmingStart(true);
      return;
    }
    const superseding = confirmingStart;
    setConfirmingStart(false);
    setStartBannerDismissed(false);
    startMut.mutate({
      session_type: "weekly",
      // FLOW-PC02 — the backend will soon require supersede:true when an
      // open session exists; send it from the confirmed path already now
      // (the current backend ignores the extra field).
      ...(superseding ? { supersede: true } : {}),
    });
  }

  const startedSession = startMut.data?.session ?? null;
  const startBannerVisible =
    startMut.isSuccess && startedSession !== null && !startBannerDismissed;

  return (
    // Procurement is a fully-Hebrew operator surface, so the whole page reads
    // right-to-left. Scoped to this page root only — the app shell (TopBar,
    // sidebar, group nav) stays LTR. Matches the existing dir="rtl" convention
    // already used by FocusMode / FocusCard / the purchase-session screen.
    <div dir="rtl" className="flex flex-col gap-5">
      <WorkflowHeader
        size="section"
        eyebrow="מרחב התכנון"
        title="רכש"
        description="כל הזמנות הרכש במקום אחד, מסודרות לפי החלטה: מה חייב לצאת היום, מה יכול לחכות, ומה כבר טופל."
        meta={
          confirmingStart ? (
            // Tranche 065 (FLOW-PC02) — inline warning zone instead of a
            // browser confirm: states what is lost, offers an explicit way
            // to stay in the current session.
            <div
              className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning-softer px-3 py-2"
              role="alertdialog"
              aria-label="אישור החלפת מושב"
              data-testid="procurement-start-confirm-zone"
            >
              <AlertTriangle
                className="h-4 w-4 shrink-0 text-warning-fg"
                aria-hidden
              />
              <span className="text-xs text-warning-fg">
                {/* DR-018 INTER-006 (Tranche 124) — the warning didn't say
                    HOW MUCH would be lost; add the concrete count. */}
                קיים מושב רכש פתוח עם {session?.pos.length ?? 0} הזמנות. מושב
                חדש יחליף אותו, ואישורים שלא נשמרו יאבדו.
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={startMut.isPending}
                  className="btn btn-sm bg-warning text-fg-inverted hover:bg-warning/90"
                  data-testid="procurement-start-confirm"
                >
                  התחל מושב חדש
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingStart(false)}
                  disabled={startMut.isPending}
                  className="btn btn-ghost btn-sm"
                  data-testid="procurement-start-dismiss"
                >
                  השאר במושב הנוכחי
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleStart}
              disabled={startMut.isPending}
              className="btn btn-primary btn-sm"
              data-testid="procurement-start"
            >
              {startMut.isPending
                ? "מריץ…"
                : session
                  ? "הרצת מושב חדש"
                  : "התחל מושב רכש"}
            </button>
          )
        }
      />

      {startMut.isError && (
        <ErrorBanner
          message={(startMut.error as Error).message}
          onRetry={handleStart}
        />
      )}

      {/* Tranche 065 (FLOW-PC03) — explicit, dismissible confirmation that
          a session opened, with the date and the review workload. */}
      {startBannerVisible && startedSession && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 rounded-md border border-success/40 bg-success-softer px-4 py-3 text-sm text-success-fg"
          data-testid="procurement-start-success"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            מושב רכש נפתח לתאריך{" "}
            <span className="font-semibold">
              {fmtDateHe(startedSession.session_date)}
            </span>{" "}
            — {buildFocusQueue(startedSession.pos).length} הזמנות ממתינות
            לסקירה.
          </span>
          <button
            type="button"
            onClick={() => setStartBannerDismissed(true)}
            className="shrink-0 rounded p-0.5 text-success-fg hover:bg-success/10"
            aria-label="סגירת ההודעה"
            data-testid="procurement-start-success-dismiss"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {/* Input-trustworthiness strip (Tranche 132) — one compact line: stock
          verification, count freshness, forecast age, firmed-plan window and
          the engine's structural warnings as chips. Replaces the previous
          stack of full-width warning banners; the machine-readable warning
          payload also surfaces inline on the affected rows in ActionList.
          Tranche 133: onRefresh reuses handleStart (the same supersede-
          confirm flow as the header's "הרצת מושב חדש") so a planner who just
          finished a physical count can get updated recommendations without
          hunting for the header button. */}
      {session && (
        <IntegrityStrip
          session={session}
          onRefresh={handleStart}
          refreshPending={startMut.isPending}
          // ux-release-gate 2026-07-21 INT-P0-1: while the header confirm zone
          // is armed, the strip button must disable — otherwise a second tap
          // on it falls straight through handleStart's guard and supersedes
          // the session without the confirm ever being seen.
          refreshConfirming={confirmingStart}
        />
      )}

      {/* Approved purchase recommendations → PO. Canonical conversion home
          after planning runs were made diagnostic-only (Tranche 072). Renders
          nothing when there is nothing to convert. */}
      <RecommendationsToConvert />

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorBanner
          message={(error as Error)?.message ?? "לא ניתן לטעון את מושב הרכש."}
          onRetry={() => void refetch()}
        />
      ) : !session ? (
        <EmptyNoSession onStart={handleStart} starting={startMut.isPending} />
      ) : (
        <SessionView
          pos={session.pos}
          warnings={session.warnings}
          sessionDate={session.session_date}
          totalCost={session.totals.total_cost}
          initialView={initialView}
          onStartFocus={() => openFocus(null)}
          onOpenById={openFocus}
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
  warnings,
  sessionDate,
  totalCost,
  initialView,
  onStartFocus,
  onOpenById,
}: {
  pos: PurchaseSessionPo[];
  warnings: PurchaseSessionWarning[];
  sessionDate: string;
  totalCost: number;
  initialView: "list" | "calendar";
  onStartFocus: () => void;
  onOpenById: (id: string) => void;
}): JSX.Element {
  const [view, setView] = useState<"list" | "calendar">(initialView);
  // DR-018 A11Y-006 (Tranche 124) — the view toggle was a hand-rolled
  // role="tab" pair with no keyboard arrow support; replaced with the
  // shared roving-tabindex hook (same pattern as InventoryFlowTabs).
  const roving = useRovingTabList<"list" | "calendar">({
    keys: ["list", "calendar"] as const,
    activeKey: view,
    onChange: setView,
    orientation: "horizontal",
  });
  const actionableCount = buildFocusQueue(pos).length;
  // Tranche 086 (FLOW-004) — POs placed in this session now wait in the
  // office-manager placement queue (APPROVED_TO_ORDER). Surface a bridge so the
  // planner has a forward path after finishing.
  const placedCount = pos.filter((p) => p.status === "placed").length;

  if (pos.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-3 p-6 text-center text-sm text-fg-muted">
        <div>
          המנוע רץ בהצלחה — אין כרגע הזמנות רכש שדורשות פעולה בתוך האופק.
        </div>
        {/* Tranche 047 — the old purchase-calendar link redirected straight
            back to this page (a loop after Tranche 045). Replaced with a
            non-link hint. */}
        <div className="text-xs text-fg-faint">
          הזמנות מתוכננות יופיעו כאן אוטומטית כשיגיע מועד הפעולה שלהן.
        </div>
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
        <div className="flex items-center gap-3">
          {placedCount > 0 && (
            <Link
              href="/purchase-orders/placement-queue"
              className="text-xs font-medium text-accent underline-offset-2 hover:underline"
              data-testid="procurement-to-placement-queue"
            >
              {placedCount} הזמנות ממתינות לביצוע ←
            </Link>
          )}
          {/* Tranche 065 (FLOW-PC04) — quiet exit to the full PO history. */}
          <Link
            href="/purchase-orders"
            className="text-xs font-medium text-fg-muted underline-offset-2 hover:text-fg hover:underline"
            data-testid="procurement-order-history"
          >
            היסטוריית הזמנות ←
          </Link>
          <Link
            href="/purchase-orders/new"
            className="text-xs font-medium text-fg-muted underline-offset-2 hover:text-fg hover:underline"
            data-testid="procurement-manual-order"
          >
            הזמנה ידנית חד-פעמית
          </Link>
          {actionableCount > 0 && (
            <button
              type="button"
              onClick={onStartFocus}
              className="btn btn-primary"
              data-testid="procurement-start-focus"
            >
              <Target className="h-4 w-4" aria-hidden />
              התחל מיקוד · {actionableCount}
            </button>
          )}
        </div>
      </div>

      {/* View toggle — action list (default) vs calendar */}
      <div
        {...roving.tabListProps}
        className="inline-flex rounded-lg border border-border/60 bg-bg-subtle/40 p-0.5"
        aria-label="תצוגת רכש"
      >
        <ViewTab
          active={view === "list"}
          onClick={() => setView("list")}
          tabProps={roving.getTabProps("list")}
          icon={<ListChecks className="h-4 w-4" aria-hidden />}
          label="רשימת פעולה"
          testId="procurement-view-list"
        />
        <ViewTab
          active={view === "calendar"}
          onClick={() => setView("calendar")}
          tabProps={roving.getTabProps("calendar")}
          icon={<CalendarDays className="h-4 w-4" aria-hidden />}
          label="לוח"
          testId="procurement-view-calendar"
        />
      </div>

      {view === "list" ? (
        <ActionList
          pos={pos}
          warnings={warnings}
          onOpen={(po) => onOpenById(po.session_po_id)}
        />
      ) : (
        <CalendarView pos={pos} onOpen={onOpenById} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

function ViewTab({
  active,
  onClick,
  tabProps,
  icon,
  label,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  tabProps: {
    role: "tab";
    tabIndex: 0 | -1;
    "aria-selected": boolean;
    ref: (el: HTMLElement | null) => void;
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void;
  };
  icon: JSX.Element;
  label: string;
  testId: string;
}): JSX.Element {
  return (
    <button
      type="button"
      role={tabProps.role}
      tabIndex={tabProps.tabIndex}
      aria-selected={tabProps["aria-selected"]}
      ref={tabProps.ref}
      onKeyDown={tabProps.onKeyDown}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
        active
          ? "bg-bg text-fg shadow-sm"
          : "text-fg-muted hover:text-fg",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function LoadingState(): JSX.Element {
  // INTER-011 (Tranche 079) — skeleton blocks approximating the live session
  // view (summary strip, then a stack of action rows). Structural only — no
  // Hebrew copy is added or altered here; the existing Hebrew waiting line
  // is replaced by visible placeholder shapes so the planner sees layout
  // continuity instead of a centered string.
  return (
    <div
      className="space-y-5"
      aria-busy="true"
      aria-live="polite"
      data-testid="procurement-loading"
    >
      {/* Summary strip placeholder — matches SessionView's top card */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-col gap-2">
          <div className="h-4 w-40 animate-pulse rounded bg-bg-subtle" />
          <div className="h-3 w-24 animate-pulse rounded bg-bg-subtle" />
        </div>
        <div className="h-8 w-32 animate-pulse rounded bg-bg-subtle" />
      </div>
      {/* View-toggle placeholder */}
      <div className="h-8 w-44 animate-pulse rounded bg-bg-subtle" />
      {/* Action-list row placeholders — three groups by decision */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card p-4">
            <div className="mb-3 h-3 w-32 animate-pulse rounded bg-bg-subtle" />
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((__, j) => (
                <div
                  key={j}
                  className="h-10 w-full animate-pulse rounded bg-bg-subtle"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyNoSession({
  onStart,
  starting,
}: {
  onStart?: () => void;
  starting?: boolean;
}): JSX.Element {
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
      {/* FLOW-007 — the empty state carries its own primary action so the
          planner never has to scroll back up to the header to start. */}
      {onStart ? (
        <button
          type="button"
          className="btn btn-primary mt-1"
          onClick={onStart}
          disabled={starting}
          data-testid="procurement-no-session-start"
        >
          {starting ? "מתחיל…" : "התחל מושב רכש"}
        </button>
      ) : null}
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
