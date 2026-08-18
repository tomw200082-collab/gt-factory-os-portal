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
import { UI } from "../_lib/labels";
import type { AssigneeEntry, SalesSettings, WhatsappTemplates } from "../_lib/types";

export interface SettingsFormProps {
  settings: SalesSettings;
  busy?: boolean;
  error?: string | null;
  saved?: boolean;
  onSave: (vars: {
    sla_hours?: number;
    whatsapp_templates?: WhatsappTemplates;
    assignees?: AssigneeEntry[];
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

  // Re-seed when the server's copy arrives or changes underneath.
  useEffect(() => {
    setTemplates(settings.whatsapp_templates);
    setSlaHours(String(settings.sla_hours));
    setRoster(settings.assignees);
  }, [settings]);

  const hours = Number(slaHours);
  const hoursValid = Number.isInteger(hours) && hours >= 1 && hours <= 168;

  return (
    <form
      className="flex flex-col gap-6"
      data-testid="settings-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!hoursValid) return;
        onSave({ sla_hours: hours, whatsapp_templates: templates, assignees: roster });
      }}
    >
      {/* People first: it is the control that unblocks a second person, and
          the one whose absence made every assignment a guess. */}
      <section className="flex flex-col gap-2" data-testid="settings-people">
        <h2 className="s-eyebrow">{UI.peopleTitle}</h2>

        <ul className="flex flex-col gap-2">
          {roster.map((person, i) => {
            const open = openLeadsByAssignee[person.email] ?? 0;
            return (
              <li
                key={person.email}
                data-testid={`person-${person.email}`}
                className="flex flex-wrap items-center gap-2"
              >
                <span className="flex-1" style={{ color: "hsl(var(--s-fg))" }}>
                  {person.name}
                </span>
                <bdi dir="ltr" className="text-[12px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
                  {person.email}
                </bdi>
                <label className="flex items-center gap-1 text-[13px]">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    data-testid={`person-active-${person.email}`}
                    checked={person.active}
                    onChange={() =>
                      setRoster((prev) =>
                        prev.map((p, j) => (j === i ? { ...p, active: !p.active } : p)),
                      )
                    }
                  />
                  {UI.personActive}
                </label>
                {person.active && open > 0 ? (
                  <span
                    data-testid={`person-open-${person.email}`}
                    className="text-[12px]"
                    style={{ color: "hsl(var(--s-fg-faint))" }}
                  >
                    {UI.deactivateWarning(open)}
                  </span>
                ) : null}
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

      <section className="flex flex-col gap-2">
        <h2 className="s-eyebrow">{UI.templatesTitle}</h2>
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

      <section className="flex flex-col gap-2">
        <h2 className="s-eyebrow">{UI.slaTitle}</h2>
        <p className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
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
          />
          <span className="text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
            {UI.slaHours}
          </span>
        </label>
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
          disabled={busy || !hoursValid}
          data-testid="settings-save"
          className="s-btn s-btn-primary"
        >
          {UI.save}
        </button>
      </div>
    </form>
  );
}
