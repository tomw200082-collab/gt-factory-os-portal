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
import { CheckCircle2, X } from "lucide-react";
import { classifyPo, todayISO } from "../_lib/decision";
import {
  allResolved,
  buildFocusQueue,
  isResolved,
  nextUnresolvedId,
  positionOf,
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
}: FocusModeProps): JSX.Element {
  const day = today ?? todayISO();

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
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Keyboard: Esc closes; RTL arrows (← next, → previous). Arrow navigation is
  // suppressed while a field is focused so typing a quantity/date isn't
  // hijacked into changing orders.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
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
  }, [onClose, goNext, goPrev]);

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

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-bg/95 backdrop-blur-sm"
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
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle">
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
          onClick={onClose}
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
            {flash.kind === "placed" ? "ההזמנה נוצרה" : "ההזמנה דולגה"}
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
              onClose={onClose}
            />
          ) : (
            <FocusCard
              key={current.session_po_id}
              po={current}
              whyNow={classifyPo(current, day).whyNow}
              isOverdue={classifyPo(current, day).isOverdue}
              onResolve={handleResolve}
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
            → הקודם
          </button>
          <span className="text-3xs text-fg-faint">
            Esc לסגירה · ←/→ למעבר
          </span>
          <button
            type="button"
            onClick={goNext}
            className="btn btn-sm btn-ghost"
            data-testid="focus-next"
          >
            הבא ←
          </button>
        </div>
      )}
    </div>
  );
}

function DoneSummary({
  placed,
  skipped,
  total,
  onClose,
}: {
  placed: number;
  skipped: number;
  total: number;
  onClose: () => void;
}): JSX.Element {
  return (
    <div
      className="flex flex-col items-center gap-4 py-12 text-center"
      data-testid="focus-done"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/20">
        <CheckCircle2 className="h-9 w-9 text-success-fg" aria-hidden />
      </div>
      <div className="space-y-1">
        <div className="text-lg font-bold text-fg">סיימת את מושב הרכש 🎉</div>
        <div className="text-sm text-fg-muted">
          {total === 0
            ? "לא היו הזמנות שדורשות פעולה."
            : `מתוך ${total} הזמנות: ${placed} בוצעו · ${skipped} דולגו.`}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="btn btn-accent"
        data-testid="focus-done-close"
      >
        חזרה לרשימה
      </button>
    </div>
  );
}
