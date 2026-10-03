"use client";

// The attention screen's weekly response metric (D-043, tranche 204): per rep, the leads that
// came in over the last 7 days — answered on time, answered late, not answered yet (and how
// many of those are about to pass) — and the share that met the target. Counted by the server
// (0377 v_sales_response_week); a rep sees only their own row.

import { UI } from "../_lib/labels";
import { assigneeName } from "./AssigneePicker";
import type { AssigneeEntry, ResponseWeekRow } from "../_lib/types";

export function ResponseWeek({ rows, roster }: { rows: ResponseWeekRow[]; roster: AssigneeEntry[] }) {
  return (
    <section className="s-panel flex flex-col gap-1" aria-labelledby="rt-week-title" data-testid="rt-week">
      <h2 id="rt-week-title" className="s-section-heading">{UI.weekTitle}</h2>
      <p className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>{UI.weekHint}</p>
      {rows.length === 0 ? (
        <p data-testid="rt-week-empty" className="text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>{UI.weekEmpty}</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((r) => {
            const decided = r.answered_on_time + r.answered_late + r.not_answered_overdue;
            return (
              <li key={r.assignee ?? "-"} data-testid={`rt-week-${r.assignee ?? "unowned"}`} className="s-rt-week-row">
                <span className="font-medium" style={{ color: "hsl(var(--s-fg))", minWidth: "7rem" }}>
                  {assigneeName(r.assignee, roster) ?? UI.weekUnowned}
                  <span className="ms-2 text-[12px] font-normal" style={{ color: "hsl(var(--s-fg-faint))" }}>{UI.weekTotal(r.total)}</span>
                </span>
                <dl className="s-rt-week-stats">
                  <div data-testid="rt-week-on_time"><dt>{UI.weekOnTime}</dt><dd>{r.answered_on_time}</dd></div>
                  <div data-testid="rt-week-late">
                    <dt>{UI.weekLate}</dt>
                    <dd style={r.answered_late > 0 ? { color: "hsl(var(--s-sla-overdue))" } : undefined}>{r.answered_late}</dd>
                  </div>
                  <div data-testid="rt-week-open"><dt>{UI.weekOpen}</dt><dd>{r.not_answered}</dd></div>
                  <div><dt>{UI.weekMetLabel}</dt>
                    <dd data-testid="rt-week-met">{r.met_pct === null ? UI.weekNoDecided : UI.weekMet(r.met_pct, r.answered_on_time, decided)}</dd>
                  </div>
                </dl>
                {r.not_answered_due_soon > 0 ? (
                  <p data-testid="rt-week-soon" className="w-full text-[12px]" style={{ color: "hsl(var(--s-review))", margin: 0 }}>
                    {UI.weekOpenDueSoon(r.not_answered_due_soon)}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
