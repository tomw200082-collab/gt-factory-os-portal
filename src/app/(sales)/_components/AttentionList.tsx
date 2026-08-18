"use client";

// What is stuck, what nobody owns, what has gone quiet.
//
// This is the question the admin actually asks each morning, and until now it
// was answered in SQL or not at all (audit P0-5): the ingredients were computed
// per row — an overdue flag here, a red date there — and nothing ever added
// them up. A lead can appear in two sections; that is deliberate, each one
// answers a different question and hiding the second would hide the problem.

import { Phone } from "lucide-react";
import { fmtPhone } from "../_lib/format";
import { UI } from "../_lib/labels";
import { assigneeName } from "./AssigneePicker";
import { telHref } from "../_lib/wa";
import type { AssigneeEntry, AttentionRow } from "../_lib/types";

const BUCKETS = ["overdue", "unowned", "stalled"] as const;

const BUCKET_LABELS: Record<(typeof BUCKETS)[number], (n: number) => string> = {
  overdue: UI.bucketOverdue,
  unowned: UI.bucketUnowned,
  stalled: UI.bucketStalled,
};

export interface AttentionListProps {
  rows: AttentionRow[];
  roster: AssigneeEntry[];
  onOpen: (leadId: string) => void;
  /** Placing a call from here owes an outcome, exactly as it does on Today and
   *  in the drawer. Without it this screen was the one place in v2 where a
   *  conversation could happen and nothing would ask what came of it — the
   *  defect the whole outcome loop exists to close (gate flow P1). */
  onArm: (leadId: string, channel: "call") => void;
}

export function AttentionList({ rows, roster, onOpen, onArm }: AttentionListProps) {
  return (
    <div className="flex flex-col gap-6">
      {BUCKETS.map((bucket) => {
        const section = rows.filter((r) => r.bucket === bucket);
        if (section.length === 0) return null;
        return (
          <section
            key={bucket}
            data-testid={`attention-section-${bucket}`}
            aria-labelledby={`attention-title-${bucket}`}
            className="flex flex-col gap-2"
          >
            <h2 id={`attention-title-${bucket}`} className="s-eyebrow" style={{ margin: 0 }}>
              {BUCKET_LABELS[bucket](section.length)}
            </h2>

            {section.map((row) => {
              const tel = telHref(row.phone_e164);
              return (
                <article
                  key={`${row.bucket}-${row.lead_id}`}
                  data-testid={`attention-row-${row.lead_id}-${row.bucket}`}
                  aria-label={row.org_name}
                  className="s-card flex flex-wrap items-center justify-between gap-x-3 gap-y-2 p-3"
                >
                  {/* Identity and its metadata travel together. A flex-1 name
                      with the rest pushed to the far edge reads as a layout
                      accident on a wide screen, and forces the eye across the
                      whole row to connect a business to its number of days. */}
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      data-testid={`attention-open-${row.lead_id}-${row.bucket}`}
                      className="s-link min-w-0 text-start font-semibold"
                      onClick={() => onOpen(row.lead_id)}
                    >
                      {row.org_name}
                    </button>

                    {/* Days, in numerals, in the one colour that means late. */}
                    <span
                      className="s-badge s-badge-sla-overdue"
                      data-testid={`attention-days-${row.lead_id}-${row.bucket}`}
                    >
                      <bdi dir="ltr">{UI.daysStuck(row.days_stuck)}</bdi>
                    </span>

                    <span className="text-[12px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
                      {assigneeName(row.assignee, roster) ?? UI.ownerNone}
                    </span>
                  </div>

                  {tel ? (
                    <a
                      href={tel}
                      className="s-btn s-btn-ghost"
                      data-testid={`attention-call-${row.lead_id}-${row.bucket}`}
                      aria-label={UI.callOrg(row.org_name)}
                      onClick={() => onArm(row.lead_id, "call")}
                    >
                      <Phone size={16} aria-hidden />
                      <bdi dir="ltr" className="s-nums text-[12px]">
                        {fmtPhone(row.phone_e164)}
                      </bdi>
                    </a>
                  ) : null}
                </article>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
