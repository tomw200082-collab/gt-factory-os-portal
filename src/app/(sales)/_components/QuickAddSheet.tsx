"use client";

// Ten seconds, three fields.
//
// Leads that arrive by phone or word of mouth have to be as easy to capture as
// the ones Meta delivers, or they stay invisible — which is the failure this
// whole build exists to end.

import { useEffect, useRef, useState } from "react";
import { UI } from "../_lib/labels";
import { useReturnFocus } from "../_lib/useReturnFocus";

export interface QuickAddSheetProps {
  busy?: boolean;
  error?: string | null;
  onSubmit: (vars: {
    contact_name: string;
    phone?: string;
    business_name?: string;
    source_note?: string;
  }) => void;
  onDismiss: () => void;
}

export function QuickAddSheet({ busy = false, error = null, onSubmit, onDismiss }: QuickAddSheetProps) {
  useReturnFocus();
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [business, setBusiness] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
    const panel = panelRef.current;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onDismiss();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled])',
        ),
      );
      if (focusable.length === 0) return;
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
  }, [onDismiss]);

  const valid = contactName.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "hsl(var(--s-overlay))" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <form
        ref={panelRef as unknown as React.RefObject<HTMLFormElement>}
        role="dialog"
        aria-modal="true"
        aria-label={UI.quickAddTitle}
        dir="rtl"
        data-testid="quick-add-sheet"
        className="s-sheet w-full max-w-md p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]"
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (!valid) return;
          onSubmit({
            contact_name: contactName.trim(),
            phone: phone.trim() || undefined,
            business_name: business.trim() || undefined,
            source_note: note.trim() || undefined,
          });
        }}
      >
        <h2 className="mb-3 text-base font-semibold" style={{ color: "hsl(var(--s-fg))" }}>
          {UI.quickAddTitle}
        </h2>

        {error ? (
          <p
            role="alert"
            data-testid="quick-add-error"
            className="mb-3 rounded-[var(--s-radius-sm)] px-3 py-2 text-[13px]"
            style={{
              background: "hsl(var(--s-sla-overdue-soft))",
              color: "hsl(var(--s-sla-overdue))",
            }}
          >
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="s-eyebrow">{UI.contactName}</span>
            <input
              ref={firstFieldRef}
              className="s-input"
              data-testid="quick-add-name"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              aria-invalid={touched && !valid}
              aria-describedby={touched && !valid ? "quick-add-name-error" : undefined}
            />
            {touched && !valid ? (
              <span
                id="quick-add-name-error"
                className="text-[12px]"
                style={{ color: "hsl(var(--s-sla-overdue))" }}
              >
                {UI.contactNameRequired}
              </span>
            ) : null}
          </label>

          <label className="flex flex-col gap-1">
            <span className="s-eyebrow">{UI.phone}</span>
            <input
              className="s-input"
              type="tel"
              inputMode="tel"
              data-testid="quick-add-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="s-eyebrow">{UI.businessName}</span>
            <input
              className="s-input"
              data-testid="quick-add-business"
              value={business}
              onChange={(e) => setBusiness(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="s-eyebrow">{UI.sourceNote}</span>
            <input
              className="s-input"
              data-testid="quick-add-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="submit"
            disabled={busy}
            data-testid="quick-add-save"
            className="s-btn s-btn-primary flex-1"
          >
            {UI.save}
          </button>
          <button type="button" className="s-btn s-btn-ghost" onClick={onDismiss}>
            {UI.cancel}
          </button>
        </div>
      </form>
    </div>
  );
}
