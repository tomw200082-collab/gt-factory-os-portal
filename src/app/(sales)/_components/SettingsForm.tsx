"use client";

// The admin console.
//
// v1 held two things — the SLA and the WhatsApp templates — and everything else
// an admin needed to change was a SQL statement (audit §5: 2 of 9 controls
// present). This screen is where the queue's shape, the roster of people who
// may be handed leads, and the lost-reason vocabulary become editable, because
// every one of them is policy that will change and none of them belongs in a
// deploy.

import { useEffect, useState } from "react";
import { UI, actorLabel } from "../_lib/labels";
import { fmtRelative } from "../_lib/format";
import type {
  AssigneeEntry,
  QueueSettings,
  SalesSettings,
  WhatsappTemplates,
} from "../_lib/types";

export interface SettingsFormProps {
  settings: SalesSettings;
  busy?: boolean;
  error?: string | null;
  saved?: boolean;
  onSave: (vars: {
    sla_hours?: number;
    whatsapp_templates?: WhatsappTemplates;
    assignees?: AssigneeEntry[];
    lost_reasons?: string[];
    queue?: QueueSettings;
  }) => void;
  /** Open leads per assignee, so deactivating somebody can say what it would
   *  strand. Warned about, never blocked — the person may have left. */
  openLeadsByAssignee?: Record<string, number>;
}

export function SettingsForm({
  settings,
  busy = false,
  error = null,
  saved = false,
  onSave,
  openLeadsByAssignee = {},
}: SettingsFormProps) {
  const [templates, setTemplates] = useState<WhatsappTemplates>(settings.whatsapp_templates);
  const [slaHours, setSlaHours] = useState<string>(String(settings.sla_hours));
  const [roster, setRoster] = useState<AssigneeEntry[]>(settings.assignees);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [lostReasons, setLostReasons] = useState<string[]>(settings.lost_reasons);
  const [newReason, setNewReason] = useState("");
  const [dailyCap, setDailyCap] = useState<string>(String(settings.queue.daily_cap));
  const [order, setOrder] = useState<QueueSettings["order"]>(settings.queue.order);

  // Re-seed when the server's copy arrives or changes underneath.
  useEffect(() => {
    setTemplates(settings.whatsapp_templates);
    setSlaHours(String(settings.sla_hours));
    setRoster(settings.assignees);
    setLostReasons(settings.lost_reasons);
    setDailyCap(String(settings.queue.daily_cap));
    setOrder(settings.queue.order);
  }, [settings]);

  const hours = Number(slaHours);
  const hoursValid = Number.isInteger(hours) && hours >= 1 && hours <= 168;
  const cap = Number(dailyCap);
  const capValid = Number.isInteger(cap) && cap >= 1 && cap <= 100;

  /** Who last changed a setting, from sales_core.setting_event (0326). A screen
   *  that writes state without showing its history is how an SLA change
   *  recolours 188 leads with nobody able to say who did it. */
  function lastChange(key: string): string | null {
    const change = settings.last_changes.find((c) => c.key === key);
    if (!change) return null;
    return UI.lastChangedBy(actorLabel(change.actor), fmtRelative(change.at));
  }

  return (
    <form
      // A settings row is a label and its control, and at full width they sat
      // 700px apart — "אין תקציב" at one edge and its own הסר at the other,
      // which is the spreading tranche 170 fixed on the attention cards. A form
      // reads at a measure; the textareas were too wide to scan at full width
      // for the same reason.
      className="flex w-full max-w-2xl flex-col gap-6"
      data-testid="settings-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!hoursValid || !capValid) return;
        onSave({
          sla_hours: hours,
          whatsapp_templates: templates,
          assignees: roster,
          lost_reasons: lostReasons,
          queue: { daily_cap: cap, order },
        });
      }}
    >
      {/* People first: it is the control that unblocks a second person, and
          the one whose absence made every assignment a guess. */}
      <section className="flex flex-col gap-2" aria-labelledby="settings-people-title" data-testid="settings-people">
        <h2 id="settings-people-title" className="s-section-heading">{UI.peopleTitle}</h2>

        <ul className="flex flex-col gap-2">
          {roster.map((person, i) => {
            const open = openLeadsByAssignee[person.email] ?? 0;
            return (
              <li
                key={person.email}
                data-testid={`person-${person.email}`}
                className="flex flex-wrap items-center gap-2"
              >
                <span className="font-medium" style={{ color: "hsl(var(--s-fg))" }}>
                  {person.name}
                </span>
                <bdi dir="ltr" className="text-[12px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
                  {person.email}
                </bdi>
                {/* The toggle and the warning sit at the far end together, so
                    the row has two groups rather than four scattered items. */}
                <span className="ms-auto flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 text-[13px]">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    data-testid={`person-active-${person.email}`}
                    aria-label={UI.personActiveNamed(person.name)}
                    // Native checkboxes render the OS accent — system blue,
                    // which is nowhere in this palette.
                    style={{ accentColor: "hsl(var(--s-accent))" }}
                    checked={person.active}
                    onChange={() =>
                      setRoster((prev) =>
                        prev.map((p, j) => (j === i ? { ...p, active: !p.active } : p)),
                      )
                    }
                  />
                  {UI.personActive}
                </label>
                {open > 0 ? (
                  <span
                    data-testid={`person-open-${person.email}`}
                    className="text-[12px]"
                    style={{ color: "hsl(var(--s-fg-faint))" }}
                  >
                    {UI.deactivateWarning(open)}
                  </span>
                ) : null}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-end gap-2">
          <input
            className="s-input w-auto flex-1"
            aria-label={UI.personName}
            placeholder={UI.personName}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            className="s-input w-auto flex-1"
            type="email"
            aria-label={UI.personEmail}
            placeholder={UI.personEmail}
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <button
            type="button"
            data-testid="person-add"
            className="s-btn s-btn-ghost"
            disabled={!newName.trim() || !newEmail.includes("@")}
            onClick={() => {
              setRoster((prev) => [
                ...prev.filter((p) => p.email !== newEmail.trim()),
                { name: newName.trim(), email: newEmail.trim(), active: true },
              ]);
              setNewName("");
              setNewEmail("");
            }}
          >
            {UI.addPerson}
          </button>
        </div>
      </section>

      {/* The queue's shape. This is the answer to "188 leads is not a queue":
          how many belong to a day, and which end of the backlog to start from.
          It was a constant in two files and needed a deploy to change. */}
      <section className="flex flex-col gap-2" aria-labelledby="settings-queue-title" data-testid="settings-queue">
        <h2 id="settings-queue-title" className="s-section-heading">{UI.queueShapeTitle}</h2>

        <label className="s-eyebrow" htmlFor="queue-cap">
          {UI.queueCapLabel}
        </label>
        <input
          id="queue-cap"
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
        <p
          id="queue-cap-error"
          role="alert"
          data-testid="queue-cap-error"
          className="text-[12px]"
          style={{ color: "hsl(var(--s-sla-overdue))" }}
        >
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
        {lastChange("queue") ? (
          <p className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
            {lastChange("queue")}
          </p>
        ) : null}
      </section>

      {/* The lost-reason vocabulary. Hardcoded in labels.ts until now, which
          made "we should split this reason in two" a code change. */}
      <section className="flex flex-col gap-2" aria-labelledby="settings-reasons-title" data-testid="settings-lost-reasons">
        <h2 id="settings-reasons-title" className="s-section-heading">{UI.lostReasonsTitle}</h2>
        <p className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
          {UI.lostReasonsHint}
        </p>

        <ul className="flex flex-col gap-2">
          {lostReasons.map((reason, i) => (
            <li key={reason} className="flex items-center gap-3">
              <span style={{ color: "hsl(var(--s-fg))" }}>{reason}</span>
              <button
                type="button"
                data-testid={`lost-reason-remove-${reason}`}
                aria-label={UI.removeItemNamed(reason)}
                // A text link, not a button shell: four bordered 44px controls
                // in a stacked list outweigh the reasons they modify. The
                // touch target stays 44px, the visual weight does not.
                className="inline-flex min-h-[44px] items-center justify-center px-3 underline"
                style={{ color: "hsl(var(--s-danger-quiet))" }}
                // Never empty: the drawer and the sheet both read this list,
                // and an empty one would make a lead impossible to close.
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
              // Appended before the free-text entry so the "last one takes
              // text" rule keeps meaning what the hint says it means.
              setLostReasons((prev) => [
                ...prev.slice(0, -1),
                newReason.trim(),
                prev[prev.length - 1],
              ]);
              setNewReason("");
            }}
          >
            {UI.addItem}
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="settings-templates-title">
        <h2 id="settings-templates-title" className="s-section-heading">{UI.templatesTitle}</h2>
        <p className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
          {UI.templatesHint}
        </p>

        {(
          [
            ["new_lead", UI.templateNewLead],
            ["reminder", UI.templateReminder],
            ["returning_customer", UI.templateReturning],
          ] as Array<[keyof WhatsappTemplates, string]>
        ).map(([key, label]) => (
          <label key={key} className="flex flex-col gap-1">
            <span className="text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
              {label}
            </span>
            <textarea
              className="s-input"
              rows={3}
              data-testid={`settings-template-${key}`}
              value={templates[key]}
              onChange={(e) => setTemplates((t) => ({ ...t, [key]: e.target.value }))}
            />
          </label>
        ))}
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="settings-sla-title">
        <h2 id="settings-sla-title" className="s-section-heading">{UI.slaTitle}</h2>
        {/* Given an id and pointed at from the field: a hint that only sits
            near an input is invisible to anyone not looking at the screen. */}
        <p id="sla-hint" className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
          {UI.slaHint}
        </p>
        <label className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={168}
            className="s-input"
            style={{ maxWidth: 120 }}
            data-testid="settings-sla-hours"
            value={slaHours}
            onChange={(e) => setSlaHours(e.target.value)}
            aria-invalid={!hoursValid}
            aria-describedby="sla-hint sla-error"
          />
          <span className="text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
            {UI.slaHours}
          </span>
        </label>
        {/* aria-invalid with nothing to read announces "invalid" and stops
            there. The range is the whole of what the person needs. */}
        <p
          id="sla-error"
          role="alert"
          data-testid="settings-sla-error"
          className="text-[12px]"
          style={{ color: "hsl(var(--s-sla-overdue))" }}
        >
          {!hoursValid ? UI.slaRange : ""}
        </p>
      </section>

      {error ? (
        <p role="alert" data-testid="settings-error" className="text-[13px]" style={{ color: "hsl(var(--s-sla-overdue))" }}>
          {error}
        </p>
      ) : null}

      {saved ? (
        <p role="status" data-testid="settings-saved" className="text-[13px]" style={{ color: "hsl(var(--s-status-won))" }}>
          {UI.settingsSaved}
        </p>
      ) : null}

      <div>
        <button
          type="submit"
          disabled={busy || !hoursValid || !capValid}
          data-testid="settings-save"
          className="s-btn s-btn-primary"
        >
          {UI.save}
        </button>
      </div>
    </form>
  );
}
