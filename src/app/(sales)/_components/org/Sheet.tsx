"use client";

// The one bottom sheet the business workspace uses: source and time, an
// order's lines, a month's orders, a confirmation. Same frame as the quick-add
// and outcome sheets: a scrim, a 28px top edge, a handle, focus held inside,
// Escape and the scrim close it, and focus goes back to what opened it.

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { UI } from "../../_lib/labels";
import { useReturnFocus } from "../../_lib/useReturnFocus";

export interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
  /** A confirmation is an alert dialog: it asks before something changes. */
  alert?: boolean;
  /** Sticky actions at the bottom, clear of the home indicator. */
  footer?: ReactNode;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Sheet({ title, onClose, children, testId, alert = false, footer }: SheetProps) {
  useReturnFocus();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const panel = panelRef.current;
    panel?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="s-scrim fixed inset-0 z-50 flex items-end justify-center md:items-center"
      style={{ background: "hsl(var(--s-overlay))" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role={alert ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={alert ? bodyId : undefined}
        dir="rtl"
        data-testid={testId}
        className="s-sheet s-org-sheet flex w-full max-w-lg flex-col"
      >
        <div className="flex items-start gap-2 px-4 pt-1">
          <h2 id={titleId} className="min-w-0 flex-1 pt-2 text-[17px] font-semibold leading-snug" style={{ color: "hsl(var(--s-fg))" }}>
            {title}
          </h2>
          <button
            type="button"
            aria-label={UI.close}
            onClick={onClose}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
            style={{ color: "hsl(var(--s-fg-muted))" }}
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <div id={bodyId} className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer ? <div className="s-sheet-footer flex flex-wrap gap-2 px-4 pt-3">{footer}</div> : null}
      </div>
    </div>
  );
}
