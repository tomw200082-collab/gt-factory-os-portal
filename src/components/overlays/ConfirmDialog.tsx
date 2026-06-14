"use client";

// ---------------------------------------------------------------------------
// useConfirm() + <ConfirmDialog> — accessible replacement for window.confirm.
//
// Tranche 067 (admin UX/UI audit THEME A). window.confirm() is unstyled,
// inaccessible (no ARIA / focus management, blocks the event loop), names
// records by raw id, and has no loading affordance. This hook gives a
// promise-based, near-drop-in replacement built on Radix Dialog:
//
//   const { confirm, dialog } = useConfirm();
//   ...
//   if (!(await confirm({ title, description, tone: "danger" }))) return;
//   doMutation();
//   ...
//   return <>{dialog} ...</>;   // render the dialog once in the component
//
// Radix handles the focus trap, Escape, focus return, and aria-modal. We set
// role="alertdialog" (confirmation semantics) and move initial focus to the
// Cancel button so an accidental Enter does not fire a destructive action.
//
// The hook is self-contained (local state, returns its own JSX), so it composes
// into any component — page-level handlers or deeply-nested cells alike — with
// no app-wide provider.
// ---------------------------------------------------------------------------

import * as Dialog from "@radix-ui/react-dialog";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface ConfirmOptions {
  /** Dialog heading — name the affected entity by its human name, not an id. */
  title: string;
  /** Optional supporting line describing the consequence. */
  description?: ReactNode;
  /** Confirm button label. Default "Confirm". */
  confirmLabel?: string;
  /** Cancel button label. Default "Cancel". */
  cancelLabel?: string;
  /** "danger" renders the confirm button as destructive (btn-danger). */
  tone?: "default" | "danger";
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

export interface UseConfirmResult {
  /** Open the dialog; resolves true on confirm, false on cancel/escape/backdrop. */
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  /** Render this once in the calling component's JSX. */
  dialog: JSX.Element;
}

export function useConfirm(): UseConfirmResult {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...opts, resolve });
      }),
    [],
  );

  // Settle the active promise and close. Resolving an already-settled promise
  // is a no-op, so React StrictMode's double-invoked updater is harmless.
  const settle = useCallback((ok: boolean) => {
    setPending((prev) => {
      prev?.resolve(ok);
      return null;
    });
  }, []);

  const dialog = <ConfirmDialogView pending={pending} onSettle={settle} />;
  return { confirm, dialog };
}

function ConfirmDialogView({
  pending,
  onSettle,
}: {
  pending: Pending | null;
  onSettle: (ok: boolean) => void;
}): JSX.Element {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const open = pending !== null;
  const tone = pending?.tone ?? "default";

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        // Escape / backdrop / programmatic close all count as cancel.
        if (!next) onSettle(false);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]",
            "duration-150 data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out data-[state=open]:fade-in",
          )}
        />
        <Dialog.Content
          role="alertdialog"
          onOpenAutoFocus={(e) => {
            // Default focus to Cancel so an accidental Enter never confirms.
            e.preventDefault();
            cancelRef.current?.focus();
          }}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2",
            "rounded-lg border border-border/70 bg-bg-raised p-5 shadow-pop",
            "duration-150 data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out data-[state=open]:fade-in",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          <Dialog.Title className="text-base font-semibold tracking-tightish text-fg-strong">
            {pending?.title ?? ""}
          </Dialog.Title>
          {pending?.description ? (
            <Dialog.Description className="mt-2 text-sm leading-relaxed text-fg-muted">
              {pending.description}
            </Dialog.Description>
          ) : (
            // Radix warns without a Description; emit a visually-hidden one.
            <Dialog.Description className="sr-only">
              Please confirm this action.
            </Dialog.Description>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button
              ref={cancelRef}
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onSettle(false)}
            >
              {pending?.cancelLabel ?? "Cancel"}
            </button>
            <button
              type="button"
              className={cn(
                "btn btn-sm",
                tone === "danger" ? "btn-danger" : "btn-primary",
              )}
              onClick={() => onSettle(true)}
            >
              {pending?.confirmLabel ?? "Confirm"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
