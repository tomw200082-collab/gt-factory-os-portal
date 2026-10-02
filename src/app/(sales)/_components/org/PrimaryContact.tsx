"use client";

// The person to call, when one is verified. The call, WhatsApp and email links
// come from the API, which sends them only for a verified contact; this
// component never builds a link from a raw value.

import { Mail, MessageCircle, Phone, UserRoundCheck } from "lucide-react";
import { fmtPhone } from "../../_lib/format";
import { CONTACT_KIND_LABELS, UI } from "../../_lib/labels";
import type { ContactRow } from "../../_lib/types";
import { PanelError } from "../EmptyStates";

export function PrimaryContact({
  contact,
  awaiting,
  loading,
  error = false,
  onRetry,
}: {
  contact: ContactRow | null;
  awaiting: number;
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const name = contact?.name ?? UI.contactUnnamed;
  return (
    <section data-testid="primary-contact" aria-labelledby="org-contact-title" className="s-panel s-org-block">
      <h2 id="org-contact-title" className="s-section-heading flex items-center gap-2">
        <UserRoundCheck size={16} aria-hidden />
        {UI.primaryContactTitle}
      </h2>
      {loading ? (
        <div className="mt-3 h-16 animate-pulse rounded-[var(--s-radius)]" aria-busy="true" style={{ background: "hsl(var(--s-surface-sunken))" }}>
          <span className="sr-only">{UI.loading}</span>
        </div>
      ) : error ? (
        <PanelError what={UI.panelWhatContact} onRetry={() => onRetry?.()} />
      ) : contact ? (
        <div className="mt-2 flex flex-col gap-3">
          <div className="min-w-0">
            <p className="text-[17px] font-semibold leading-snug [overflow-wrap:anywhere]" style={{ color: "hsl(var(--s-fg))" }}>
              {name}
            </p>
            <p className="s-nums mt-0.5 flex flex-wrap gap-x-3 text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
              <span>{CONTACT_KIND_LABELS[contact.kind]}</span>
              {contact.phone ? <bdi dir="ltr">{fmtPhone(contact.phone)}</bdi> : null}
              {contact.email ? <bdi dir="ltr" className="[overflow-wrap:anywhere]">{contact.email}</bdi> : null}
            </p>
          </div>
          <div className="s-contact-actions">
            {contact.tel ? (
              <a href={contact.tel} className="s-btn s-btn-primary" aria-label={UI.callNamed(name)}>
                <Phone size={18} aria-hidden />
                {UI.call}
              </a>
            ) : null}
            {contact.wa ? (
              <a href={contact.wa} target="_blank" rel="noopener noreferrer" className="s-btn s-btn-ghost" aria-label={UI.whatsappNamed(name)}>
                <MessageCircle size={18} aria-hidden />
                {UI.whatsapp}
              </a>
            ) : null}
            {contact.mailto ? (
              <a href={contact.mailto} className="s-btn s-btn-ghost" aria-label={UI.emailNamed(name)}>
                <Mail size={18} aria-hidden />
                {UI.email}
              </a>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-2">
          <p className="text-[15px] font-medium" style={{ color: "hsl(var(--s-fg))" }}>{UI.noVerifiedContact}</p>
          {awaiting > 0 ? (
            <a href="#org-contacts" className="s-link text-[13px]">
              {UI.awaitingReview(awaiting)}
            </a>
          ) : null}
        </div>
      )}
    </section>
  );
}
