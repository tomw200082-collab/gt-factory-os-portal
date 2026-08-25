"use client";

// The queue, grouped by why each item is in it.
//
// Order is the product: conversions first because that is the reason to open
// the app in the morning, then a returning customer (the one that must never go
// quiet again), then today's promised callbacks, and only then the untouched
// backlog. The three ahead of the backlog are commitments and news; the backlog
// is the only part of the morning whose size is a choice. The view already
// returns rows in this order; grouping here makes the reason legible.

import Link from "next/link";
import { useState } from "react";
import { TODAY_SECTION_LABELS, UI } from "../_lib/labels";
import { CAPPED_SECTIONS, SECTION_ALARM_COUNT, budgetSpent, capRows } from "../_lib/queue";
import type {
  AssigneeEntry,
  TodayItemType,
  TodayRow,
  WhatsappTemplates,
} from "../_lib/types";
import { TodayCard } from "./TodayCard";

const SECTION_ORDER: TodayItemType[] = [
  "conversion",
  "returning_customer",
  "due_follow_up",
  "new_lead",
];

/**
 * How many cards a section renders before asking. The imported backlog is 149
 * callable untouched leads: every card at once is unusable on a phone, and
 * quietly dropping the rest would misreport the work. So the count is always
 * the true one and the cards arrive in batches.
 *
 * This is render batching, which is a different thing from the daily cap
 * below: batching decides how much arrives per tap, the cap decides how much
 * is owed today.
 */
const PAGE = 12;

export interface TodayQueueProps {
  rows: TodayRow[];
  dailyCap: number;
  slaHours: number;
  roster?: AssigneeEntry[];
  templates: WhatsappTemplates | null;
  onArm: (leadId: string, channel: "call" | "whatsapp") => void;
  onPostpone: (row: TodayRow) => void;
  onLost: (row: TodayRow) => void;
}

function Section({
  type,
  rows,
  budget,
  slaHours,
  roster,
  templates,
  onArm,
  onPostpone,
  onLost,
}: {
  type: TodayItemType;
  rows: TodayRow[];
  /** What is LEFT of the daily cap once earlier sections took their share. */
  budget: number;
} & Omit<TodayQueueProps, "rows" | "dailyCap">) {
  const [shown, setShown] = useState(PAGE);

  // Two limits, in order: the daily commitment decides what is owed today, the
  // batch decides how much of it is on screen right now.
  const { visible: committed, remaining: deferred } = capRows(rows, budget);
  const visible = committed.slice(0, shown);
  const remaining = committed.length - visible.length;
  const alarming = rows.length > SECTION_ALARM_COUNT;

  return (
    <section
      data-testid={`today-section-${type}`}
      aria-labelledby={`today-section-title-${type}`}
      className="flex flex-col gap-2"
    >
      <div className="flex items-baseline gap-2">
        <h2 id={`today-section-title-${type}`} className="s-eyebrow" style={{ margin: 0 }}>
          {TODAY_SECTION_LABELS[type]}
        </h2>
        {/* Muted, not faint, and red past the alarm threshold: this is the
            number that states the size of the fire, and it used to be the
            lightest ink on the page (audit P0-7). */}
        <span
          data-testid="today-section-count"
          className="s-nums text-[12px]"
          style={{
            color: alarming ? "hsl(var(--s-sla-overdue))" : "hsl(var(--s-fg-muted))",
          }}
        >
          {rows.length}
        </span>
      </div>

      {deferred > 0 ? (
        <p
          data-testid="today-daily-commitment"
          className="s-nums text-[12px]"
          style={{ color: "hsl(var(--s-fg-muted))" }}
        >
          {UI.dailyCommitment(committed.length, deferred)}{" "}
          {/* The sentence named a number of waiting leads and offered no way to
              reach them — a count that states a backlog should open it. */}
          <Link
            href="/sales/leads"
            data-testid="today-deferred-link"
            className="underline"
            style={{ color: "hsl(var(--s-accent))" }}
          >
            {UI.seeAllWaiting}
          </Link>
        </p>
      ) : null}

      {visible.map((row) => (
        <TodayCard
          key={row.lead_id}
          row={row}
          roster={roster}
          slaHours={slaHours}
          templates={templates}
          onArm={onArm}
          onPostpone={onPostpone}
          onLost={onLost}
        />
      ))}

      {remaining > 0 ? (
        <button
          type="button"
          data-testid="today-show-more"
          className="s-btn s-btn-ghost gap-2"
          onClick={() => setShown((n) => n + PAGE)}
        >
          {/* The visible words are the accessible name (2.5.3). The button used
              to read "עוד 12 · נותרו 173" while announcing something else, and
              neither half said what pressing it does. */}
          {UI.showMore(Math.min(remaining, PAGE))}
          <span className="s-nums text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
            {UI.showMoreRemaining(remaining)}
          </span>
        </button>
      ) : null}
    </section>
  );
}

export function TodayQueue({
  rows,
  dailyCap,
  slaHours,
  roster,
  templates,
  onArm,
  onPostpone,
  onLost,
}: TodayQueueProps) {
  // "כמה שיחות ביום" is one number for the day, and since tranche 173 it has a
  // single claimant: the untouched backlog. Handing the full cap to every
  // section spent it twice — 15 new leads and 15 follow-ups from a cap of 15
  // (gate P1) — and the over-correction that fixed it starved the follow-ups
  // instead. Sections still draw from one budget in render order; only one of
  // them draws anything.
  let budget = dailyCap;

  // "Why these?" is a question about the whole queue, so it is answered once,
  // here, where the single budget lives — not per section. Rendered per section
  // it printed twice whenever two sections overflowed, each copy claiming to
  // describe the whole queue.
  const overflowing = rows.filter((r) => CAPPED_SECTIONS.includes(r.item_type)).length > dailyCap;

  return (
    <div className="flex flex-col gap-6">
      {overflowing ? (
        <p
          data-testid="today-daily-cap-rule"
          className="s-nums text-[12px]"
          style={{ color: "hsl(var(--s-fg-muted))", margin: 0 }}
        >
          {UI.dailyCapRule(dailyCap)}
        </p>
      ) : null}
      {SECTION_ORDER.map((type) => {
        const section = rows.filter((r) => r.item_type === type);
        if (section.length === 0) return null;
        const share = budget;
        budget -= budgetSpent(section, budget);
        return (
          <Section
            key={type}
            type={type}
            rows={section}
            budget={share}
            slaHours={slaHours}
            roster={roster}
            templates={templates}
            onArm={onArm}
            onPostpone={onPostpone}
            onLost={onLost}
          />
        );
      })}
    </div>
  );
}
