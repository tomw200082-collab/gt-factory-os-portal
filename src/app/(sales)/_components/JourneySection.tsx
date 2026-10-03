"use client";

// "שיחה עם ליד" — what the customer already received (tranche 203, D-044).
//
// The lead line's automatic sequence, read-only: each message's exact text (built by the
// server from lead_texts.ts, never copied here), its footer and buttons, when it goes out
// (the slots and rules come from wake.ts through the server), and whether the line is
// live, in test mode or off. There is no control to change a text: that goes through Tom,
// the playbook, then Meta.

import { UI } from "../_lib/labels";
import type { Journey, JourneyStep } from "../_lib/types";

function whenOf(step: JourneyStep, journey: Journey, titles: Record<string, string>): string {
  const t = step.trigger;
  const r = journey.wake_rules;
  switch (t.kind) {
    case "first_message": return UI.journeyWhenFirst(t.when);
    case "button": {
      const title = titles[t.button_id] ?? t.button_id;
      return t.known_customer ? UI.journeyWhenTapCustomer(title) : UI.journeyWhenTap(title);
    }
    case "free_text": return UI.journeyWhenFreeText;
    case "stop_text": return UI.journeyWhenStop;
    case "wake": {
      const head = t.step === 1 ? UI.journeyWhenWake1(r.first_after_hours) : UI.journeyWhenWakeN(t.step);
      const slots = t.slots === "morning"
        ? `${r.slots.morning.from}–${r.slots.morning.to}`
        : `${r.slots.morning.from}–${r.slots.morning.to}, ${r.slots.afternoon.from}–${r.slots.afternoon.to}`;
      return `${head}. ${UI.journeySlots(slots)}`;
    }
  }
}

const EFFECT: Record<string, string> = {
  lost_not_now: UI.journeyEffectLost,
  opted_out: UI.journeyEffectOptOut,
  owner_alerted: UI.journeyEffectAlert,
};

function group(step: JourneyStep): "first" | "tap" | "other" | "wake" {
  if (step.trigger.kind === "first_message") return "first";
  if (step.trigger.kind === "button") return "tap";
  if (step.trigger.kind === "wake") return "wake";
  return "other";
}

const GROUPS = [
  ["first", UI.journeyGroupFirst],
  ["tap", UI.journeyGroupTap],
  ["other", UI.journeyGroupOther],
  ["wake", UI.journeyGroupWake],
] as const;

export function JourneySection({ journey }: { journey: Journey }) {
  // a tap's title, as the first message's own buttons name it
  const titles: Record<string, string> = {};
  for (const s of journey.steps) for (const b of s.buttons) if (b.id) titles[b.id] = b.title;
  const mode = journey.mode.state === "live"
    ? UI.journeyModeLive
    : journey.mode.state === "test" ? UI.journeyModeTest(journey.mode.test_phone_count) : UI.journeyModeOff;
  const r = journey.wake_rules;

  return (
    <section className="s-panel flex w-full max-w-2xl flex-col gap-3" aria-labelledby="settings-journey-title" data-testid="settings-journey">
      <h2 id="settings-journey-title" className="s-section-heading">{UI.journeyTitle}</h2>
      <p className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>{UI.journeyHint}</p>
      <p data-testid="journey-mode" data-state={journey.mode.state} className={`s-journey-mode s-journey-mode-${journey.mode.state}`}>
        {mode}
      </p>

      {GROUPS.map(([key, title]) => {
        const steps = journey.steps.filter((s) => group(s) === key);
        if (steps.length === 0) return null;
        return (
          <div key={key} className="flex flex-col gap-2">
            <h3 className="s-eyebrow">{title}</h3>
            {key === "wake" ? (
              <p data-testid="journey-wake-rules" className="text-[12px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
                {UI.journeyRules(r.min_hours_between, r.quiet_after_staff_hours, r.max_messages)}
              </p>
            ) : null}
            <ol className="s-journey-line flex flex-col gap-3">
              {steps.map((step) => (
                <li key={step.id} data-testid={`journey-step-${step.id}`} className="s-journey-step">
                  <span className="s-journey-dot" aria-hidden />
                  <p data-testid={`journey-when-${step.id}`} className="text-[12px] font-medium" style={{ color: "hsl(var(--s-fg-muted))" }}>
                    {whenOf(step, journey, titles)}
                  </p>
                  <div className="s-quick-bubble mt-1">
                    <p className="whitespace-pre-line text-[14px]">{step.text}</p>
                    {step.footer ? (
                      <p className="mt-2 text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
                        <span className="sr-only">{UI.journeyFooter} </span>{step.footer}
                      </p>
                    ) : null}
                  </div>
                  {step.buttons.length > 0 ? (
                    <ul className="mt-1 flex flex-wrap gap-1" aria-label={UI.journeyButtons}>
                      {step.buttons.map((b) => (
                        <li key={`${b.kind}-${b.title}`} className={`s-journey-button s-journey-button-${b.kind}`}>{b.title}</li>
                      ))}
                    </ul>
                  ) : null}
                  {step.effects.length > 0 ? (
                    <p className="mt-1 text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
                      {step.effects.map((e) => EFFECT[e] ?? e).join(" · ")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        );
      })}

      <p className="text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>{UI.journeyChangeVia}</p>
    </section>
  );
}
