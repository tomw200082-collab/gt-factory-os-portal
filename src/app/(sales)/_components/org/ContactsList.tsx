"use client";

// The people at the business: the verified ones you can call from here, and,
// apart, the ones nobody has confirmed yet. An unverified row shows its values
// as text and never as a call, WhatsApp or email link, whatever arrives.
// A manager confirms or rejects a row; that is the only way a call button can
// ever appear for this business.

import { useState } from "react";
import { Info, Mail, MessageCircle, Phone, UserRoundSearch } from "lucide-react";
import { fmtDateTime, fmtPhone } from "../../_lib/format";
import { CONTACT_KIND_LABELS, UI, contactSourceLabel } from "../../_lib/labels";
import type { ContactRow, OrgContacts } from "../../_lib/types";
import { QueueError } from "../EmptyStates";
import { Sheet } from "./Sheet";

export interface ContactsListProps {
  contacts: OrgContacts | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  manager: boolean;
  busyId: string | null;
  onDecide: (contactId: string, action: "verify" | "reject") => void;
  onSource: (c: ContactRow) => void;
}

export function ContactsList({ contacts, loading, error, onRetry, manager, busyId, onDecide, onSource }: ContactsListProps) {
  const [confirm, setConfirm] = useState<{ contact: ContactRow; action: "verify" | "reject" } | null>(null);
  const verified = contacts?.verified ?? [];
  const review = contacts?.review ?? [];

  return (
    <section id="org-contacts" data-testid="org-contacts" aria-labelledby="org-contacts-title" className="s-panel s-org-block">
      <h2 id="org-contacts-title" className="s-section-heading">{UI.contactsTitle}</h2>

      {loading ? (
        <div className="mt-3 h-20 animate-pulse rounded-[var(--s-radius)]" aria-busy="true" style={{ background: "hsl(var(--s-surface-sunken))" }}>
          <span className="sr-only">{UI.loading}</span>
        </div>
      ) : null}
      {error ? (
        <div className="mt-3">
          <QueueError onRetry={onRetry} what={UI.contactsTitle} />
        </div>
      ) : null}
      {contacts && verified.length === 0 && review.length === 0 ? (
        <p className="mt-2 text-[14px]" style={{ color: "hsl(var(--s-fg-muted))" }}>{UI.contactsEmpty}</p>
      ) : null}

      {verified.length > 0 ? (
        <>
          <h3 className="s-eyebrow mt-3">{UI.contactsVerifiedTitle}</h3>
          <ul data-testid="contacts-verified" className="mt-1 flex flex-col">
            {verified.map((c) => {
              const name = c.name ?? UI.contactUnnamed;
              return (
                <li key={c.id} className="s-field s-contact-row">
                  <ContactText contact={c} onSource={() => onSource(c)} />
                  <div className="flex shrink-0 gap-1">
                    {c.tel ? (
                      <a href={c.tel} className="s-icon-btn" aria-label={UI.callNamed(name)}>
                        <Phone size={17} aria-hidden />
                      </a>
                    ) : null}
                    {c.wa ? (
                      <a href={c.wa} target="_blank" rel="noopener noreferrer" className="s-icon-btn" aria-label={UI.whatsappNamed(name)}>
                        <MessageCircle size={17} aria-hidden />
                      </a>
                    ) : null}
                    {c.mailto ? (
                      <a href={c.mailto} className="s-icon-btn" aria-label={UI.emailNamed(name)}>
                        <Mail size={17} aria-hidden />
                      </a>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {review.length > 0 ? (
        <div data-testid="contacts-review" className="s-review-area mt-4">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: "hsl(var(--s-review))" }}>
            <UserRoundSearch size={15} aria-hidden />
            {UI.contactsReviewTitle} ({review.length})
          </h3>
          <p className="mt-0.5 text-[12px]" style={{ color: "hsl(var(--s-fg-muted))" }}>{UI.contactsReviewHint}</p>
          <ul className="mt-1 flex flex-col">
            {review.map((c) => {
              const name = c.name ?? UI.contactUnnamed;
              return (
                <li key={c.id} className="s-field s-contact-row">
                  <ContactText contact={c} onSource={() => onSource(c)} />
                  {manager ? (
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      <button
                        type="button"
                        className="s-btn s-btn-ghost s-btn-compact"
                        aria-label={UI.contactVerifyNamed(name)}
                        disabled={busyId === c.id}
                        onClick={() => setConfirm({ contact: c, action: "verify" })}
                      >
                        {UI.contactVerify}
                      </button>
                      <button
                        type="button"
                        className="s-btn s-btn-danger-quiet s-btn-compact"
                        aria-label={UI.contactRejectNamed(name)}
                        disabled={busyId === c.id}
                        onClick={() => setConfirm({ contact: c, action: "reject" })}
                      >
                        {UI.contactReject}
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {confirm ? (
        <Sheet
          alert
          title={confirm.action === "verify" ? UI.contactVerifyTitle : UI.contactRejectTitle}
          onClose={() => setConfirm(null)}
          testId="contact-confirm"
          footer={
            <>
              <button
                type="button"
                className={`s-btn ${confirm.action === "verify" ? "s-btn-primary" : "s-btn-danger-quiet"}`}
                onClick={() => {
                  onDecide(confirm.contact.id, confirm.action);
                  setConfirm(null);
                }}
              >
                {confirm.action === "verify" ? UI.contactVerifyConfirm : UI.contactRejectConfirm}
              </button>
              <button type="button" className="s-btn s-btn-ghost" onClick={() => setConfirm(null)}>
                {UI.cancel}
              </button>
            </>
          }
        >
          <p className="text-[15px] font-medium" style={{ color: "hsl(var(--s-fg))" }}>
            {confirm.contact.name ?? UI.contactUnnamed}
          </p>
          <p className="s-nums mt-1 text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
            {confirm.contact.phone ? <bdi dir="ltr">{fmtPhone(confirm.contact.phone)}</bdi> : null}
            {confirm.contact.phone && confirm.contact.email ? " · " : null}
            {confirm.contact.email ? <bdi dir="ltr">{confirm.contact.email}</bdi> : null}
          </p>
          <p className="mt-3 text-[14px] leading-relaxed" style={{ color: "hsl(var(--s-fg))" }}>
            {confirm.action === "verify" ? UI.contactVerifyBody : UI.contactRejectBody}
          </p>
        </Sheet>
      ) : null}
    </section>
  );
}

/** Name, kind and values as text; the source opens its sheet. */
function ContactText({ contact, onSource }: { contact: ContactRow; onSource: () => void }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-[15px] font-medium leading-snug [overflow-wrap:anywhere]" style={{ color: "hsl(var(--s-fg))" }}>
        {contact.name ?? UI.contactUnnamed}
        <span className="ms-2 text-[12px] font-normal" style={{ color: "hsl(var(--s-fg-muted))" }}>
          {CONTACT_KIND_LABELS[contact.kind]}
        </span>
      </p>
      <p className="s-nums mt-0.5 flex flex-wrap gap-x-3 text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
        {contact.phone ? <bdi dir="ltr">{fmtPhone(contact.phone)}</bdi> : null}
        {contact.email ? <bdi dir="ltr" className="[overflow-wrap:anywhere]">{contact.email}</bdi> : null}
      </p>
      <button type="button" className="s-source-link" onClick={onSource} aria-haspopup="dialog">
        <Info size={12} aria-hidden />
        <span>
          {contact.verified_at && contact.verified_by
            ? UI.contactVerifiedByWho(contact.verified_by.split("@")[0])
            : UI.contactFromWhere(contactSourceLabel(contact.source.system))}
          {" · "}
          <bdi>{fmtDateTime(contact.verified_at ?? contact.source.observed_at)}</bdi>
        </span>
      </button>
    </div>
  );
}
