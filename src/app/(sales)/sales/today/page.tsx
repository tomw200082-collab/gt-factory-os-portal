"use client";

// The home of the workspace: what to do now, in order.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  useLeads,
  useTasks,
  useCompleteTask,
  useResolveContactGap,
  useConvert,
  useOutcome,
  useRecordActivity,
  useOutreach,
  useSetNextTouch,
  useSetStatus,
  useSettings,
  useToday,
  useWeekStats,
} from "../../_lib/api";
import { useOutcomeCapture } from "../../_lib/useOutcomeCapture";
import { clearActivityDraft } from "../../_lib/activityDraft";
import { useQueueScope } from "../../_lib/useQueueScope";
import { useSession } from "@/lib/auth/session-provider";
import { UI } from "../../_lib/labels";
import type { TodayRow, UndoTarget } from "../../_lib/types";
import { QueueDone, QueueError, QueueLoading } from "../../_components/EmptyStates";
import { StatsStrip } from "../../_components/StatsStrip";
import { TodayQueue } from "../../_components/TodayQueue";
import { TaskCard } from "../../_components/TaskCard";
import {
  OutcomeSheet,
  nextBusinessTouchPreview,
  type OutcomeSubmit,
} from "../../_components/OutcomeSheet";
import { Toast } from "../../_components/Toast";

export default function TodayPage() {
  const { session } = useSession();
  const isRep = session?.role === "sales_rep";
  const [scope, setScope] = useQueueScope(isRep);
  const taskScope = isRep ? "mine" : scope;
  const tasks = useTasks(taskScope);
  const completeTask = useCompleteTask();
  const resolveContact = useResolveContactGap();
  const today = useToday(scope === "mine" || isRep ? session?.email : scope === "unassigned" ? "unassigned" : undefined);
  // Only for resolving an intent armed elsewhere; the queue itself is unchanged.
  const leads = useLeads();
  const stats = useWeekStats();
  const settings = useSettings();
  const capture = useOutcomeCapture(session?.email);

  // The two direct actions on a card, which skip the call-and-return cycle.
  const [postponing, setPostponing] = useState<TodayRow | null>(null);
  const [losing, setLosing] = useState<TodayRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // The lead a just-recorded "אבוד" can be taken back from, for as long as its
  // toast is on screen.
  const [undo, setUndo] = useState<UndoTarget | null>(null);

  const rows = useMemo(() => today.data?.rows ?? [], [today.data]);
  const allTaskRows = useMemo(() => tasks.data ?? [], [tasks.data]);
  const [taskClock, setTaskClock] = useState(() => Date.now());
  useEffect(() => {
    const nextDue = allTaskRows.map((task) => new Date(task.due_at).getTime())
      .filter((due) => due > taskClock).sort((a, b) => a - b)[0];
    if (nextDue === undefined) return;
    const timer = setTimeout(() => setTaskClock(Date.now()), Math.min(nextDue - Date.now() + 50, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [allTaskRows, taskClock]);
  const taskRows = useMemo(() => allTaskRows.filter((task) => new Date(task.due_at).getTime() <= taskClock), [allTaskRows, taskClock]);
  const taskLeadIds = useMemo(() => new Set(allTaskRows.map((task) => task.lead_id).filter((id): id is string => Boolean(id))), [allTaskRows]);
  const legacyRows = useMemo(() => rows.filter((row) => row.item_type === "conversion" || !taskLeadIds.has(row.lead_id)), [rows, taskLeadIds]);
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
  const activity = useRecordActivity(capture.pending?.leadId ?? "");
  const convert = useConvert(capture.pending?.leadId ?? "");
  // convert_lead answers 200 {converted:false} when the lead is no longer open.
  // That is not an HTTP error and carries no error.message, so it needs its own
  // channel — otherwise a close that did nothing reads as a close that worked.
  const [convertNote, setConvertNote] = useState<string | null>(null);
  const nextTouch = useSetNextTouch(postponing?.lead_id ?? "");
  const lostOutcome = useOutcome(losing?.lead_id ?? "");
  const undoStatus = useSetStatus(undo?.leadId ?? "");

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
    const id = setTimeout(() => {
      setToast(null);
      setUndo(null);
    }, 4500);
    return () => clearTimeout(id);
  }, [toast]);

  // A refetch or a lost outcome can remove the row while the sheet is open.
  // Keep the name until the server confirms the result.
  const lastLeadName = useRef<string | null>(null);
  useEffect(() => {
    if (pendingRow) lastLeadName.current = pendingRow.contact_name ?? pendingRow.org_name;
    else if (fallbackRow) lastLeadName.current = fallbackRow.contact_name ?? fallbackRow.org_name;
  }, [pendingRow, fallbackRow]);

  const answerSheetOpen = Boolean(
    capture.pending && (pendingRow || fallbackRow || activity.isPending || outcome.isPending),
  );
  const anySheetOpen = Boolean(answerSheetOpen || postponing || losing);

  function arm(leadId: string, channel: "call" | "whatsapp" | "email", taskId?: string) {
    capture.arm(leadId, channel, taskId);
    // Intent, not a touch: only an outcome, a note or a status change stops the
    // SLA clock (§5.3), and record_outreach is written that way server-side.
    // The id travels in the vars — nothing is "pending" yet at this instant.
    outreach.mutate({ leadId, channel });
  }

  /**
   * One setter for both, because they are one thing.
   *
   * `undo` used to be sibling state that no toast owned. The 4.5s timer cleared
   * the message and left the target behind, and any toast raised afterwards
   * inherited it — a button labelled "בטל", next to a message about lead B,
   * that wrote status='working' to lead A. Routing every toast through here
   * means raising one always replaces the way back, or removes it.
   */
  function showToast(message: string, undoTarget: UndoTarget | null = null) {
    setToast(message);
    setUndo(undoTarget);
  }

  function submitOutcome(vars: OutcomeSubmit) {
    if (!vars.result) return;

    // `won` is not an outcome — record_outcome refuses it, because a close is
    // evidence-only. It goes to convert_lead, which is also the only writer
    // that emits the `converted` event v_sales_today needs to keep showing the
    // deal. Marked won by any other route, the lead matches no WHERE branch in
    // that view and disappears at the moment it earned its place there.
    if (vars.result === "won") {
      if (!vars.document_number) return;
      setConvertNote(null);
      convert.mutate(
        { document_number: vars.document_number },
        {
          onSuccess: (res) => {
            // A close that did not happen must not be celebrated. The
            // intent stays armed, so the sheet stays open on this lead.
            if (!res.converted) {
              setConvertNote(UI.wonNotOpen);
              return;
            }
            capture.clear();
            clearActivityDraft(session?.email ?? "", capture.pending?.leadId ?? "");
            showToast(UI.wonSaved);
          },
        },
      );
      return;
    }
    // Read before the write; a refetch may remove the row before confirmation.
    const leadId = capture.pending?.leadId ?? null;
    const previousNextTouch =
      pendingRow?.next_touch_at ?? fallbackRow?.next_touch_at ?? null;

    if (vars.result === "lost") {
      outcome.mutate({ result: "lost", reason: vars.reason }, { onSuccess: () => {
        clearActivityDraft(session?.email ?? "", leadId ?? "");
        capture.clear();
        showToast(UI.outcomeSaved, leadId ? { leadId, previousNextTouch } : null);
      } });
      return;
    }
    if (!vars.request_id || !capture.pending) return;
    activity.mutate({ request_id: vars.request_id, source_task_id: capture.pending.taskId,
      channel: capture.pending.channel,
      result: vars.result, note: vars.note, primary_action: vars.primary_action }, {
      onSuccess: () => {
        clearActivityDraft(session?.email ?? "", leadId ?? "");
        capture.clear();
        showToast(UI.outcomeSaved);
      },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        {/* The title holds its own row. Sharing one with the scope pills gave a
            44px-tall filter control the same visual mass as the page name at
            390px, where the pair took the whole width. */}
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "hsl(var(--s-fg))" }}>
          {isRep || scope === "mine" ? UI.queueMine : scope === "unassigned" ? UI.queueUnassigned : UI.queueAll}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {/* Two states, not a menu: the question is only ever "everything, or
              what is on me". It persists, because the answer should survive
              closing the app. The group is named for what it controls — it
              used to be labelled with the page's own title. */}
          <div className="flex gap-1" role="group" aria-label={UI.queueScopeGroupLabel}>
            {(isRep ? (["mine"] as const) : (["all", "mine", "unassigned"] as const)).map((option) => (
              <button
                key={option}
                type="button"
                data-testid={`queue-scope-${option}`}
                aria-pressed={scope === option}
                // Inert while a sheet is open: the queue behind it is already
                // hidden from pointer and AT, and changing scope there swaps
                // the list out from under a question that is still being asked.
                disabled={anySheetOpen}
                className={`s-tab ${scope === option ? "s-tab-active" : ""}`}
                onClick={() => setScope(option)}
              >
                {option === "all" ? UI.scopeAll : option === "mine" ? UI.scopeMine : UI.scopeUnassigned}
              </button>
            ))}
          </div>
        </div>
        {/* Team-wide counts read as the rep's own under "my queue" (UX gate
            2026-10-01); a rep's queue below is their whole truth. */}
        {isRep ? null : <StatsStrip stats={stats.data} />}
      </header>

      {/* While a sheet is open the queue behind it is unreachable by pointer;
          hiding it from assistive technology keeps the two contexts from
          being read as one. aria-modal alone is only partly honoured on iOS. */}
      <div aria-hidden={anySheetOpen || undefined}>
        {today.isLoading ? <QueueLoading /> : null}
        {today.isError || tasks.isError ? <QueueError onRetry={() => {
          if (today.isError) void today.refetch();
          if (tasks.isError) void tasks.refetch();
        }} /> : null}
        {today.isSuccess && tasks.isSuccess && legacyRows.length === 0 && taskRows.length === 0 ? <QueueDone /> : null}

        {taskRows.length > 0 ? <section className="mb-6 grid gap-2" aria-label={UI.tasksTitle}>
          <h2 className="s-eyebrow">{UI.tasksTitle}</h2>
          {taskRows.map((task) => <TaskCard key={task.id} task={task}
            lead={leads.data?.find((lead) => lead.id === task.lead_id)}
            manager={!isRep} onArm={arm}
            onComplete={async (taskId, note) => {
              await completeTask.mutateAsync({ taskId, note });
              showToast(UI.taskDone);
            }}
            onResolveContact={async (leadId, details) => {
              await resolveContact.mutateAsync({ leadId, ...details });
            }} />)}
        </section> : null}

        {today.isSuccess && legacyRows.length > 0 ? (
          <TodayQueue
            rows={rows}
            taskLeadIds={taskLeadIds}
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
          draftIdentity={{ email: session?.email ?? "", leadId: capture.pending.leadId }}
          busy={activity.isPending || outcome.isPending || convert.isPending}
          error={activity.error?.message ?? outcome.error?.message ?? convert.error?.message ?? convertNote}
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
                  showToast(UI.nextTouchSaved);
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
                  // Marking a lead lost was a four-tap mistake to recover from
                  // (audit P1-9): find it, open the drawer, set the status
                  // back. An undo that lives as long as the toast costs one.
                  showToast(UI.outcomeSaved, {
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
                      { onSuccess: () => showToast(UI.undone) },
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
