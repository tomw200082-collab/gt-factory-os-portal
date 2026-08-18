"use client";

// The sheet that closes the loop.
//
// It appears when the user comes back from a call, and it is the only thing
// that clears a queue item. Dismissing it does not: the intent stays armed and
// the sheet returns, because "I'll remember to log it" is exactly the habit
// this product exists to replace.
//
// Four buttons, deliberately large. This gets used one-handed, standing up,
// with a phone that was against an ear a second ago.

import { useEffect, useRef, useState } from "react";
import { LOST_REASONS, OUTCOME_LABELS, OUTCOME_TITLES, UI } from "../_lib/labels";
import { fmtDate, toDateInputValue } from "../_lib/format";
import type { OutcomeResult, OutreachChannel } from "../_lib/types";
import { useReturnFocus } from "../_lib/useReturnFocus";

export interface OutcomeSubmit {
  result?: OutcomeResult;
  next_touch_at?: string | null;
  reason?: string | null;
}

export interface OutcomeSheetProps {
  leadName: string;
  /** The admin-editable list (0326). Falls back to the shipped constant while
   *  settings load, so the sheet is never a blank list. */
  lostReasons?: string[];
  /**
   * "outcome"     — the full loop, raised on return from a call.
   * "next-touch"  — the דחה button on a card: pick a date, nothing else.
   * "lost"        — the אבוד button on a card: a reason is required.
   *
   * One sheet rather than three so the vocabulary of answering is identical
   * wherever the question is asked.
   */
  mode?: "outcome" | "next-touch" | "lost";
  /**
   * How the lead was reached. The sheet is raised by a WhatsApp hand-off as
   * often as by a call, and "what happened in the call?" is then the wrong
   * question about a conversation that was typed.
   */
  channel?: OutreachChannel;
  busy?: boolean;
  error?: string | null;
  onSubmit: (vars: OutcomeSubmit) => void;
  /** Dismissal. On the outcome sheet this deliberately leaves the intent owed. */
  onDismiss: () => void;
}

type Step = "root" | "next-touch" | "lost-reason";

function atNineAM(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

/**
 * What the server will schedule if the user does not pick a date.
 *
 * A faithful mirror of sales_core.next_business_touch (migration 0324): N days
 * out, 09:00 Israel time, rolled off Friday and Saturday onto Sunday. The body
 * still omits next_touch_at unless the user changes it — the server remains the
 * source of truth and this is an echo, not a second opinion — but a tap that
 * commits a date should say which date before it commits it.
 */
export function nextBusinessTouchPreview(days: number, from: Date = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  // getDay(): 5 = Friday, 6 = Saturday. The Israeli weekend, not the American
  // one — a "tomorrow" that lands on Shabbat is not a call anyone will make.
  const day = d.getDay();
  if (day === 5) d.setDate(d.getDate() + 2);
  else if (day === 6) d.setDate(d.getDate() + 1);
  return d;
}

export function OutcomeSheet({
  leadName,
  lostReasons,
  mode = "outcome",
  channel,
  busy = false,
  error = null,
  onSubmit,
  onDismiss,
}: OutcomeSheetProps) {
  useReturnFocus();
  const [step, setStep] = useState<Step>(
    mode === "next-touch" ? "next-touch" : mode === "lost" ? "lost-reason" : "root",
  );
  const [reason, setReason] = useState<string>("");
  const [otherReason, setOtherReason] = useState<string>("");
  const [customDate, setCustomDate] = useState<string>(toDateInputValue(new Date()));
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus trap + Escape, mirroring MobileNav's dialog handling.
  //
  // `busy` is a dependency because the Escape handler reads it: guarding the
  // dismiss button while leaving Escape open would have protected only the
  // people using a pointer, and thrown the same error away for anyone on a
  // keyboard.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        // Not an emergency exit while a write is in the air: closing here
        // discards the error the write is about to report. Tab still moves
        // freely inside, so nobody is trapped.
        if (!busy) onDismiss();
        return;
      }
      if (e.key !== "Tab" || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onDismiss, step, busy]);

  // The list is Tom's to edit, so "which one opens a free-text field" cannot be
  // a literal string comparison any more: renaming the last entry would have
  // silently killed free-text capture. The rule is positional and stated on the
  // settings screen — the last reason always takes text.
  const reasons = lostReasons?.length ? lostReasons : LOST_REASONS;
  const freeTextReason = reasons[reasons.length - 1];
  const chosenReason = reason === freeTextReason ? otherReason.trim() : reason;
  // A card's "דחה" only moves the date; the full loop also records the outcome.
  const progressing: OutcomeSubmit =
    mode === "outcome" ? { result: "answered_progressing" } : {};

  return (
    <div
      data-testid="outcome-sheet"
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "hsl(var(--s-overlay))" }}
      onClick={(e) => {
        // Same guard the dismiss button and Escape already carried: closing
        // mid-write discards the error the write is about to report, and a
        // backdrop tap is the easiest of the three to do by accident.
        if (e.target === e.currentTarget && !busy) onDismiss();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="outcome-sheet-title"
        dir="rtl"
        className="s-sheet w-full max-w-md p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]"
      >
        <header className="mb-3">
          <h2 id="outcome-sheet-title" className="text-base font-semibold" style={{ color: "hsl(var(--s-fg))" }}>
            {mode === "next-touch"
              ? UI.nextTouchTitle
              : mode === "lost"
                ? UI.lostReasonTitle
                : OUTCOME_TITLES[channel ?? "call"]}
          </h2>
          <p className="truncate text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
            {leadName}
          </p>
        </header>

        {error ? (
          <p
            role="alert"
            data-testid="outcome-error"
            className="mb-3 rounded-[var(--s-radius-sm)] px-3 py-2 text-[13px]"
            style={{
              background: "hsl(var(--s-sla-overdue-soft))",
              color: "hsl(var(--s-sla-overdue))",
            }}
          >
            {error}
          </p>
        ) : null}

        {step === "root" ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              data-testid="outcome-answered_progressing"
              disabled={busy}
              className="s-btn s-btn-primary min-h-[56px] text-base"
              onClick={() => setStep("next-touch")}
            >
              {OUTCOME_LABELS.answered_progressing}
            </button>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                data-testid="outcome-no_answer"
                disabled={busy}
                className="s-btn s-btn-ghost min-h-[56px] text-base"
                onClick={() => onSubmit({ result: "no_answer" })}
              >
                {OUTCOME_LABELS.no_answer}
              </button>
              {/* The date this tap is about to commit, before it commits it. */}
              <p
                data-testid="outcome-preview-no_answer"
                className="s-nums text-[12px]"
                style={{ color: "hsl(var(--s-fg-muted))" }}
              >
                {UI.nextTouchPreview(fmtDate(nextBusinessTouchPreview(1).toISOString()))}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                data-testid="outcome-whatsapp_sent"
                disabled={busy}
                className="s-btn s-btn-ghost min-h-[56px] text-base"
                onClick={() => onSubmit({ result: "whatsapp_sent" })}
              >
                {OUTCOME_LABELS.whatsapp_sent}
              </button>
              <p
                data-testid="outcome-preview-whatsapp_sent"
                className="s-nums text-[12px]"
                style={{ color: "hsl(var(--s-fg-muted))" }}
              >
                {UI.nextTouchPreview(fmtDate(nextBusinessTouchPreview(2).toISOString()))}
              </p>
            </div>
            <button
              type="button"
              data-testid="outcome-pick-date"
              disabled={busy}
              className="s-btn s-btn-ghost"
              onClick={() => setStep("next-touch")}
            >
              {UI.chooseAnotherDate}
            </button>
            <button
              type="button"
              data-testid="outcome-lost"
              disabled={busy}
              className="s-btn s-btn-danger-quiet min-h-[56px] text-base"
              onClick={() => setStep("lost-reason")}
            >
              {OUTCOME_LABELS.lost}
            </button>
          </div>
        ) : null}

        {step === "next-touch" ? (
          <div className="flex flex-col gap-2">
            {mode === "outcome" ? (
              <button
                type="button"
                data-testid="outcome-back"
                className="s-btn s-btn-ghost self-start"
                onClick={() => setStep("root")}
              >
                {UI.back}
              </button>
            ) : null}
            <p className="s-eyebrow">{UI.nextTouchTitle}</p>
            <button
              type="button"
              data-testid="next-touch-tomorrow"
              disabled={busy}
              className="s-btn s-btn-ghost min-h-[52px]"
              onClick={() => onSubmit({ ...progressing, next_touch_at: atNineAM(1) })}
            >
              {UI.tomorrow}
            </button>
            <button
              type="button"
              disabled={busy}
              className="s-btn s-btn-ghost min-h-[52px]"
              onClick={() => onSubmit({ ...progressing, next_touch_at: atNineAM(3) })}
            >
              {UI.inThreeDays}
            </button>
            <button
              type="button"
              disabled={busy}
              className="s-btn s-btn-ghost min-h-[52px]"
              onClick={() => onSubmit({ ...progressing, next_touch_at: atNineAM(7) })}
            >
              {UI.inAWeek}
            </button>
            <label className="mt-1 flex items-center gap-2">
              <span className="text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
                {UI.pickDate}
              </span>
              <input
                type="date"
                className="s-input"
                // A next touch in the past would land the lead straight back in
                // the queue as overdue work that was already done.
                min={toDateInputValue(new Date())}
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
              />
            </label>
            <button
              type="button"
              data-testid="next-touch-custom"
              disabled={busy || !customDate}
              className="s-btn s-btn-primary"
              onClick={() =>
                onSubmit({
                  ...progressing,
                  next_touch_at: new Date(`${customDate}T09:00:00`).toISOString(),
                })
              }
            >
              {UI.save}
            </button>
          </div>
        ) : null}

        {step === "lost-reason" ? (
          <div className="flex flex-col gap-2">
            {mode === "outcome" ? (
              <button
                type="button"
                data-testid="outcome-back"
                className="s-btn s-btn-ghost self-start"
                onClick={() => setStep("root")}
              >
                {UI.back}
              </button>
            ) : null}
            <p className="s-eyebrow">{UI.lostReasonTitle}</p>
            {/* One reason, not five toggles — radio semantics say so. */}
            <div role="radiogroup" aria-label={UI.lostReasonGroupLabel} className="flex flex-col gap-2">
              {reasons.map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  data-testid={`lost-reason-${r}`}
                  disabled={busy}
                  className={`s-btn s-btn-ghost min-h-[48px] ${reason === r ? "s-tab-active" : ""}`}
                  onClick={() => setReason(r)}
                  aria-checked={reason === r}
                >
                  {r}
                </button>
              ))}
            </div>
            {reason === freeTextReason ? (
              <input
                className="s-input"
                aria-label={UI.lostReasonOtherLabel}
                placeholder={UI.lostReasonOther}
                value={otherReason}
                onChange={(e) => setOtherReason(e.target.value)}
              />
            ) : null}
            <button
              type="button"
              data-testid="lost-confirm"
              disabled={busy || !chosenReason}
              className="s-btn s-btn-danger-quiet"
              onClick={() =>
                onSubmit(
                  mode === "lost"
                    ? { reason: chosenReason }
                    : { result: "lost", reason: chosenReason },
                )
              }
            >
              {UI.save}
            </button>
            {!chosenReason ? (
              <p role="status" aria-live="polite" className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
                {UI.lostReasonRequired}
              </p>
            ) : null}
          </div>
        ) : null}

        <button
          type="button"
          data-testid="outcome-dismiss"
          // Dismissing mid-write closes the sheet before onError can show what
          // went wrong, and the failure passes in silence.
          disabled={busy}
          className="s-btn s-btn-ghost mt-3 w-full text-[13px]"
          style={{ color: "hsl(var(--s-fg-faint))" }}
          onClick={onDismiss}
        >
          {UI.close}
        </button>
      </div>
    </div>
  );
}
