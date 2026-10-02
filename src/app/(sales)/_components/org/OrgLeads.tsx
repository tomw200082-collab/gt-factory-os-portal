"use client";

// The business's leads this person may read, each one a way into the lead card.

import Link from "next/link";
import { fmtDate } from "../../_lib/format";
import { UI } from "../../_lib/labels";
import type { SalesLeadRow } from "../../_lib/types";
import { PanelError } from "../EmptyStates";
import { StatusPill } from "../StatusPill";

export function OrgLeads({ leads, error = false, onRetry }: { leads: SalesLeadRow[]; error?: boolean; onRetry?: () => void }) {
  return (
    <section data-testid="org-leads" aria-labelledby="org-leads-title" className="s-panel s-org-block">
      <h2 id="org-leads-title" className="s-section-heading">{UI.leadsTitle}</h2>
      {error ? (
        <PanelError what={UI.panelWhatLeads} onRetry={() => onRetry?.()} />
      ) : leads.length === 0 ? (
        <p className="mt-2 text-[14px]" style={{ color: "hsl(var(--s-fg-muted))" }}>{UI.leadsEmpty}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {leads.map((lead) => (
            <li key={lead.id}>
              <Link
                href={`/sales/leads?lead=${encodeURIComponent(lead.id)}`}
                data-testid={`org-lead-${lead.id}`}
                className="flex min-h-[44px] items-center justify-between gap-2 rounded-[var(--s-radius)] px-3 py-2"
                style={{ background: "hsl(var(--s-surface-sunken))" }}
              >
                <span className="min-w-0 flex-1 text-[14px] [overflow-wrap:anywhere]" style={{ color: "hsl(var(--s-fg))" }}>
                  {lead.contact_name ?? lead.org_name}
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
      )}
    </section>
  );
}
