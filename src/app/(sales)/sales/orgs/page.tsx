"use client";

// The businesses. 186 of them, all born from a lead.

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLeadEvents, useLeads, useOrgs } from "../../_lib/api";
import { phoneSearchKey } from "../../_lib/format";
import { UI } from "../../_lib/labels";
import type { OrgRow } from "../../_lib/types";
import { ListEmpty, QueueError, QueueLoading } from "../../_components/EmptyStates";
import { OrgList } from "../../_components/OrgList";
import { OrgCard } from "../../_components/OrgCard";

export function matchesOrgQuery(org: OrgRow, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  const digits = phoneSearchKey(q);
  if (digits.length >= 3 && phoneSearchKey(org.phone_e164).includes(digits)) return true;
  return [org.display_name, org.email].filter(Boolean).join(" ").toLowerCase().includes(q.toLowerCase());
}

function OrgsScreen() {
  const params = useSearchParams();
  const orgs = useOrgs();
  const leads = useLeads();

  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(params?.get("org") ?? null);

  const rows = useMemo(() => orgs.data ?? [], [orgs.data]);
  const visible = useMemo(() => rows.filter((o) => matchesOrgQuery(o, query)), [rows, query]);

  const openOrg = rows.find((o) => o.id === openId) ?? null;
  const orgLeads = useMemo(
    () => (leads.data ?? []).filter((l) => l.org_id === openId),
    [leads.data, openId],
  );

  // The timeline covers one lead. Almost every business has exactly one, so
  // that is the whole story; when it is not, the card names the lead it is
  // showing rather than passing a partial history off as the business's.
  const timelineLead = orgLeads[0] ?? null;
  const events = useLeadEvents(timelineLead?.id ?? null);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "hsl(var(--s-fg))" }}>
          {UI.orgsTitle}
        </h1>
        <input
          type="search"
          className="s-input"
          placeholder={UI.search}
          aria-label={UI.search}
          data-testid="orgs-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </header>

      {orgs.isLoading ? <QueueLoading /> : null}
      {orgs.isError ? <QueueError onRetry={() => void orgs.refetch()} /> : null}
      {orgs.isSuccess && visible.length === 0 ? <ListEmpty label={UI.searchEmpty} /> : null}
      {orgs.isSuccess && visible.length > 0 ? (
        <OrgList rows={visible} onOpen={(org) => setOpenId(org.id)} />
      ) : null}

      {openOrg ? (
        <OrgCard
          org={openOrg}
          leads={orgLeads}
          events={events.data ?? []}
          eventsLoading={events.isLoading}
          timelineLeadName={
            orgLeads.length > 1
              ? (timelineLead?.contact_name ?? openOrg.display_name)
              : null
          }
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </div>
  );
}

export default function OrgsPage() {
  return (
    <Suspense fallback={<QueueLoading />}>
      <OrgsScreen />
    </Suspense>
  );
}
