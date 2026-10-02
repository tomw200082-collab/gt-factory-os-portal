"use client";

// The business workspace (GT Pulse Unit B, tranche 190).
//
// One business, laid out for someone on a call: who it is, what to do next,
// who to call, and where the account stands, before anything that needs a
// scroll. The detail call is the permission boundary: until it answers, nothing
// else about the business is asked for, so a forbidden business costs one
// request and shows nothing.

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useSession } from "@/lib/auth/session-provider";
import { useContactAction, useLeads, useOrg, useOrgContacts, useOrgRiver, useSettings, useTasks } from "../../_lib/api";
import { fmtDateTime } from "../../_lib/format";
import { UI, contactSourceLabel } from "../../_lib/labels";
import { nextActionFor } from "../../_lib/nextAction";
import { useAutoClear } from "../../_lib/useAutoClear";
import { historyShown, historyView } from "../../_lib/orgTruth";
import type { ContactRow, OrderRow, RiverChip } from "../../_lib/types";
import { QueueError } from "../EmptyStates";
import { Toast } from "../Toast";
import { ContactsList } from "./ContactsList";
import { NextAction } from "./NextAction";
import { OrderRiver } from "./OrderRiver";
import { OrderSheet } from "./OrderSheet";
import { OrgHeader } from "./OrgHeader";
import { OrgLeads } from "./OrgLeads";
import { IdentityBanner, OrgForbidden, OrgLoading, OrgNotFound, RetiredBanner, StaleBanner } from "./OrgStates";
import { OrgSummary } from "./OrgSummary";
import { PrimaryContact } from "./PrimaryContact";
import { SourceSheet, type SourceInfo } from "./SourceSheet";

type OrderRef = Pick<OrderRow, "gid" | "name" | "created_at" | "class" | "draft_status">;

export interface OrgWorkspaceProps {
  orgId: string;
  /** Tranche 191 places the business circle here, after the summary. */
  circleSlot?: (ctx: { onOpenOrder: (o: OrderRef) => void; pendingDrafts: import("../../_lib/types").PendingDraft[] }) => ReactNode;
}

export function OrgWorkspace({ orgId, circleSlot }: OrgWorkspaceProps) {
  const { session } = useSession();
  const manager = session?.role === "admin" || session?.role === "planner";

  const org = useOrg(orgId);
  const ready = org.isSuccess;
  const view = org.data ? historyView(org.data) : null;
  const retired = view === "retired";

  const contacts = useOrgContacts(orgId, ready && !retired);
  const [chip, setChip] = useState<RiverChip>("all");
  const river = useOrgRiver(orgId, chip, ready);
  const tasks = useTasks(manager ? "all" : "mine");
  const leads = useLeads();
  const settings = useSettings(manager);
  const decide = useContactAction();

  const [source, setSource] = useState<SourceInfo | null>(null);
  const [order, setOrder] = useState<OrderRef | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const clearToast = useCallback(() => setToast(null), []);
  useAutoClear(toast, clearToast);

  const orgLeads = useMemo(() => (leads.data ?? []).filter((l) => l.org_id === orgId), [leads.data, orgId]);
  const next = useMemo(
    () => (tasks.data && leads.data ? nextActionFor(orgId, tasks.data, leads.data) : null),
    [orgId, tasks.data, leads.data],
  );
  const riverItems = useMemo(() => river.data?.pages.flatMap((p) => p.rows) ?? [], [river.data]);
  const firstRiverPage = river.data?.pages[0];

  if (org.isLoading) return <OrgLoading />;
  if (org.isError) {
    const status = org.error.status;
    if (status === 403 || status === 400) return <OrgForbidden />;
    if (status === 404) return <OrgNotFound />;
    return <QueueError onRetry={() => void org.refetch()} what={UI.orgErrorWhat} />;
  }
  if (!org.data || !view) return null;

  const d = org.data;
  const shown = historyShown(view);
  const ownerEmail = d.header.owner_email;
  const ownerName = ownerEmail
    ? (settings.data?.assignees.find((a) => a.email === ownerEmail)?.name ?? ownerEmail.split("@")[0])
    : null;

  const historySource: SourceInfo = {
    system: UI.sourceShopify,
    asOf: d.as_of ? fmtDateTime(d.as_of) : null,
    basis: `${UI.sourceBasisMoney}. ${UI.sourceBasisOrders}.`,
    note: UI.sourcePublication,
  };
  const contactSource = (c: ContactRow): SourceInfo => ({
    system: contactSourceLabel(c.source.system),
    asOf: fmtDateTime(c.verified_at ?? c.source.observed_at),
    note: c.verified_at ? undefined : UI.contactsReviewHint,
  });

  return (
    <div className="s-org-ws flex flex-col gap-4" data-testid="org-workspace">
      <OrgHeader org={d} view={view} ownerName={ownerName} onSource={() => setSource(historySource)} />

      {view === "stale" ? <StaleBanner asOf={d.as_of} /> : null}
      {view === "identity" ? <IdentityBanner org={d} manager={manager} /> : null}
      {retired ? <RetiredBanner org={d} /> : null}

      {!retired ? (
        <div className="s-org-top">
          <NextAction action={next} loading={tasks.isLoading || leads.isLoading} />
          <PrimaryContact
            contact={contacts.data?.verified[0] ?? null}
            awaiting={contacts.data?.review.length ?? 0}
            loading={contacts.isLoading}
          />
          {view !== "identity" ? (
            <OrgSummary org={d} view={view} onSource={() => setSource(historySource)} onOpenOrder={(o) => setOrder({ ...o, class: "completed", draft_status: null })} />
          ) : null}
          {shown && circleSlot ? circleSlot({ onOpenOrder: setOrder, pendingDrafts: firstRiverPage?.pending_drafts ?? [] }) : null}
        </div>
      ) : null}

      <OrderRiver
        chip={chip}
        onChip={setChip}
        withOrders={shown}
        items={riverItems}
        counts={firstRiverPage?.counts ?? null}
        pending={firstRiverPage?.pending_drafts ?? []}
        loading={river.isLoading}
        refetching={river.isPlaceholderData}
        error={river.isError}
        onRetry={() => void river.refetch()}
        hasMore={Boolean(river.hasNextPage)}
        loadingMore={river.isFetchingNextPage}
        onMore={() => void river.fetchNextPage()}
        onOpenOrder={setOrder}
      />

      {!retired ? (
        <ContactsList
          contacts={contacts.data}
          loading={contacts.isLoading}
          error={contacts.isError}
          onRetry={() => void contacts.refetch()}
          manager={manager}
          busyId={decide.isPending ? (decide.variables?.contactId ?? null) : null}
          onDecide={(contactId, action) =>
            decide.mutate(
              { contactId, action },
              {
                onSuccess: () => setToast(UI.contactDone),
                onError: (err) => setToast(err.message),
              },
            )
          }
          onSource={(c) => setSource(contactSource(c))}
        />
      ) : null}

      {!retired ? <OrgLeads leads={orgLeads} /> : null}

      {source ? <SourceSheet source={source} onClose={() => setSource(null)} /> : null}
      {order ? <OrderSheet orgId={orgId} order={order} onClose={() => setOrder(null)} /> : null}
      {toast ? <Toast message={toast} onClose={() => setToast(null)} /> : null}
    </div>
  );
}
