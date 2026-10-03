"use client";

// The WhatsApp button (tranche 203, D-042).
//
// It opens wa.me in the rep's own WhatsApp with the message for the lead's situation
// (the server's suggested_situation), variables filled and signed by the sender. "הודעה
// אחרת" picks another situation. Nothing is sent by the system: the send is the rep's.
//
// A lead whose phone opted out («הסר», «תודה, לא כרגע», or Meta's stop) gets a disabled
// button that says why, and nothing is armed. The call next to it stays.

import { useId, useRef, useState } from "react";
import { Check, MessageCircle } from "lucide-react";
import { QUICK_SITUATION_LABELS, UI } from "../_lib/labels";
import { waHref } from "../_lib/wa";
import { QUICK_SITUATIONS, isOptedOut, quickMessageFor, suggestedSituation, type QuickLead } from "../_lib/quickMessages";
import type { QuickSituation, SalesSettings } from "../_lib/types";

export interface WhatsAppQuickProps {
  leadId: string;
  phone: string | null | undefined;
  lead: QuickLead;
  settings: SalesSettings | null | undefined;
  /** Called on tap, before the browser follows the wa.me link (outreach arming). */
  onArm?: (leadId: string, channel: "whatsapp") => void;
  testId: string;
  /** The button's shell, as the surface it sits on needs it. */
  tone?: "ghost" | "ghost-on-tint";
}

export function WhatsAppQuick({ leadId, phone, lead, settings, onArm, testId, tone = "ghost" }: WhatsAppQuickProps) {
  const suggested = suggestedSituation(lead);
  const [picked, setPicked] = useState<QuickSituation | null>(null);
  const [picking, setPicking] = useState(false);
  const listId = useId();
  const otherRef = useRef<HTMLButtonElement>(null);
  if (!phone) return null;

  const shell = `s-btn w-full ${tone === "ghost-on-tint" ? "s-btn-ghost-on-tint" : "s-btn-ghost"}`;

  if (isOptedOut(lead) || suggested === "opted_out") {
    return (
      <div className="flex min-w-0 flex-1 basis-full flex-col sm:basis-0">
        <button type="button" disabled data-testid={testId} className={`${shell} s-wa-blocked`}>
          <MessageCircle size={16} aria-hidden />
          <span>{UI.waOptedOut}</span>
        </button>
      </div>
    );
  }

  const situation: QuickSituation = picked ?? (suggested as QuickSituation);
  const href = waHref(phone, quickMessageFor(lead, settings, situation));
  if (!href) return null;
  // Only an API with quick messages has situations to choose between.
  const canPick = Boolean(settings?.whatsapp_quick_messages);

  return (
    <div
      className="flex min-w-0 flex-1 flex-col"
      // Escape closes the picker first; only a closed picker lets the drawer hear it.
      onKeyDown={(e) => {
        if (e.key === "Escape" && picking) {
          e.stopPropagation();
          e.nativeEvent.stopImmediatePropagation();
          setPicking(false);
          otherRef.current?.focus();
        }
      }}
    >
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        data-testid={testId}
        data-situation={situation}
        className={shell}
        onClick={() => onArm?.(leadId, "whatsapp")}
      >
        <MessageCircle size={16} aria-hidden />
        {UI.whatsapp}
      </a>
      {canPick ? (
        <button
          ref={otherRef}
          type="button"
          data-testid={`${testId}-other`}
          aria-expanded={picking}
          aria-controls={listId}
          className="s-wa-other"
          onClick={() => setPicking((p) => !p)}
        >
          {/* after a pick it names what the button will open */}
          {picked ? QUICK_SITUATION_LABELS[picked] : UI.waOther}
        </button>
      ) : null}
      {picking ? (
        <ul id={listId} data-testid={`${testId}-situations`} aria-label={UI.waPickTitle} className="s-wa-situations">
          {QUICK_SITUATIONS.map((s) => (
            <li key={s}>
              <button
                type="button"
                data-testid={`${testId}-situation-${s}`}
                aria-pressed={s === situation}
                className="s-wa-situation"
                onClick={() => {
                  setPicked(s);
                  setPicking(false);
                }}
              >
                {/* the current choice is marked by a check, not by colour alone */}
                <span className="s-wa-situation-mark" aria-hidden>
                  {s === situation ? <Check size={16} /> : null}
                </span>
                {QUICK_SITUATION_LABELS[s]}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
