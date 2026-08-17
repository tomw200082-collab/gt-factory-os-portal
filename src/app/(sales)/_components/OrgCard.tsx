"use client";

// The account card: identity, its leads, and one merged history.
//
// A drawer for the same reason the lead detail is one — this is a glance
// before a call, not a destination.

import { useEffect, useRef } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { fmtDate, fmtPhone, fmtRelative } from "../_lib/format";
import { UI } from "../_lib/labels";
import type { LeadEventRow, OrgRow, SalesLeadRow } from "../_lib/types";
import { CustomerContext } from "./CustomerBadge";
import { EventTimeline } from "./EventTimeline";
import { StatusPill } from "./StatusPill";

export interface OrgCardProps {
  org: OrgRow;
  leads: SalesLeadRow[];
  events: LeadEventRow[];
  eventsLoading: boolean;
  /** Which lead the timeline belongs to, when the business has more than one. */
  timelineLeadName?: string | null;
  onClose: () => void;
}

export function OrgCard({
  org,
  leads,
  events,
  eventsLoading,
  timelineLeadName = null,
  onClose,
}: OrgCardProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    panel?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
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
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex justify-start"
      style={{ background: "hsl(220 15% 10% / 0.35)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={org.display_name}
        dir="rtl"
        data-testid="org-card"
        className="ms-auto flex h-full w-full max-w-md flex-col overflow-y-auto p-4"
        style={{ background: "hsl(var(--s-surface))" }}
      >
        <header className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold" style={{ color: "hsl(var(--s-fg))" }}>
              {org.display_name}
            </h2>
            <p className="s-nums text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
              {fmtPhone(org.phone_e164)}
              {org.email ? ` · ${org.email}` : ""}
            </p>
          </div>
          <button
            type="button"
            aria-label={UI.close}
            data-testid="org-close"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full"
            style={{ color: "hsl(var(--s-fg-muted))" }}
          >
            <X size={18} aria-hidden />
          </button>
        </header>

        {org.is_existing_customer ? (
          <div className="mt-3">
            <CustomerContext snapshot={org.shopify_snapshot} snapshotAt={org.shopify_snapshot_at} />
          </div>
        ) : null}

        <section className="mt-4">
          <h3 className="s-eyebrow">{UI.orgLeadsTitle}</h3>
          <ul className="mt-2 flex flex-col gap-1">
            {leads.map((lead) => (
              <li key={lead.id}>
                <Link
                  href={`/sales/leads?lead=${encodeURIComponent(lead.id)}`}
                  data-testid={`org-lead-${lead.id}`}
                  className="flex items-center justify-between gap-2 rounded-[var(--s-radius-sm)] px-2 py-2"
                  style={{ background: "hsl(var(--s-surface-sunken))" }}
                >
                  <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: "hsl(var(--s-fg))" }}>
                    {lead.contact_name ?? org.display_name}
                    <span className="s-nums" style={{ color: "hsl(var(--s-fg-faint))" }}>
                      {" · "}
                      {fmtDate(lead.created_at)}
                    </span>
                  </span>
                  <StatusPill status={lead.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-5">
          <h3 className="s-eyebrow">{UI.timelineTitle}</h3>
          {/* One lead's history, not a merge. Saying which one is cheaper than
              a merged view and more honest than a partial history wearing the
              business's name. */}
          {timelineLeadName ? (
            <p
              data-testid="timeline-scope"
              className="mt-0.5 text-[12px]"
              style={{ color: "hsl(var(--s-fg-faint))" }}
            >
              {UI.timelineForLead(timelineLeadName)}
            </p>
          ) : null}
          <p className="mt-0.5 text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
            {org.last_activity_at
              ? `${UI.orgLastActivity}: ${fmtRelative(org.last_activity_at)}`
              : UI.orgNoActivity}
          </p>
          <div className="mt-2">
            {eventsLoading ? (
              <p className="text-[13px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
                {UI.loading}
              </p>
            ) : (
              <EventTimeline events={events} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
