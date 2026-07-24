"use client";

// ---------------------------------------------------------------------------
// DoneBar — sticky bottom action bar. A slim progress meter (resolved / total)
// drives toward the "Done collecting" moment. The button enables ONLY when
// every row is resolved; while blocked it carries aria-disabled +
// aria-describedby naming exactly how many lines are still unchecked. Pressing
// it opens a plain-English confirm ("Take these from stock?") before the
// stock-decrementing pick-confirm fires.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { CheckCheck, Loader2 } from "lucide-react";

import { cn } from "@/lib/cn";
import { t } from "../../../_lib/copy";
import { useDialogA11y } from "../../../_lib/use-dialog-a11y";

export function DoneBar({
  total,
  resolved,
  onConfirm,
  pending,
}: {
  total: number;
  resolved: number;
  onConfirm: () => void;
  pending: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const allDone = total > 0 && resolved === total;
  const left = total - resolved;
  const pct = total > 0 ? Math.round((resolved / total) * 100) : 0;

  const blockedMsg =
    left === 1
      ? t("pick_done_left_one")
      : `${left} ${t("pick_done_left_many")}`;

  return (
    <>
      <div
        className="sticky bottom-0 left-0 right-0 z-30 -mx-4 mt-6 border-t border-border bg-bg/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm sm:-mx-6 sm:px-6"
        data-testid="done-bar"
      >
        {/* Progress meter */}
        <div className="mb-2.5">
          <div className="mb-1 flex items-center justify-between text-2xs font-semibold">
            <span className="uppercase tracking-sops text-fg-muted">
              {resolved} / {total} {t("pick_progress")}
            </span>
            <span
              className={cn(
                "font-mono tabular-nums",
                allDone ? "text-success-fg" : "text-fg-muted",
              )}
            >
              {pct}%
            </span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-border/50"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={resolved}
            aria-label={`${resolved} of ${total} ${t("pick_progress")}`}
          >
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300 motion-reduce:transition-none",
                allDone ? "bg-success" : "bg-accent",
              )}
              style={{ width: `${pct}%` }}
              aria-hidden
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => allDone && !pending && setConfirmOpen(true)}
          disabled={pending}
          aria-disabled={!allDone || pending}
          aria-describedby={!allDone ? "done-blocked-reason" : undefined}
          data-testid="done-collecting"
          className={cn(
            "btn btn-lg w-full gap-2 text-base",
            allDone
              ? "btn-primary"
              : "cursor-not-allowed border-border bg-bg-subtle text-fg-subtle hover:bg-bg-subtle",
          )}
        >
          {pending ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              {t("pick_done_saving")}
            </>
          ) : (
            <>
              <CheckCheck className="h-5 w-5" strokeWidth={2.5} aria-hidden />
              {t("pick_done_button")}
            </>
          )}
        </button>
        {!allDone ? (
          <p
            id="done-blocked-reason"
            className="mt-1.5 text-center text-xs text-fg-muted"
            data-testid="done-blocked-reason"
          >
            {blockedMsg}
          </p>
        ) : null}
      </div>

      {/* Confirm dialog */}
      {confirmOpen ? (
        <DoneConfirmDialog
          pending={pending}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            onConfirm();
          }}
        />
      ) : null}
    </>
  );
}

/** The "Take these from stock?" confirm. Its own component so useDialogA11y
 *  mounts/unmounts with the dialog — focus captures the Done button on open and
 *  restores to it on close (A11Y-001/002/003). */
function DoneConfirmDialog({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const a11y = useDialogA11y({
    active: true,
    onClose: onCancel,
    closeDisabled: pending,
  });
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-fg/40 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={() => !pending && onCancel()}
      data-testid="done-confirm-backdrop"
    >
      <div
        ref={a11y.dialogRef}
        onKeyDown={a11y.onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="done-confirm-title"
        tabIndex={-1}
        className="reveal w-full max-w-sm rounded-t-2xl border border-border bg-bg p-6 text-center shadow-pop outline-none sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="done-confirm"
      >
        <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent">
          <CheckCheck className="h-7 w-7" strokeWidth={2} aria-hidden />
        </span>
        <h2
          id="done-confirm-title"
          className="text-lg font-bold text-fg-strong outline-none"
        >
          {t("pick_done_confirm_title")}
        </h2>
        <p className="mt-1 text-sm text-fg-muted">{t("pick_done_confirm_body")}</p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            ref={(el) => {
              a11y.initialFocusRef.current = el;
            }}
            className="btn btn-primary btn-lg w-full gap-2"
            onClick={onConfirm}
            disabled={pending}
            data-testid="done-confirm-yes"
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                {t("pick_done_saving")}
              </>
            ) : (
              t("pick_done_confirm_yes")
            )}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-lg w-full"
            onClick={onCancel}
            disabled={pending}
            data-testid="done-confirm-no"
          >
            {t("pick_done_confirm_no")}
          </button>
        </div>
      </div>
    </div>
  );
}
