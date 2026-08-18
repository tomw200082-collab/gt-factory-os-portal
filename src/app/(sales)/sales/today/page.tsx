"use client";

// The home of the workspace: what to do now, in order.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  useLeads,
  useOutcome,
  useOutreach,
  useSetNextTouch,
  useSetStatus,
  useSettings,
  useToday,
  useWeekStats,
} from "../../_lib/api";
import { useOutcomeCapture } from "../../_lib/useOutcomeCapture";
import { useQueueScope } from "../../_lib/useQueueScope";
import { useSession } from "@/lib/auth/session-provider";
import { UI } from "../../_lib/labels";
import type { TodayRow } from "../../_lib/types";
import { QueueDone, QueueError, QueueLoading } from "../../_components/EmptyStates";
import { StatsStrip } from "../../_components/StatsStrip";
import { TodayQueue } from "../../_components/TodayQueue";
import {
  OutcomeSheet,
  nextBusinessTouchPreview,
  type OutcomeSubmit,
} from "../../_components/OutcomeSheet";
import { Toast } from "../../_components/Toast";

export default function TodayPage() {
  const { session } = useSession();
  const [scope, setScope] = useQueueScope();
  // "mine" scopes to the signed-in person's leads plus everything unclaimed —
  // the server decides that, this only says whose queue is being asked for.
  const today = useToday(scope === "mine" ? session?.email : undefined);
  // Only for resolving an intent armed elsewhere; the queue itself is unchanged.
  const leads = useLeads();
  const stats = useWeekStats();
  const settings = useSettings();
  const capture = useOutcomeCapture();

  // The two direct actions on a card, which skip the call-and-return cycle.
  const [postponing, setPostponing] = useState<TodayRow | null>(null);
  const [losing, setLosing] = useState<TodayRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // The lead a just-recorded "אבוד" can be taken back from, for as long as its
  // toast is on screen.
  const [undo, setUndo] = useState<{ leadId: string; previousNextTouch: string | null } | null>(
    null,
  );

  const rows = useMemo(() => today.data?.rows ?? [], [today.data]);
  // The cap and the SLA are both admin-owned settings; the screen reads them
  // rather than deciding them. Defaults match 0326's seeds so a settings row
  // that has not loaded yet degrades to the shipped behaviour, not to zero.
  // queue?. rather than queue.: during the window between this deploy and the
  // API's, /api/sales/today still answers with rows alone, and a hard property
  // read there is a white screen instead of a degraded one.
  const dailyCap = today.data?.queue?.daily_cap ?? 15;
  const slaHours = settings.data?.sla_hours ?? 24;
  const pendingRow = useMemo(
    () => rows.find((r) => r.lead_id === capture.pending?.leadId) ?? null,
    [rows, capture.pending],
  );

  const outreach = useOutreach();
  const outcome = useOutcome(capture.pending?.leadId ?? "");
  const nextTouch = useSetNextTouch(postponing?.lead_id ?? "");
  const lostOutcome = useOutcome(losing?.lead_id ?? "");
  const undoStatus = useSetStatus(undo?.leadId ?? "");

  // Answering for a lead takes its card out of the queue optimistically, which
  // makes the lead look absent while the write is still in flight. That is not
  // the lead leaving the queue — it is us answering for it — so the intent has
  // to survive until the write settles, or a failed POST would clear the sheet
  // and the stored intent while onError quietly puts the card back: the user
  // taps an outcome, the sheet closes as though it saved, and nothing was ever
  // logged. Both outcome writes remove a row this way.
  const answering = outcome.isPending || lostOutcome.isPending;

  // An intent can outlive its card — the call may have been placed from the
  // leads table on a lead this queue never contained, or the row may have
  // dropped out on a refetch. Clearing it here is what made an off-queue call
  // end in silence (audit P0-4): the answer was discarded before anyone was
  // asked for it. The intent is now cleared only by a captured outcome or by
  // an explicit dismissal, and the leads cache supplies the name when the
  // queue cannot.
  const fallbackRow = useMemo(
    () => leads.data?.find((l) => l.id === capture.pending?.leadId) ?? null,
    [leads.data, capture.pending],
  );

  // Confirmation should not outstay its welcome above the tab bar.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(id);
  }, [toast]);

  // The card leaves the queue the instant an outcome is submitted, so
  // pendingRow goes null while the write is still in flight. Holding the last
  // name lets the sheet stay on screen through the round-trip — otherwise it
  // vanishes, exposes the queue behind it, and only comes back if the write
  // fails. On a factory phone that gap is seconds of looking at the wrong
  // thing. The effect runs after the render that nulled pendingRow, so the ref
  // still holds the previous value when it is needed.
  const lastLeadName = useRef<string | null>(null);
  useEffect(() => {
    if (pendingRow) lastLeadName.current = pendingRow.contact_name ?? pendingRow.org_name;
    else if (fallbackRow) lastLeadName.current = fallbackRow.contact_name ?? fallbackRow.org_name;
  }, [pendingRow, fallbackRow]);

  const answerSheetOpen = Boolean(
    capture.pending && (pendingRow || fallbackRow || outcome.isPending),
  );
  const anySheetOpen = Boolean(answerSheetOpen || postponing || losing);

  function arm(leadId: string, channel: "call" | "whatsapp") {
    capture.arm(leadId, channel);
    // Intent, not a touch: only an outcome, a note or a status change stops the
    // SLA clock (§5.3), and record_outreach is written that way server-side.
    // The id travels in the vars — nothing is "pending" yet at this instant.
    outreach.mutate({ leadId, channel });
  }

  function submitOutcome(vars: OutcomeSubmit) {
    if (!vars.result) return;
    outcome.mutate(
      { result: vars.result, next_touch_at: vars.next_touch_at, reason: vars.reason },
      {
        onSuccess: () => {
          capture.clear();
          setToast(UI.outcomeSaved);
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: "hsl(var(--s-fg))" }}>
            {scope === "mine" ? UI.queueMine : UI.queueAll}
          </h1>
          {/* Two states, not a menu: the question is only ever "everything, or
              what is on me". It persists, because the answer should survive
              closing the app. */}
          <div className="flex gap-1" role="group" aria-label={UI.todayTitle}>
            {(["all", "mine"] as const).map((option) => (
              <button
                key={option}
                type="button"
                data-testid={`queue-scope-${option}`}
                aria-pressed={scope === option}
                className={`s-tab ${scope === option ? "s-tab-active" : ""}`}
                onClick={() => setScope(option)}
              >
                {option === "all" ? UI.scopeAll : UI.scopeMine}
              </button>
            ))}
          </div>
        </div>
        <StatsStrip stats={stats.data} />
      </header>

      {/* While a sheet is open the queue behind it is unreachable by pointer;
          hiding it from assistive technology keeps the two contexts from
          being read as one. aria-modal alone is only partly honoured on iOS. */}
      <div aria-hidden={anySheetOpen || undefined}>
        {today.isLoading ? <QueueLoading /> : null}
        {today.isError ? <QueueError onRetry={() => void today.refetch()} /> : null}
        {today.isSuccess && rows.length === 0 ? <QueueDone /> : null}

        {today.isSuccess && rows.length > 0 ? (
          <TodayQueue
            rows={rows}
            dailyCap={dailyCap}
            slaHours={slaHours}
            roster={settings.data?.assignees ?? []}
            templates={settings.data?.whatsapp_templates ?? null}
            onArm={arm}
            onPostpone={setPostponing}
            onLost={setLosing}
          />
        ) : null}
      </div>

      {answerSheetOpen && capture.pending ? (
        <OutcomeSheet
          leadName={
            pendingRow
              ? (pendingRow.contact_name ?? pendingRow.org_name)
              : fallbackRow
                ? (fallbackRow.contact_name ?? fallbackRow.org_name)
                : (lastLeadName.current ?? "")
          }
          lostReasons={settings.data?.lost_reasons}
          channel={capture.pending.channel}
          busy={outcome.isPending}
          error={outcome.error?.message ?? null}
          onSubmit={submitOutcome}
          // Closes the sheet but leaves the intent owed — it will be asked
          // again on the next return. Only an answer clears it.
          onDismiss={capture.dismiss}
        />
      ) : null}

      {postponing ? (
        <OutcomeSheet
          mode="next-touch"
          leadName={postponing.contact_name ?? postponing.org_name}
          busy={nextTouch.isPending}
          error={nextTouch.error?.message ?? null}
          onSubmit={(vars) => {
            if (!vars.next_touch_at) return;
            nextTouch.mutate(
              { at: vars.next_touch_at },
              {
                onSuccess: () => {
                  setPostponing(null);
                  setToast(UI.nextTouchSaved);
                },
              },
            );
          }}
          onDismiss={() => setPostponing(null)}
        />
      ) : null}

      {losing ? (
        <OutcomeSheet
          mode="lost"
          lostReasons={settings.data?.lost_reasons}
          leadName={losing.contact_name ?? losing.org_name}
          busy={lostOutcome.isPending}
          error={lostOutcome.error?.message ?? null}
          onSubmit={(vars) => {
            if (!vars.reason) return;
            const lost = losing;
            lostOutcome.mutate(
              { result: "lost", reason: vars.reason },
              {
                onSuccess: () => {
                  setLosing(null);
                  setToast(UI.outcomeSaved);
                  // Marking a lead lost was a four-tap mistake to recover from
                  // (audit P1-9): find it, open the drawer, set the status
                  // back. An undo that lives as long as the toast costs one.
                  setUndo({
                    leadId: lost.lead_id,
                    previousNextTouch: lost.next_touch_at,
                  });
                },
              },
            );
          }}
          onDismiss={() => setLosing(null)}
        />
      ) : null}

      {toast ? (
        <Toast
          message={toast}
          action={
            undo
              ? {
                  label: UI.undo,
                  onAction: () => {
                    const target = undo;
                    setUndo(null);
                    undoStatus.mutate(
                      {
                        status: "working",
                        // 0324 refuses a working lead with no next touch, so the
                        // reversal restores the date the lead carried, or asks
                        // the server for tomorrow's default via the sheet's own
                        // rule if it carried none.
                        next_touch_at:
                          target.previousNextTouch ??
                          nextBusinessTouchPreview(1).toISOString(),
                      },
                      { onSuccess: () => setToast(UI.undone) },
                    );
                  },
                }
              : undefined
          }
          onClose={() => {
            setToast(null);
            setUndo(null);
          }}
        />
      ) : null}
    </div>
  );
}
