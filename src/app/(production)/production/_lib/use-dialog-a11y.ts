"use client";

// ---------------------------------------------------------------------------
// useDialogA11y — the focus + keyboard contract every hand-rolled modal on the
// /production surface needs. The picking screen has three inline dialogs (the
// "Done collecting" confirm, the edit-quantity sheet, the unplanned-run dialog)
// that predate a Radix migration; each was missing a proper focus trap and
// focus restore (A11Y-001/002/003). This hook pulls the hard part down behind
// one call, composing the shared focus-trap primitive.
//
// It is `active`-driven (not mount-driven) so it works whether the caller
// unmounts the dialog when closed or keeps it mounted and toggles a flag —
// both patterns exist on this surface.
//
// Contract:
//   - When `active` flips true: capture the currently-focused element, then
//     move focus to `initialFocusRef.current` (falling back to the dialog
//     container). Inputs are also selected for fast overwrite.
//   - When `active` flips false (or the component unmounts): restore focus to
//     the captured trigger.
//   - Escape closes via `onClose`, unless `closeDisabled` (e.g. a save is in
//     flight); the event is stopped so it does not bubble to outer handlers.
//   - Tab / Shift+Tab are trapped inside the dialog (useFocusTrap).
//
// Callers spread the returned ref + handler onto their existing markup, so the
// DOM and visual behaviour are unchanged:
//
//   const a11y = useDialogA11y({ active: open, onClose, closeDisabled: pending });
//   <div ref={a11y.dialogRef} onKeyDown={a11y.onKeyDown} tabIndex={-1} … />
//
// Owner: Tranche 141 (UX/UI review — A11Y-001/002/003).
// ---------------------------------------------------------------------------

import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent,
  type MutableRefObject,
} from "react";
import { useFocusTrap } from "@/components/a11y/useFocusTrap";

export interface UseDialogA11yOptions {
  /** True while the dialog is open. Drives focus capture / restore + the trap. */
  active: boolean;
  /** Called when Escape is pressed (and not `closeDisabled`). */
  onClose: () => void;
  /** When true, Escape does not close — e.g. a submit is in flight. */
  closeDisabled?: boolean;
}

export interface UseDialogA11yApi {
  dialogRef: MutableRefObject<HTMLDivElement | null>;
  /** Attach to the element that should receive focus on open (heading with
   *  tabIndex={-1}, or a first input). Optional — falls back to the dialog. */
  initialFocusRef: MutableRefObject<HTMLElement | null>;
  onKeyDown: (event: KeyboardEvent) => void;
}

export function useDialogA11y({
  active,
  onClose,
  closeDisabled,
}: UseDialogA11yOptions): UseDialogA11yApi {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const initialFocusRef = useRef<HTMLElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const focusTrap = useFocusTrap(dialogRef, active);

  useEffect(() => {
    if (!active) return;
    previouslyFocusedRef.current =
      (document.activeElement as HTMLElement | null) ?? null;
    // Defer a tick so the dialog markup has committed before we move focus.
    const id = window.setTimeout(() => {
      const target = initialFocusRef.current ?? dialogRef.current;
      target?.focus();
      if (
        target &&
        "select" in target &&
        typeof (target as HTMLInputElement).select === "function"
      ) {
        (target as HTMLInputElement).select();
      }
    }, 20);
    return () => {
      window.clearTimeout(id);
      const el = previouslyFocusedRef.current;
      if (el && typeof el.focus === "function") {
        try {
          el.focus();
        } catch {
          /* trigger may have unmounted — ignore */
        }
      }
    };
  }, [active]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!active) return;
      if (event.key === "Escape" && !closeDisabled) {
        event.stopPropagation();
        onClose();
        return;
      }
      focusTrap.onKeyDown(event);
    },
    [active, closeDisabled, onClose, focusTrap],
  );

  return { dialogRef, initialFocusRef, onKeyDown };
}
