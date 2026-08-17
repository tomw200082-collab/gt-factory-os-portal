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
import { LOST_REASONS, OUTCOME_LABELS, UI } from "../_lib/labels";
import { toDateInputValue } from "../_lib/format";
import type { OutcomeResult } from "../_lib/types";

export interface OutcomeSubmit {
  result?: OutcomeResult;
  next_touch_at?: string | null;
  reason?: string | null;
}

export interface OutcomeSheetProps {
  leadName: string;
  /**
   * "outcome"     — the full loop, raised on return from a call.
   * "next-touch"  — the דחה button on a card: pick a date, nothing else.
   * "lost"        — the אבוד button on a card: a reason is required.
   *
   * One sheet rather than three so the vocabulary of answering is identical
   * wherever the question is asked.
   */
  mode?: "outcome" | "next-touch" | "lost";
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

export function OutcomeSheet({
  leadName,
  mode = "outcome",
  busy = false,
  error = null,
  onSubmit,
  onDismiss,
}: OutcomeSheetProps) {
  const [step, setStep] = useState<Step>(
    mode === "next-touch" ? "next-touch" : mode === "lost" ? "lost-reason" : "root",
  );
  const [reason, setReason] = useState<string>("");
  const [otherReason, setOtherReason] = useState<string>("");
  const [customDate, setCustomDate] = useState<string>(toDateInputValue(new Date()));
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus trap + Escape, mirroring MobileNav's dialog handling.
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
        onDismiss();
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
  }, [onDismiss, step]);

  const chosenReason = reason === "אחר" ? otherReason.trim() : reason;
  // A card's "דחה" only moves the date; the full loop also records the outcome.
  const progressing: OutcomeSubmit =
    mode === "outcome" ? { result: "answered_progressing" } : {};

  return (
    <div
      data-testid="outcome-sheet"
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "hsl(220 15% 10% / 0.4)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={mode === "next-touch" ? UI.nextTouchTitle : mode === "lost" ? UI.lostReasonTitle : UI.outcomeTitle}
        dir="rtl"
        className="s-sheet w-full max-w-md p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]"
      >
        <header className="mb-3">
          <h2 className="text-base font-semibold" style={{ color: "hsl(var(--s-fg))" }}>
            {mode === "next-touch"
              ? UI.nextTouchTitle
              : mode === "lost"
                ? UI.lostReasonTitle
                : UI.outcomeTitle}
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
            <button
              type="button"
              data-testid="outcome-no_answer"
              disabled={busy}
              className="s-btn s-btn-ghost min-h-[56px] text-base"
              onClick={() => onSubmit({ result: "no_answer" })}
            >
              {OUTCOME_LABELS.no_answer}
            </button>
            <button
              type="button"
              data-testid="outcome-whatsapp_sent"
              disabled={busy}
              className="s-btn s-btn-ghost min-h-[56px] text-base"
              onClick={() => onSubmit({ result: "whatsapp_sent" })}
            >
              {OUTCOME_LABELS.whatsapp_sent}
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
            <p className="s-eyebrow">{UI.lostReasonTitle}</p>
            {LOST_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                data-testid={`lost-reason-${r}`}
                disabled={busy}
                className={`s-btn s-btn-ghost min-h-[48px] ${reason === r ? "s-tab-active" : ""}`}
                onClick={() => setReason(r)}
                aria-pressed={reason === r}
              >
                {r}
              </button>
            ))}
            {reason === "אחר" ? (
              <input
                className="s-input"
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
              <p className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
                {UI.lostReasonRequired}
              </p>
            ) : null}
          </div>
        ) : null}

        <button
          type="button"
          data-testid="outcome-dismiss"
          className="mt-3 w-full text-[13px]"
          style={{ color: "hsl(var(--s-fg-faint))" }}
          onClick={onDismiss}
        >
          {UI.close}
        </button>
      </div>
    </div>
  );
}
