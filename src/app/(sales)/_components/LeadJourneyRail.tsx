"use client";

import type { CSSProperties } from "react";
import { fmtDateTime } from "../_lib/format";
import { UI } from "../_lib/labels";
import { deriveLeadMilestones, type MilestoneKind } from "../_lib/leadMilestones";
import type { LeadEventRow } from "../_lib/types";

const names: Record<MilestoneKind, string> = {
  created: UI.railCreated,
  outreach: UI.railOutreach,
  answered: UI.railAnswered,
  next_action: UI.railNextAction,
  converted: UI.railConverted,
};

export function LeadJourneyRail({ events }: { events: LeadEventRow[] }) {
  const milestones = deriveLeadMilestones(events);
  if (milestones.length === 0) return null;
  return (
    <section className="s-lead-rail" aria-label={UI.railTitle} data-testid="lead-rail">
      <h3 className="s-eyebrow">{UI.railTitle}</h3>
      <ol className="s-lead-rail-path">
        {milestones.map((node, index) => (
          <li key={node.kind} className={`s-lead-rail-node s-lead-rail-${node.kind}`} data-testid={`rail-${node.kind}`}
            style={{ "--i": index } as CSSProperties}>
            <span className="s-lead-rail-marker" aria-hidden />
            <div className="min-w-0">
              <p className="font-semibold">{names[node.kind]}</p>
              <time className="s-nums text-[12px]" dateTime={node.at}>{fmtDateTime(node.at)}</time>
              <button type="button" className="s-lead-rail-source"
                aria-label={`${names[node.kind]} — ${UI.railSource}`}
                onClick={() => {
                  const source = document.getElementById(`lead-event-${node.sourceEventId}`);
                  source?.scrollIntoView({ block: "nearest", behavior: "instant" });
                  source?.focus();
                }}>
                {UI.railSource}
              </button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
