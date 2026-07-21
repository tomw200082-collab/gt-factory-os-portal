"use client";

// ---------------------------------------------------------------------------
// FocusMode — full-screen, one-order-at-a-time procurement walk-through
// (Tranche 029). A focus overlay (role="dialog") that drives the planner
// through the open session's actionable orders in decision order: approve →
// place → auto-advance to the next still-open order, with a completion summary
// at the end.
//
// UX details:
//   • Progress header ("הזמנה 3 מתוך 8" + bar).
//   • Keyboard (RTL-aware): Esc closes; ← = next, → = previous (Hebrew "הבא"
//     sits to the left). The card autofocuses its primary CTA so Enter advances
//     the state machine.
//   • Smart auto-advance: on place/skip it jumps to the next unresolved order,
//     not merely the next index — resolved orders are skipped.
//   • Non-blocking success flash so flow never stalls on a confirmation.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { CheckCircle2, ListChecks, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { classifyPo, todayISO } from "../_lib/decision";
import {
  allResolved,
  buildFocusQueue,
  nextUnresolvedId,
  positionOf,
  remainingCount,
} from "../_lib/focus-queue";
import type { PoStatusLike } from "../_lib/decision";
import type { PurchaseSessionPo } from "../../purchase-session/_lib/types";
import { FocusCard, type FocusResolveResult } from "./FocusCard";

export interface FocusModeProps {
  pos: PurchaseSessionPo[];
  /** Order to open on; falls back to the first queued order. */
  startId?: string | null;
  today?: string;
  onClose: () => void;
}

export function FocusMode({
  pos,
  startId,
  today,
  onClose,
}: FocusModeProps): JSX.Element | null {
  const day = today ?? todayISO();

  // DR-018 A11Y-001 (Tranche 121) — portal-mount guard, mirroring MobileNav.
  // createPortal needs a real DOM target, so defer until mount (SSR safety).
  // Portaling to document.body escapes AppShellChrome's `isolate` root: this
  // overlay's `position: fixed` + z-50 was being trapped BELOW TopBar's
  // explicit z-40 (TopBar is a direct positioned child of the isolate
  // context; FocusMode was nested several non-positioned ancestors deep, so
  // its whole subtree painted in the isolate context's non-positioned layer
  // — below TopBar regardless of its own z-50). That silently made the
  // top-left close button unclickable behind the header.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Stable walk order, snapshotted when focus opens. Live status comes from
  // `pos` (which refetches after every mutation); the *order* must not reshuffle
  // under the planner mid-session, so we freeze the id list once.
  const [queueIds] = useState<string[]>(() => buildFocusQueue(pos, day));

  const posById = useMemo(() => {
    const m = new Map<string, PurchaseSessionPo>();
    for (const po of pos) m.set(po.session_po_id, po);
    return m;
  }, [pos]);

  const statusById = useMemo(() => {
    const m: Record<string, PoStatusLike> = {};
    for (const po of pos) m[po.session_po_id] = po.status;
    return m;
  }, [pos]);

  const firstId =
    (startId && queueIds.includes(startId) ? startId : queueIds[0]) ?? null;
  const [currentId, setCurrentId] = useState<string | null>(firstId);
  const [done, setDone] = useState(queueIds.length === 0);
  const [flash, setFlash] = useState<FocusResolveResult | null>(null);
  // INTER-004: guard against silently discarding unsaved line-quantity edits.
  // FocusCard reports whether it holds unsaved draft edits; closing the overlay
  // then confirms first instead of dropping them.
  const [cardDirty, setCardDirty] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const requestClose = useCallback(() => {
    if (cardDirty) setConfirmingClose(true);
    else onClose();
  }, [cardDirty, onClose]);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // DR-018 A11Y-001 (Tranche 121) — keyboard/AT users lost their position
  // every time the overlay opened (no focus-in) or closed (no focus-restore).
  // Captured at render time (not in an effect): FocusCard autofocuses its
  // own primary CTA in a child effect, and child effects run before parent
  // effects, so capturing this in a useEffect here would race and often
  // capture the CTA instead of the real trigger that had focus before this
  // overlay mounted.
  const previouslyFocusedRef = useRef<HTMLElement | null>(
    typeof document !== "undefined"
      ? (document.activeElement as HTMLElement | null)
      : null,
  );

  const goTo = useCallback(
    (id: string | null) => {
      if (id == null) {
        setDone(true);
      } else {
        setCurrentId(id);
        setDone(false);
      }
    },
    [],
  );

  const goNext = useCallback(() => {
    const idx = positionOf(queueIds, currentId) - 1; // 0-based, -1 if absent
    const next = queueIds[idx + 1] ?? null;
    goTo(next);
  }, [queueIds, currentId, goTo]);

  const goPrev = useCallback(() => {
    if (done) {
      goTo(queueIds[queueIds.length - 1] ?? null);
      return;
    }
    const idx = positionOf(queueIds, currentId) - 1;
    if (idx > 0) goTo(queueIds[idx - 1]);
  }, [queueIds, currentId, done, goTo]);

  // After a successful place/skip: flash a confirmation and jump to the next
  // order that still needs action. We force the just-resolved order to resolved
  // in the lookup because the refetch may not have landed yet.
  const handleResolve = useCallback(
    (result: FocusResolveResult) => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      setFlash(result);
      flashTimer.current = setTimeout(() => setFlash(null), 2500);

      const optimistic: Record<string, PoStatusLike> = {
        ...statusById,
        ...(currentId
          ? { [currentId]: result.kind === "placed" ? "placed" : "skipped" }
          : {}),
      };
      goTo(nextUnresolvedId(queueIds, currentId, optimistic));
    },
    [statusById, currentId, queueIds, goTo],
  );

  // Jump to the first still-open order (used by the completion screen when the
  // planner reached the end via manual "next" with work still left).
  const resumeRemaining = useCallback(() => {
    goTo(nextUnresolvedId(queueIds, null, statusById));
  }, [queueIds, statusById, goTo]);

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  // Lock background scroll while the overlay is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // DR-018 A11Y-001 (Tranche 121) — move focus into the overlay on open,
  // and restore it to the trigger (captured above, at render time) on
  // close/unmount. Gated on `mounted`: before the portal-mount guard flips
  // true, this component renders null, so containerRef.current is still
  // null on the very first effect pass — running this effect a second time
  // once `mounted` becomes true (and the portaled DOM node actually exists)
  // is what makes the focus-in reliable.
  useEffect(() => {
    if (!mounted) return;
    const trigger = previouslyFocusedRef.current;
    queueMicrotask(() => {
      containerRef.current?.focus();
    });
    return () => {
      if (trigger && typeof trigger.focus === "function") {
        try {
          trigger.focus();
        } catch {
          /* trigger may have unmounted — ignore */
        }
      }
    };
  }, [mounted]);

  // Keyboard: Esc closes; RTL arrows (← next, → previous). Arrow navigation is
  // suppressed while a field is focused so typing a quantity/date isn't
  // hijacked into changing orders.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
        return;
      }
      // Focus trap — keep Tab cycling within the overlay.
      if (e.key === "Tab") {
        const root = containerRef.current;
        if (!root) return;
        const focusables = root.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        t?.isContentEditable
      ) {
        return;
      }
      if (e.key === "ArrowLeft") goNext();
      else if (e.key === "ArrowRight") goPrev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose, goNext, goPrev]);

  // Reset the close-confirm + dirty flags whenever the focused order changes.
  useEffect(() => {
    setConfirmingClose(false);
    setCardDirty(false);
  }, [currentId]);

  const current = currentId ? posById.get(currentId) ?? null : null;
  const position = positionOf(queueIds, currentId);
  const total = queueIds.length;
  const everythingDone = done || allResolved(queueIds, statusById);

  const placedCount = queueIds.filter(
    (id) => statusById[id] === "placed",
  ).length;
  const skippedCount = queueIds.filter(
    (id) => statusById[id] === "skipped",
  ).length;
  const remaining = remainingCount(queueIds, statusById);

  if (!mounted) return null;

  return createPortal(
    <div
      ref={containerRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-bg/95 backdrop-blur-sm outline-none"
      role="dialog"
      aria-modal="true"
      aria-label="מצב מיקוד — רכש"
      data-testid="focus-mode"
      dir="rtl"
    >
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-border/60 px-4 py-3 sm:px-6">
        <div className="flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-fg">מצב מיקוד</span>
            {total > 0 && !everythingDone && (
              <span
                className="text-xs tabular-nums text-fg-muted"
                data-testid="focus-progress"
              >
                הזמנה {position} מתוך {total}
              </span>
            )}
          </div>
          <div
            className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle"
            role="progressbar"
            aria-label="התקדמות מושב הרכש"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={placedCount + skippedCount}
          >
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{
                width: `${
                  total > 0
                    ? Math.round(((placedCount + skippedCount) / total) * 100)
                    : 0
                }%`,
              }}
              aria-hidden
            />
          </div>
        </div>
        <button
          type="button"
          onClick={requestClose}
          className="rounded-full p-1.5 text-fg-muted hover:bg-bg-subtle hover:text-fg transition-colors"
          aria-label="סגור מצב מיקוד"
          data-testid="focus-close"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {/* Flash */}
      {flash && (
        <div
          className="pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2 rounded-full border border-success/40 bg-success-softer px-4 py-1.5 text-xs font-medium text-success-fg shadow-sm">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            {/* ux-release-gate 2026-07-21 COPY-101: corridor vocabulary —
                the hand-off to the placement queue, not a completion. */}
            {flash.kind === "placed" ? "ההזמנה הועברה לביצוע" : "ההזמנה דולגה"}
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-auto px-4 py-6 sm:px-6">
        <div className="mx-auto w-full max-w-2xl">
          {everythingDone || !current ? (
            <DoneSummary
              placed={placedCount}
              skipped={skippedCount}
              total={total}
              remaining={remaining}
              onClose={onClose}
              onResume={resumeRemaining}
            />
          ) : (
            <FocusCard
              key={current.session_po_id}
              po={current}
              whyNow={classifyPo(current, day).whyNow}
              isOverdue={classifyPo(current, day).isOverdue}
              onResolve={handleResolve}
              onDirtyChange={setCardDirty}
            />
          )}
        </div>
      </div>

      {/* Footer nav */}
      {!everythingDone && current && total > 1 && (
        <div className="flex items-center justify-between border-t border-border/60 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={goPrev}
            disabled={position <= 1}
            className="btn btn-sm btn-ghost disabled:opacity-40"
            data-testid="focus-prev"
          >
            <span aria-hidden="true">→</span> הקודם
          </button>
          <span className="hidden text-3xs text-fg-faint sm:inline">
            Esc לסגירה · <span aria-hidden="true">←/→</span> למעבר
          </span>
          <button
            type="button"
            onClick={goNext}
            className="btn btn-sm btn-ghost"
            data-testid="focus-next"
          >
            הבא <span aria-hidden="true">←</span>
          </button>
        </div>
      )}

      {/* INTER-004: unsaved-edit guard before closing the overlay. */}
      {confirmingClose && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-bg/80 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-label="שינויים שלא נשמרו"
          data-testid="focus-close-confirm"
        >
          <div className="w-full max-w-sm rounded-lg border border-border bg-bg-raised p-5 text-center shadow-lg">
            <p className="text-sm font-semibold text-fg">
              יש לך שינויי כמות שלא נשמרו
            </p>
            <p className="mt-1 text-xs text-fg-muted">סגירה תבטל אותם.</p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setConfirmingClose(false)}
                data-testid="focus-close-keep"
              >
                המשך עריכה
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => {
                  setConfirmingClose(false);
                  onClose();
                }}
                data-testid="focus-close-discard"
              >
                סגור בכל זאת
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

function DoneSummary({
  placed,
  skipped,
  total,
  remaining,
  onClose,
  onResume,
}: {
  placed: number;
  skipped: number;
  total: number;
  remaining: number;
  onClose: () => void;
  onResume: () => void;
}): JSX.Element {
  const hasRemaining = remaining > 0;
  return (
    <div
      className="flex flex-col items-center gap-4 py-12 text-center"
      data-testid="focus-done"
    >
      <div
        className={cn(
          "flex h-16 w-16 items-center justify-center rounded-full",
          hasRemaining ? "bg-warning/20" : "bg-success/20",
        )}
      >
        {hasRemaining ? (
          <ListChecks className="h-9 w-9 text-warning-fg" aria-hidden />
        ) : (
          <CheckCircle2 className="h-9 w-9 text-success-fg" aria-hidden />
        )}
      </div>
      <div className="space-y-1">
        <div className="text-lg font-bold text-fg">
          {total === 0
            ? "אין הזמנות שדורשות פעולה"
            : hasRemaining
              ? "עברת על כל ההזמנות"
              : "סיימת את מושב הרכש 🎉"}
        </div>
        <div className="text-sm text-fg-muted">
          {total === 0
            ? "המנוע רץ — אין כרגע מה להזמין בתוך האופק."
            : hasRemaining
              ? `מתוך ${total}: ${placed} הועברו לביצוע · ${skipped} דולגו · ${remaining} עדיין פתוחות.`
              : `מתוך ${total} הזמנות: ${placed} הועברו לביצוע · ${skipped} דולגו.`}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {hasRemaining && (
          <button
            type="button"
            onClick={onResume}
            className="btn btn-accent"
            data-testid="focus-done-resume"
          >
            המשך לפתוחות · {remaining}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className={cn("btn", hasRemaining ? "btn-ghost" : "btn-accent")}
          data-testid="focus-done-close"
        >
          חזרה לרשימה
        </button>
      </div>
      {/* Tranche 086 (FLOW-001) — placed session POs now land in
          APPROVED_TO_ORDER (the office-manager queue), not OPEN. Point the
          planner at the placement queue, not the OPEN PO list (which would
          show zero). */}
      {placed > 0 && (
        <Link
          href="/purchase-orders/placement-queue"
          className="text-xs font-medium text-fg-muted underline-offset-2 hover:text-fg hover:underline"
          data-testid="focus-done-view-orders"
        >
          ההזמנות שנוצרו ממתינות לביצוע מול הספק <span aria-hidden="true">←</span>
        </Link>
      )}
    </div>
  );
}
