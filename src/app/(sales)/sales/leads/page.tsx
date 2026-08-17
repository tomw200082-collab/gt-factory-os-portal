"use client";

// The full table: every lead GT has ever received, in one place.

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  useAddNote,
  useAssign,
  useLeadEvents,
  useLeads,
  useSetNextTouch,
  useSetStatus,
  useSettings,
} from "../../_lib/api";
import { matchesQuery } from "../../_lib/format";
import { STATUS_LABELS, UI } from "../../_lib/labels";
import type { LeadStatus } from "../../_lib/types";
import { ListEmpty, QueueError, QueueLoading } from "../../_components/EmptyStates";
import { LeadsTable } from "../../_components/LeadsTable";
import { LeadDrawer } from "../../_components/LeadDrawer";

const TABS: LeadStatus[] = ["new", "working", "won", "lost"];

function LeadsScreen() {
  const params = useSearchParams();
  const leads = useLeads();
  const settings = useSettings();

  const [tab, setTab] = useState<LeadStatus>("new");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(params?.get("lead") ?? null);

  const rows = useMemo(() => leads.data ?? [], [leads.data]);
  const counts = useMemo(() => {
    const out: Record<LeadStatus, number> = { new: 0, working: 0, won: 0, lost: 0 };
    for (const row of rows) out[row.status] += 1;
    return out;
  }, [rows]);

  const visible = useMemo(
    () => rows.filter((r) => r.status === tab && matchesQuery(r, query)),
    [rows, tab, query],
  );

  const openLead = rows.find((r) => r.id === openId) ?? null;
  const events = useLeadEvents(openId);

  const setStatus = useSetStatus(openId ?? "");
  const addNote = useAddNote(openId ?? "");
  const setNextTouch = useSetNextTouch(openId ?? "");
  const assign = useAssign(openId ?? "");

  const busy =
    setStatus.isPending || addNote.isPending || setNextTouch.isPending || assign.isPending;
  const error =
    setStatus.error?.message ??
    addNote.error?.message ??
    setNextTouch.error?.message ??
    assign.error?.message ??
    null;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "hsl(var(--s-fg))" }}>
          {UI.leadsTitle}
        </h1>

        <input
          type="search"
          className="s-input"
          placeholder={UI.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={UI.search}
          data-testid="leads-search"
        />

        <div role="tablist" aria-label={UI.statusLabel} className="flex flex-wrap gap-1">
          {TABS.map((status) => (
            <button
              key={status}
              role="tab"
              type="button"
              id={`leads-tab-${status}`}
              aria-selected={tab === status}
              aria-controls="leads-panel"
              // Only the selected tab stays in the tab order; the arrow keys
              // move between them, which is what the tab pattern promises.
              tabIndex={tab === status ? 0 : -1}
              data-testid={`leads-tab-${status}`}
              className={`s-tab ${tab === status ? "s-tab-active" : ""}`}
              onClick={() => setTab(status)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                // RTL: ArrowLeft advances, ArrowRight goes back.
                const step = e.key === "ArrowLeft" ? 1 : -1;
                const next = TABS[(TABS.indexOf(status) + step + TABS.length) % TABS.length];
                setTab(next);
                document.getElementById(`leads-tab-${next}`)?.focus();
              }}
            >
              {STATUS_LABELS[status]}
              <span className="s-nums" style={{ color: "hsl(var(--s-fg-faint))" }}>
                {counts[status]}
              </span>
            </button>
          ))}
        </div>
      </header>

      <div id="leads-panel" role="tabpanel" aria-labelledby={`leads-tab-${tab}`}>
        {leads.isLoading ? <QueueLoading /> : null}
        {leads.isError ? <QueueError onRetry={() => void leads.refetch()} /> : null}

        {leads.isSuccess && visible.length === 0 ? (
          <ListEmpty label={query ? UI.searchEmpty : UI.emptyForTab(STATUS_LABELS[tab])} />
        ) : null}

        {leads.isSuccess && visible.length > 0 ? (
          <LeadsTable rows={visible} onOpen={(lead) => setOpenId(lead.id)} />
        ) : null}
      </div>

      {openLead ? (
        <LeadDrawer
          lead={openLead}
          events={events.data ?? []}
          eventsLoading={events.isLoading}
          templates={settings.data?.whatsapp_templates ?? null}
          busy={busy}
          error={error}
          onClose={() => setOpenId(null)}
          onStatus={(status, reason) => setStatus.mutate({ status, reason })}
          onNote={(note) => addNote.mutate({ note })}
          onNextTouch={(at) => setNextTouch.mutate({ at })}
          onAssign={(assignee) => assign.mutate({ assignee })}
        />
      ) : null}
    </div>
  );
}

export default function LeadsPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<QueueLoading />}>
      <LeadsScreen />
    </Suspense>
  );
}
