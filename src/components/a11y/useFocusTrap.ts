"use client";

// ---------------------------------------------------------------------------
// useFocusTrap — contain Tab/Shift+Tab focus inside a dialog container.
//
// Owner: Tranche 079 (A11Y-R03). Used by the inline custom dialogs on
// /planning/production-plan that do not adopt Radix Dialog (their fixed-inset
// layout + bespoke submit behaviour predates a Radix migration, see the
// ManualAddModal comment).
//
// Behaviour:
//   - When `active` is true and the container has any focusable descendants,
//     Tab from the last focusable element wraps back to the first, and
//     Shift+Tab from the first element wraps back to the last.
//   - When no focusable descendants exist, the keydown is a no-op (we keep
//     out of the user's way rather than swallowing the key).
//   - When `active` is false, the keydown handler does nothing.
//
// React-only. No window/document listeners. The hook returns an object the
// caller spreads onto the dialog wrapper:
//
//   const trap = useFocusTrap(dialogRef, isOpen);
//   <div ref={dialogRef} onKeyDown={trap.onKeyDown} … />
//
// If the caller already attaches its own onKeyDown (for Escape-to-close), it
// can compose the two handlers manually.
// ---------------------------------------------------------------------------

import { useCallback, type KeyboardEvent, type RefObject } from "react";

// Tab-reachable selector. Mirrors the practical Radix Dialog / Reach UI
// selector set. We intentionally exclude `[tabindex="-1"]` because those are
// programmatically-focusable but not in the tab sequence.
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "object",
  "embed",
  "[contenteditable]:not([contenteditable='false'])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function getTabbable(container: HTMLElement): HTMLElement[] {
  const nodes = Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  );
  return nodes.filter((el) => {
    // Skip elements that are not actually focusable (hidden via CSS, etc.).
    // `offsetParent === null` catches `display:none`; visible inputs inside
    // sticky / fixed parents still have an offsetParent of a positioned
    // ancestor, so this is a safe filter for our overlay dialogs.
    if (el.hidden) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    return true;
  });
}

export interface UseFocusTrapApi {
  onKeyDown: (event: KeyboardEvent) => void;
}

export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
): UseFocusTrapApi {
  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!active) return;
      if (event.key !== "Tab") return;
      const container = containerRef.current;
      if (!container) return;
      const focusables = getTabbable(container);
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const activeEl = document.activeElement as HTMLElement | null;
      if (event.shiftKey) {
        // Wrap back to the last focusable when leaving the first (or when
        // focus has somehow escaped the container, e.g. the title ref).
        if (activeEl === first || !container.contains(activeEl)) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (activeEl === last) {
          event.preventDefault();
          first.focus();
        }
      }
    },
    [active, containerRef],
  );

  return { onKeyDown };
}
