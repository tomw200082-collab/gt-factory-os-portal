"use client";

// Settings, "זמני תגובה" (D-043, tranche 204).
//
// The working calendar the response clock counts in, and the two targets: a hot lead
// (tapped "order" or "hear more", or wrote) and every other lead, in working hours. Its
// own save and its own "who changed it", like the quick messages. The rules are the
// server's; the form says what is wrong before a save is refused. The hours are typed as
// HH:MM, 24-hour: a native time field shows "09:00 AM" in an English browser, on a Hebrew screen.

import { useEffect, useMemo, useState } from "react";
import { DAY_NAMES, DAY_SHORT, UI, actorLabel } from "../_lib/labels";
import { fmtRelative } from "../_lib/format";
import { validateResponseTime } from "../_lib/responseTime";
import type { ResponseTime } from "../_lib/types";

export interface ResponseTimeSectionProps {
  value: ResponseTime;
  change: { actor: string; at: string } | null;
  saving: boolean;
  saved: boolean;
  error: string | null;
  onSave: (value: ResponseTime) => void;
}

const same = (a: ResponseTime, b: ResponseTime) =>
  a.start === b.start && a.end === b.end && a.hot_hours === b.hot_hours && a.normal_hours === b.normal_hours &&
  a.days.length === b.days.length && a.days.every((d) => b.days.includes(d));

export function ResponseTimeSection({ value, change, saving, saved, error, onSave }: ResponseTimeSectionProps) {
  const [days, setDays] = useState<number[]>(value.days);
  const [start, setStart] = useState(value.start);
  const [end, setEnd] = useState(value.end);
  const [hot, setHot] = useState(String(value.hot_hours));
  const [normal, setNormal] = useState(String(value.normal_hours));
  useEffect(() => {
    setDays(value.days);
    setStart(value.start);
    setEnd(value.end);
    setHot(String(value.hot_hours));
    setNormal(String(value.normal_hours));
  }, [value]);

  const draft: ResponseTime = useMemo(() => ({
    days: [...days].sort((a, b) => a - b),
    start,
    end,
    // an empty field is not zero: it is a missing value, refused as such
    hot_hours: hot.trim() === "" ? Number.NaN : Number(hot),
    normal_hours: normal.trim() === "" ? Number.NaN : Number(normal),
  }), [days, start, end, hot, normal]);
  const problems = validateResponseTime(draft);
  const valid = Object.keys(problems).length === 0;
  const dirty = !same(draft, value);

  const field = (id: string, label: string, hint: string | null, v: string, set: (s: string) => void, problem?: string) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-medium" style={{ color: "hsl(var(--s-fg))" }}>{label}</label>
      {hint ? <p id={`${id}-hint`} className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>{hint}</p> : null}
      <span className="flex items-center gap-2">
        <input
          id={id}
          data-testid={id}
          className="s-input s-nums"
          style={{ maxWidth: 110 }}
          type="number"
          inputMode="decimal"
          min={0.5}
          max={40}
          step={0.5}
          value={v}
          onChange={(e) => set(e.target.value)}
          aria-invalid={problem ? true : undefined}
          aria-describedby={`${hint ? `${id}-hint ` : ""}${id}-error`}
        />
        <span className="text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>{UI.rtHoursUnit}</span>
      </span>
      <p id={`${id}-error`} role="alert" data-testid={`${id}-error`} className="text-[12px]" style={{ color: "hsl(var(--s-sla-overdue))" }}>
        {problem ?? ""}
      </p>
    </div>
  );

  return (
    <section
      className="s-panel flex w-full max-w-2xl flex-col gap-3"
      aria-labelledby="settings-rt-title"
      data-testid="settings-response-time"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="settings-rt-title" className="s-section-heading">{UI.rtTitle}</h2>
        {dirty ? <span data-testid="rt-dirty" className="s-quick-dirty">{UI.rtUnsaved}</span> : null}
      </div>
      <p id="rt-hint" className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>{UI.rtHint}</p>

      <fieldset className="flex flex-col gap-1" aria-describedby="rt-days-error">
        <legend className="font-medium" style={{ color: "hsl(var(--s-fg))" }}>{UI.rtDays}</legend>
        <div className="flex flex-wrap gap-1">
          {DAY_SHORT.map((short, d) => {
            const on = days.includes(d);
            return (
              <button
                key={d}
                type="button"
                data-testid={`rt-day-${d}`}
                aria-pressed={on}
                aria-label={DAY_NAMES[d]}
                className={`s-tab s-chip s-rt-day ${on ? "s-tab-active" : ""}`}
                onClick={() => setDays((prev) => (on ? prev.filter((x) => x !== d) : [...prev, d]))}
              >
                {short}
              </button>
            );
          })}
        </div>
        <p id="rt-days-error" role="alert" data-testid="rt-days-error" className="text-[12px]" style={{ color: "hsl(var(--s-sla-overdue))" }}>
          {problems.days ?? ""}
        </p>
      </fieldset>

      <div className="flex flex-wrap items-end gap-3">
        <span className="flex flex-col gap-1">
          <label htmlFor="rt-start" className="font-medium" style={{ color: "hsl(var(--s-fg))" }}>{UI.rtStart}</label>
          <input id="rt-start" data-testid="rt-start" type="text" inputMode="numeric" maxLength={5} placeholder="09:00" dir="ltr" className="s-input s-nums" style={{ maxWidth: 110 }} value={start}
            onChange={(e) => setStart(e.target.value)} aria-invalid={problems.hours ? true : undefined} aria-describedby="rt-hours-error" />
        </span>
        <span className="flex flex-col gap-1">
          <label htmlFor="rt-end" className="font-medium" style={{ color: "hsl(var(--s-fg))" }}>{UI.rtEnd}</label>
          <input id="rt-end" data-testid="rt-end" type="text" inputMode="numeric" maxLength={5} placeholder="17:00" dir="ltr" className="s-input s-nums" style={{ maxWidth: 110 }} value={end}
            onChange={(e) => setEnd(e.target.value)} aria-invalid={problems.hours ? true : undefined} aria-describedby="rt-hours-error" />
        </span>
      </div>
      <p id="rt-hours-error" role="alert" data-testid="rt-hours-error" className="text-[12px]" style={{ color: "hsl(var(--s-sla-overdue))" }}>
        {problems.hours ?? ""}
      </p>

      {field("rt-hot", UI.rtHot, UI.rtHotHint, hot, setHot, problems.hot)}
      {field("rt-normal", UI.rtNormal, null, normal, setNormal, problems.normal)}

      {error ? (
        <p role="alert" data-testid="rt-error" className="text-[13px]" style={{ color: "hsl(var(--s-sla-overdue))" }}>{error}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="rt-save"
          className="s-btn s-btn-ghost"
          aria-busy={saving || undefined}
          disabled={saving || !valid || !dirty}
          onClick={() => {
            if (!valid || !dirty) return;
            onSave(draft);
          }}
        >
          {UI.rtSave}
        </button>
        <span role="status" data-testid={saved ? "rt-saved" : undefined} className="text-[12px]" style={{ color: "hsl(var(--s-status-won))" }}>
          {saved ? UI.rtSaved : ""}
        </span>
        {change ? (
          <span className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
            {UI.rtChangedBy(actorLabel(change.actor), fmtRelative(change.at))}
          </span>
        ) : null}
      </div>
    </section>
  );
}
