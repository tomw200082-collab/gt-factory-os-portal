"use client";

// Two things. The masterprompt says "Nothing else on this screen. Resist."

import { useEffect, useState } from "react";
import { UI } from "../_lib/labels";
import type { SalesSettings, WhatsappTemplates } from "../_lib/types";

export interface SettingsFormProps {
  settings: SalesSettings;
  busy?: boolean;
  error?: string | null;
  saved?: boolean;
  onSave: (vars: { sla_hours?: number; whatsapp_templates?: WhatsappTemplates }) => void;
}

export function SettingsForm({
  settings,
  busy = false,
  error = null,
  saved = false,
  onSave,
}: SettingsFormProps) {
  const [templates, setTemplates] = useState<WhatsappTemplates>(settings.whatsapp_templates);
  const [slaHours, setSlaHours] = useState<string>(String(settings.sla_hours));

  // Re-seed when the server's copy arrives or changes underneath.
  useEffect(() => {
    setTemplates(settings.whatsapp_templates);
    setSlaHours(String(settings.sla_hours));
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
        onSave({ sla_hours: hours, whatsapp_templates: templates });
      }}
    >
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
