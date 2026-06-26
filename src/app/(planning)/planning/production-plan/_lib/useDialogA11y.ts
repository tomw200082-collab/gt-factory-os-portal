"use client";

// useDialogA11y — the focus + keyboard contract every inline modal on
// /planning/production-plan repeats verbatim. Before this hook the same ~26
// lines (three refs, useFocusTrap, a focus capture/restore effect, and an
// identical Escape+trap keydown handler) were hand-copied into each of the
// seven page.tsx modals and the RecipeOverridePanel — eight chances to get the
// a11y contract subtly wrong. The hook pulls that hard part down behind one
// call; callers spread the returned refs/handler onto their existing dialog
// markup, so the DOM and behaviour are unchanged.
//
// Contract (matches the pre-extraction inline code exactly):
//   - On mount, capture the element that had focus; move focus to the title
//     (falling back to the dialog container). On unmount, restore focus to the
//     captured element.
//   - Escape closes via onClose, unless `closeDisabled` (e.g. a submit is in
//     flight); the event is stopped so it doesn't bubble to outer handlers.
//   - Tab / Shift+Tab are trapped inside the dialog (useFocusTrap).
//
// Owner: Tranche 112 (deepen — dialog-shell consolidation).

import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type MutableRefObject,
} from "react";
import { useFocusTrap } from "@/components/a11y/useFocusTrap";

export interface UseDialogA11yOptions {
  /** Called when Escape is pressed (and not `closeDisabled`). */
  onClose: () => void;
  /** When true, Escape does not close — e.g. a submit is in flight. */
  closeDisabled?: boolean;
}

export interface UseDialogA11yApi {
  dialogRef: MutableRefObject<HTMLDivElement | null>;
  titleRef: MutableRefObject<HTMLHeadingElement | null>;
  onKeyDown: (event: KeyboardEvent) => void;
}

export function useDialogA11y({
  onClose,
  closeDisabled,
}: UseDialogA11yOptions): UseDialogA11yApi {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const focusTrap = useFocusTrap(dialogRef, true);

  useEffect(() => {
    previouslyFocusedRef.current =
      (document.activeElement as HTMLElement | null) ?? null;
    queueMicrotask(() => {
      if (titleRef.current) titleRef.current.focus();
      else if (dialogRef.current) dialogRef.current.focus();
    });
    return () => {
      const el = previouslyFocusedRef.current;
      if (el && typeof el.focus === "function") {
        try {
          el.focus();
        } catch {
          /* trigger may have unmounted — ignore */
        }
      }
    };
  }, []);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && !closeDisabled) {
      event.stopPropagation();
      onClose();
      return;
    }
    focusTrap.onKeyDown(event);
  }

  return { dialogRef, titleRef, onKeyDown };
}
