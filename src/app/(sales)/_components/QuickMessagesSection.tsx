"use client";

// Quick messages by situation (tranche 203, D-042).
//
// Six situations, each with its own text, its own save and its own "who changed it".
// A chip bar inserts a variable where the cursor is; a preview fills the text on a
// synthetic lead, signed by the person looking at it — the same signer the WhatsApp
// button uses for them.

import { useEffect, useRef, useState } from "react";
import { QUICK_SITUATION_LABELS, UI, actorLabel } from "../_lib/labels";
import { fmtRelative } from "../_lib/format";
import { QUICK_SITUATIONS, QUICK_VARIABLES, fillQuickMessage, insertAtCursor } from "../_lib/quickMessages";
import type { QuickSituation } from "../_lib/types";

const MAX = 1000;
/** A synthetic lead, never a real one. */
const SAMPLE = { name: "דנה", business: "קפה לדוגמה", menu: "תפריט המאצ׳ה" };

export interface QuickMessagesSectionProps {
  messages: Record<QuickSituation, string>;
  changes: Partial<Record<QuickSituation, { actor: string; at: string }>>;
  signer: string;
  onSave: (situation: QuickSituation, text: string) => void;
  savingSituation: QuickSituation | null;
  savedSituation: QuickSituation | null;
  error: { situation: QuickSituation; message: string } | null;
}

function QuickRow({
  situation, initial, change, signer, saving, saved, error, onSave,
}: {
  situation: QuickSituation;
  initial: string;
  change?: { actor: string; at: string };
  signer: string;
  saving: boolean;
  saved: boolean;
  error: string | null;
  onSave: (text: string) => void;
}) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  // where the cursor was when the textarea lost focus to a chip
  const caret = useRef<{ start: number; end: number }>({ start: initial.length, end: initial.length });
  useEffect(() => setText(initial), [initial]);

  const trimmed = text.trim();
  const problem = trimmed.length === 0 ? UI.quickEmpty : text.length > MAX ? UI.quickTooLong : null;
  const dirty = trimmed !== initial.trim();
  const remember = () => {
    const el = ref.current;
    if (el) caret.current = { start: el.selectionStart, end: el.selectionEnd };
  };
  const id = `quick-${situation}`;

  return (
    <li data-testid={id} className="s-quick-row flex flex-col gap-2">
      <label htmlFor={`${id}-text`} className="font-medium" style={{ color: "hsl(var(--s-fg))" }}>
        {QUICK_SITUATION_LABELS[situation]}
      </label>
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label={UI.quickVariables}>
        <span className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }} aria-hidden>{UI.quickVariables}</span>
        {QUICK_VARIABLES.map((v) => (
          <button
            key={v}
            type="button"
            dir="ltr"
            data-testid={`quick-chip-${v.slice(2, -2)}`}
            className="s-quick-chip"
            // keep the textarea's caret: a mouse-down on a chip would blur it first
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const el = ref.current;
              const { start, end } = el && document.activeElement === el
                ? { start: el.selectionStart, end: el.selectionEnd } : caret.current;
              const next = insertAtCursor(text, start, end, v);
              setText(next.text);
              caret.current = { start: next.cursor, end: next.cursor };
              requestAnimationFrame(() => {
                el?.focus();
                el?.setSelectionRange(next.cursor, next.cursor);
              });
            }}
          >
            {v}
          </button>
        ))}
      </div>
      <textarea
        ref={ref}
        id={`${id}-text`}
        data-testid={`quick-text-${situation}`}
        className="s-input"
        dir="rtl"
        rows={4}
        value={text}
        aria-invalid={problem ? true : undefined}
        aria-describedby={`${id}-error ${id}-count`}
        onChange={(e) => setText(e.target.value)}
        onSelect={remember}
        onKeyUp={remember}
        onClick={remember}
        onBlur={remember}
      />
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span id={`${id}-error`} role="alert" data-testid={`quick-error-${situation}`} style={{ color: "hsl(var(--s-sla-overdue))" }}>
          {problem ?? error ?? ""}
        </span>
        <span id={`${id}-count`} className="s-nums ms-auto" style={{ color: "hsl(var(--s-fg-faint))" }}>
          {UI.quickCount(text.length)}
        </span>
      </div>
      <figure className="s-quick-preview" data-testid={`quick-preview-${situation}`}>
        <figcaption className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>{UI.quickPreview}</figcaption>
        <p className="s-quick-bubble whitespace-pre-line text-[14px]">
          {fillQuickMessage(text, { name: SAMPLE.name, rep: signer, business: SAMPLE.business, menu: SAMPLE.menu })}
        </p>
      </figure>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid={`quick-save-${situation}`}
          className="s-btn s-btn-ghost"
          aria-busy={saving || undefined}
          disabled={saving || Boolean(problem) || !dirty}
          onClick={() => {
            if (problem || !dirty) return;
            onSave(trimmed);
          }}
        >
          {UI.quickSave}
        </button>
        <span role="status" className="text-[12px]" style={{ color: "hsl(var(--s-status-won))" }}>
          {saved ? UI.quickSaved : ""}
        </span>
        {change ? (
          <span className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
            {UI.quickChangedBy(actorLabel(change.actor), fmtRelative(change.at))}
          </span>
        ) : null}
      </div>
    </li>
  );
}

export function QuickMessagesSection({
  messages, changes, signer, onSave, savingSituation, savedSituation, error,
}: QuickMessagesSectionProps) {
  return (
    <section className="s-panel flex w-full max-w-2xl flex-col gap-3" aria-labelledby="settings-quick-title" data-testid="settings-quick">
      <h2 id="settings-quick-title" className="s-section-heading">{UI.quickTitle}</h2>
      <p className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>{UI.quickHint}</p>
      <ul className="flex flex-col gap-5">
        {QUICK_SITUATIONS.map((s) => (
          <QuickRow
            key={s}
            situation={s}
            initial={messages[s] ?? ""}
            change={changes[s]}
            signer={signer}
            saving={savingSituation === s}
            saved={savedSituation === s}
            error={error?.situation === s ? error.message : null}
            onSave={(text) => onSave(s, text)}
          />
        ))}
      </ul>
    </section>
  );
}
