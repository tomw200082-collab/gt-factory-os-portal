"use client";

import { useCallback, useRef } from "react";

/**
 * Focus return for a Radix Dialog that has no <Dialog.Trigger> (Drawer and
 * ConfirmDialog are opened by state, not by a trigger). Radix's own
 * onCloseAutoFocus calls preventDefault() and then focuses its trigger ref,
 * which is empty here, so focus fell to <body>. These two handlers remember the
 * element that had focus when the dialog opened and put focus back on it when it
 * closes. If the opener is gone or disabled (a button that went pending), focus
 * is left where the browser put it.
 *
 *   const focus = useRestoreFocus();
 *   <Dialog.Content onOpenAutoFocus={focus.onOpenAutoFocus}
 *                   onCloseAutoFocus={focus.onCloseAutoFocus}>
 */
export function useRestoreFocus() {
  const opener = useRef<HTMLElement | null>(null);

  const onOpenAutoFocus = useCallback(() => {
    // Runs before Radix moves focus into the dialog.
    const el = document.activeElement;
    opener.current = el instanceof HTMLElement && el !== document.body ? el : null;
  }, []);

  const onCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
    const el = opener.current;
    opener.current = null;
    if (el && el.isConnected && !(el as HTMLButtonElement).disabled) el.focus();
  }, []);

  return { onOpenAutoFocus, onCloseAutoFocus };
}
