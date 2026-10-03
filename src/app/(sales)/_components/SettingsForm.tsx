"use client";

// The Today queue's shape and the lost-reason vocabulary — part of "צוות וכללים" since
// tranche 205 (D-045). They stay as they were, but each is its own area now, with its own
// save, its own "שונה ע״י … לפני …" line and its own history; one button used to save both,
// which made "I changed the cap" also rewrite the reasons someone else was editing.
//
// The roster moved to the signers area (SignersArea): it is still read, not edited, here —
// people are created and deactivated in one place, /admin/users (tranche 173, D6).

import { useEffect, useRef, useState, type ReactNode } from "react";
import { TEAM_UI, UI, actorLabel } from "../_lib/labels";
import { fmtRelative } from "../_lib/format";
import type { QueueSettings, SalesSettings } from "../_lib/types";

export type SettingsArea = "queue" | "lost_reasons";
export type SettingsSaveVars = { queue: QueueSettings } | { lost_reasons: string[] };

export interface SettingsFormProps {
  settings: SalesSettings;
  savingArea?: SettingsArea | null;
  savedArea?: SettingsArea | null;
  error?: { area: SettingsArea; message: string } | null;
  onSave: (vars: SettingsSaveVars) => void;
  queueHistory?: ReactNode;
  lostReasonsHistory?: ReactNode;
}

const ERR = { color: "hsl(var(--s-sla-overdue))" } as const;
const FAINT = { color: "hsl(var(--s-fg-faint))" } as const;

export function SettingsForm({
  settings,
  savingArea = null,
  savedArea = null,
  error = null,
  onSave,
  queueHistory,
  lostReasonsHistory,
}: SettingsFormProps) {
  const [lostReasons, setLostReasons] = useState<string[]>(settings.lost_reasons);
  const [newReason, setNewReason] = useState("");
  const [dailyCap, setDailyCap] = useState<string>(String(settings.queue.daily_cap));
  const [order, setOrder] = useState<QueueSettings["order"]>(settings.queue.order);
  const capRef = useRef<HTMLInputElement>(null);

  // Re-seed when the server's copy arrives or changes underneath.
  useEffect(() => {
    setLostReasons(settings.lost_reasons);
    setDailyCap(String(settings.queue.daily_cap));
    setOrder(settings.queue.order);
  }, [settings]);

  const cap = Number(dailyCap);
  const capValid = Number.isInteger(cap) && cap >= 1 && cap <= 100;
  const queueDirty = cap !== settings.queue.daily_cap || order !== settings.queue.order;
  const reasonsDirty = JSON.stringify(lostReasons) !== JSON.stringify(settings.lost_reasons);

  /** Who last changed a setting, from sales_core.setting_event (0326). */
  function lastChange(key: string): string | null {
    const change = settings.last_changes.find((c) => c.key === key);
    if (!change) return null;
    return TEAM_UI.changedBy(actorLabel(change.actor), fmtRelative(change.at));
  }

  const status = (area: SettingsArea) => (
    <>
      {error?.area === area ? (
        <p role="alert" data-testid={`${area}-error`} className="text-[13px]" style={ERR}>{error.message}</p>
      ) : null}
      {/* Always present, so assistive tech announces the change of text (UX gate A11Y-187-003). */}
      <span role="status" data-testid={savedArea === area ? `${area}-saved` : undefined} className="text-[12px]" style={{ color: "hsl(var(--s-status-won))" }}>
        {savedArea === area ? UI.settingsSaved : ""}
      </span>
    </>
  );

  return (
    <>
      {/* The queue's shape: how many belong to a day, and which end of the backlog to start from. */}
      <section className="s-panel flex flex-col gap-2" aria-labelledby="settings-queue-title" data-testid="settings-queue">
        <form
          className="flex flex-col gap-2"
          data-testid="settings-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!capValid) {
              capRef.current?.focus();
              return;
            }
            onSave({ queue: { daily_cap: cap, order } });
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="settings-queue-title" className="s-section-heading">{UI.queueShapeTitle}</h3>
            {queueDirty ? <span className="s-quick-dirty">{TEAM_UI.unsaved}</span> : null}
          </div>

          <label className="s-eyebrow" htmlFor="queue-cap">{UI.queueCapLabel}</label>
          <input
            id="queue-cap"
            ref={capRef}
            data-testid="queue-cap"
            className="s-input w-32"
            type="number"
            min={1}
            max={100}
            inputMode="numeric"
            aria-invalid={!capValid}
            aria-describedby="queue-cap-error"
            value={dailyCap}
            onChange={(e) => setDailyCap(e.target.value)}
          />
          <p id="queue-cap-error" role="alert" data-testid="queue-cap-error" className="text-[12px]" style={ERR}>
            {!capValid ? UI.queueCapRange : ""}
          </p>

          <div className="flex gap-1" role="group" aria-label={UI.queueShapeTitle}>
            {(["newest_first", "oldest_first"] as const).map((option) => (
              <button
                key={option}
                type="button"
                data-testid={`queue-order-${option}`}
                aria-pressed={order === option}
                className={`s-tab ${order === option ? "s-tab-active" : ""}`}
                onClick={() => setOrder(option)}
              >
                {option === "newest_first" ? UI.queueOrderNewest : UI.queueOrderOldest}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              data-testid="queue-save"
              className="s-btn s-btn-ghost"
              aria-busy={savingArea === "queue" || undefined}
              disabled={savingArea === "queue" || !capValid || !queueDirty}
            >
              {TEAM_UI.queueSave}
            </button>
            {status("queue")}
            {lastChange("queue") ? <span className="text-[12px]" style={FAINT}>{lastChange("queue")}</span> : null}
          </div>
        </form>
        {queueHistory}
      </section>

      {/* The lost-reason vocabulary. Hardcoded in labels.ts until 0326. */}
      <section className="s-panel flex flex-col gap-2" aria-labelledby="settings-reasons-title" data-testid="settings-lost-reasons">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id="settings-reasons-title" className="s-section-heading">{UI.lostReasonsTitle}</h3>
          {reasonsDirty ? <span className="s-quick-dirty">{TEAM_UI.unsaved}</span> : null}
        </div>
        <p className="text-[12px]" style={FAINT}>{UI.lostReasonsHint}</p>

        <ul className="flex flex-col gap-2">
          {lostReasons.map((reason, i) => (
            <li key={reason} className="flex items-center gap-3">
              <span style={{ color: "hsl(var(--s-fg))" }}>{reason}</span>
              <button
                type="button"
                data-testid={`lost-reason-remove-${reason}`}
                aria-label={UI.removeItemNamed(reason)}
                className="inline-flex min-h-[44px] items-center justify-center px-3 underline"
                style={{ color: "hsl(var(--s-danger-quiet))" }}
                // Never empty: the drawer and the sheet both read this list.
                disabled={lostReasons.length <= 1}
                onClick={() => setLostReasons((prev) => prev.filter((_, j) => j !== i))}
              >
                {UI.removeItem}
              </button>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <input
            className="s-input flex-1"
            data-testid="lost-reason-new"
            aria-label={UI.lostReasonNew}
            placeholder={UI.lostReasonNew}
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
          />
          <button
            type="button"
            data-testid="lost-reason-add"
            className="s-btn s-btn-ghost"
            disabled={!newReason.trim() || lostReasons.includes(newReason.trim())}
            onClick={() => {
              // Appended before the free-text entry, so "the last one takes text" holds.
              setLostReasons((prev) => [...prev.slice(0, -1), newReason.trim(), prev[prev.length - 1]]);
              setNewReason("");
            }}
          >
            {UI.addItem}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-testid="lost-reasons-save"
            className="s-btn s-btn-ghost"
            aria-busy={savingArea === "lost_reasons" || undefined}
            disabled={savingArea === "lost_reasons" || !reasonsDirty}
            onClick={() => onSave({ lost_reasons: lostReasons })}
          >
            {TEAM_UI.lostReasonsSave}
          </button>
          {status("lost_reasons")}
          {lastChange("lost_reasons") ? <span className="text-[12px]" style={FAINT}>{lastChange("lost_reasons")}</span> : null}
        </div>
        {lostReasonsHistory}
      </section>
    </>
  );
}
