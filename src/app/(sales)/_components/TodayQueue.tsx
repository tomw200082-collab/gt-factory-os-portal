"use client";

// The queue, grouped by why each item is in it.
//
// Order is the product: conversions first because that is the reason to open
// the app in the morning, then a returning customer (the one that must never go
// quiet again), then untouched new leads, then today's follow-ups. The view
// already returns rows in this order; grouping here makes the reason legible.

import { useState } from "react";
import { TODAY_SECTION_LABELS, UI } from "../_lib/labels";
import type { TodayItemType, TodayRow, WhatsappTemplates } from "../_lib/types";
import { TodayCard } from "./TodayCard";

const SECTION_ORDER: TodayItemType[] = [
  "conversion",
  "returning_customer",
  "new_lead",
  "due_follow_up",
];

/**
 * How many cards a section renders before asking. The imported backlog is 185
 * untouched leads: every card at once is unusable on a phone, and quietly
 * dropping the rest would misreport the work. So the count is always the true
 * one and the cards arrive in batches.
 */
const PAGE = 12;

export interface TodayQueueProps {
  rows: TodayRow[];
  templates: WhatsappTemplates | null;
  onArm: (leadId: string, channel: "call" | "whatsapp") => void;
  onPostpone: (row: TodayRow) => void;
  onLost: (row: TodayRow) => void;
}

function Section({
  type,
  rows,
  templates,
  onArm,
  onPostpone,
  onLost,
}: { type: TodayItemType; rows: TodayRow[] } & Omit<TodayQueueProps, "rows">) {
  const [shown, setShown] = useState(PAGE);
  const visible = rows.slice(0, shown);
  const remaining = rows.length - visible.length;

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
        <span
          data-testid="today-section-count"
          className="s-nums text-[12px]"
          style={{ color: "hsl(var(--s-fg-faint))" }}
        >
          {rows.length}
        </span>
      </div>

      {visible.map((row) => (
        <TodayCard
          key={row.lead_id}
          row={row}
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
          className="s-btn s-btn-ghost"
          aria-label={UI.showMore(Math.min(remaining, PAGE))}
          onClick={() => setShown((n) => n + PAGE)}
        >
          {UI.showMoreDetail(Math.min(remaining, PAGE), remaining)}
        </button>
      ) : null}
    </section>
  );
}

export function TodayQueue({ rows, templates, onArm, onPostpone, onLost }: TodayQueueProps) {
  return (
    <div className="flex flex-col gap-6">
      {SECTION_ORDER.map((type) => {
        const section = rows.filter((r) => r.item_type === type);
        if (section.length === 0) return null;
        return (
          <Section
            key={type}
            type={type}
            rows={section}
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
