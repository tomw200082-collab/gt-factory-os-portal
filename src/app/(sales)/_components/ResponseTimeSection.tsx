"use client";

// Settings, "זמני תגובה" (D-043, tranche 204).
//
// The working calendar the response clock counts in, and the two targets: a hot lead
// (tapped "אני רוצה להזמין" or "רוצה לשמוע עוד", or wrote) and every other lead, in working
// hours. Its own save and its own "who changed it", like the quick messages. The rules are
// the server's; the form says what is wrong before a save is refused.
//
// A field is checked when the person leaves it, and every field when they save — never on
// each keystroke, which flashed "wrong" halfway through typing "17:00". Errors are polite
// live regions, and aria-invalid marks only the field that is wrong. The hours are typed as
// HH:MM, 24-hour: a native time field shows "09:00 AM" in an English browser, on a Hebrew
// screen.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DAY_NAMES, DAY_SHORT, UI, actorLabel } from "../_lib/labels";
import { fmtRelative } from "../_lib/format";
import { validateResponseTime, type ResponseTimeField } from "../_lib/responseTime";
import type { ResponseTime } from "../_lib/types";

export interface ResponseTimeSectionProps {
  value: ResponseTime;
  change: { actor: string; at: string } | null;
  saving: boolean;
  saved: boolean;
  error: string | null;
  onSave: (value: ResponseTime) => void;
  /** D-045: the key's last 20 changes (SettingHistory), under the save */
  history?: ReactNode;
}

const same = (a: ResponseTime, b: ResponseTime) =>
  a.start === b.start && a.end === b.end && a.hot_hours === b.hot_hours && a.normal_hours === b.normal_hours &&
  a.days.length === b.days.length && a.days.every((d) => b.days.includes(d));

const ERR_STYLE = { color: "hsl(var(--s-sla-overdue))" } as const;

export function ResponseTimeSection({ value, change, saving, saved, error, onSave, history }: ResponseTimeSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const [days, setDays] = useState<number[]>(value.days);
  const [start, setStart] = useState(value.start);
  const [end, setEnd] = useState(value.end);
  const [hot, setHot] = useState(String(value.hot_hours));
  const [normal, setNormal] = useState(String(value.normal_hours));
  // which fields have been left (or saved): only those show their error
  const [shown, setShown] = useState<Set<ResponseTimeField>>(new Set());
  useEffect(() => {
    setDays(value.days);
    setStart(value.start);
    setEnd(value.end);
    setHot(String(value.hot_hours));
    setNormal(String(value.normal_hours));
    setShown(new Set());
  }, [value]);

  const draft: ResponseTime = useMemo(() => ({
    days: [...days].sort((a, b) => a - b),
    start: start.trim(),
    end: end.trim(),
    // an empty field is not zero: it is a missing value, refused as such
    hot_hours: hot.trim() === "" ? Number.NaN : Number(hot),
    normal_hours: normal.trim() === "" ? Number.NaN : Number(normal),
  }), [days, start, end, hot, normal]);
  const problems = validateResponseTime(draft);
  const valid = Object.keys(problems).length === 0;
  const dirty = !same(draft, value);
  const show = (f: ResponseTimeField) => setShown((prev) => (prev.has(f) ? prev : new Set(prev).add(f)));
  const problem = (f: ResponseTimeField) => (shown.has(f) ? problems[f] : undefined);

  const errorLine = (f: ResponseTimeField) => (
    <p id={`rt-${f}-error`} aria-live="polite" data-testid={`rt-${f}-error`} className="text-[12px]" style={ERR_STYLE}>
      {problem(f) ?? ""}
    </p>
  );

  const timeField = (f: "start" | "end", label: string, v: string, set: (s: string) => void, placeholder: string) => (
    <span className="flex flex-col gap-1">
      <label htmlFor={`rt-${f}`} className="font-medium" style={{ color: "hsl(var(--s-fg))" }}>{label}</label>
      <input
        id={`rt-${f}`}
        data-testid={`rt-${f}`}
        type="text"
        inputMode="numeric"
        maxLength={5}
        placeholder={placeholder}
        dir="ltr"
        className="s-input s-nums"
        style={{ maxWidth: 110 }}
        value={v}
        onChange={(e) => set(e.target.value)}
        onBlur={() => show(f)}
        aria-invalid={problem(f) ? true : undefined}
        aria-describedby={`rt-${f}-error`}
      />
      {errorLine(f)}
    </span>
  );

  const hoursField = (f: "hot" | "normal", label: string, hint: string | null, v: string, set: (s: string) => void) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={`rt-${f}`} className="font-medium" style={{ color: "hsl(var(--s-fg))" }}>{label}</label>
      {hint ? <p id={`rt-${f}-hint`} className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>{hint}</p> : null}
      <span className="flex items-center gap-2">
        <input
          id={`rt-${f}`}
          data-testid={`rt-${f}`}
          className="s-input s-nums"
          style={{ maxWidth: 110 }}
          type="number"
          inputMode="decimal"
          min={0.5}
          max={40}
          step={0.5}
          value={v}
          onChange={(e) => set(e.target.value)}
          onBlur={() => show(f)}
          aria-invalid={problem(f) ? true : undefined}
          aria-describedby={`${hint ? `rt-${f}-hint ` : ""}rt-${f}-error`}
        />
        <span className="text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>{UI.rtHoursUnit}</span>
      </span>
      {errorLine(f)}
    </div>
  );

  return (
    <section
      ref={sectionRef}
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
                className={`s-tab s-chip s-rt-day ${on ? "s-tab-active" : ""}`}
                onClick={() => {
                  // a tap is a decision already made: its check runs at once
                  show("days");
                  setDays((prev) => (on ? prev.filter((x) => x !== d) : [...prev, d]));
                }}
              >
                {/* the accessible name holds the visible letter, then the day's full name */}
                {short}
                <span className="sr-only"> {DAY_NAMES[d]}</span>
              </button>
            );
          })}
        </div>
        {errorLine("days")}
      </fieldset>

      <div className="flex flex-wrap items-start gap-3">
        {timeField("start", UI.rtStart, start, setStart, "09:00")}
        {timeField("end", UI.rtEnd, end, setEnd, "17:00")}
      </div>

      {hoursField("hot", UI.rtHot, UI.rtHotHint, hot, setHot)}
      {hoursField("normal", UI.rtNormal, null, normal, setNormal)}

      {error ? (
        <p role="alert" data-testid="rt-error" className="text-[13px]" style={ERR_STYLE}>{error}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="rt-save"
          className="s-btn s-btn-ghost"
          aria-busy={saving || undefined}
          disabled={saving || !dirty}
          onClick={() => {
            if (!valid) {
              setShown(new Set<ResponseTimeField>(["days", "start", "end", "hot", "normal"]));
              // move to the first field that is wrong, in reading order, so the error is where the person is
              const first = (["days", "start", "end", "hot", "normal"] as ResponseTimeField[]).find((f) => problems[f]);
              const target = first === "days"
                ? sectionRef.current?.querySelector<HTMLElement>('[data-testid="rt-day-0"]')
                : first ? sectionRef.current?.querySelector<HTMLElement>(`#rt-${first}`) : null;
              target?.focus();
              return;
            }
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
      {history}
    </section>
  );
}
