"use client";

// "Where did this come from, and how current is it?" for any number or node
// on the workspace. Plain words only: no table, view or column names.

import { UI } from "../../_lib/labels";
import { Sheet } from "./Sheet";

export interface SourceInfo {
  /** The system, in words a salesperson knows. */
  system: string;
  /** When it was read, already formatted. */
  asOf: string | null;
  /** What the number is made of, when it is a number. */
  basis?: string;
  /** One more sentence of context, when it matters. */
  note?: string;
}

export function SourceSheet({ source, onClose }: { source: SourceInfo; onClose: () => void }) {
  return (
    <Sheet title={UI.sourceTitle} onClose={onClose} testId="source-sheet">
      <dl className="flex flex-col">
        <div className="s-field">
          <dt className="s-eyebrow">{UI.sourceSystem}</dt>
          <dd className="mt-0.5 text-[15px]" style={{ color: "hsl(var(--s-fg))" }}>
            {source.system}
          </dd>
        </div>
        {source.asOf ? (
          <div className="s-field">
            <dt className="s-eyebrow">{UI.sourceTime}</dt>
            <dd className="s-nums mt-0.5 text-[15px]" style={{ color: "hsl(var(--s-fg))" }}>
              {source.asOf}
            </dd>
          </div>
        ) : null}
        {source.basis ? (
          <div className="s-field">
            <dt className="s-eyebrow">{UI.sourceBasis}</dt>
            <dd className="mt-0.5 text-[15px]" style={{ color: "hsl(var(--s-fg))" }}>
              {source.basis}
            </dd>
          </div>
        ) : null}
      </dl>
      {source.note ? (
        <p className="mt-3 text-[13px] leading-relaxed" style={{ color: "hsl(var(--s-fg-muted))" }}>
          {source.note}
        </p>
      ) : null}
    </Sheet>
  );
}
