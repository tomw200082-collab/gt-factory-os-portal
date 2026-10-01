"use client";

// GT Pulse D1 signature: where this lead is, on every Today card.
import { UI } from "../_lib/labels";
import { MILESTONE_NAMES as names, furthestNode, railFromRow, type RailRow } from "../_lib/leadMilestones";

/** `decorative`: inside a button (a list card), where list markup is not
 *  allowed and the card's own text already names the lead: spans, hidden. */
export function MiniRail({ row, decorative = false }: { row: RailRow; decorative?: boolean }) {
  const nodes = railFromRow(row);
  const current = furthestNode(row);
  if (decorative) {
    return (
      <span className="s-mini-rail" aria-hidden="true" data-testid="mini-rail-decorative">
        {nodes.map((node) => (
          <span key={node.kind}
            className={`s-mini-rail-node s-mini-rail-${node.kind}${node.reached ? " s-mini-rail-reached" : ""}${node.kind === current ? " s-mini-rail-current" : ""}`}>
            <span className="s-mini-rail-dot" />
          </span>
        ))}
      </span>
    );
  }
  return (
    <ol className="s-mini-rail" aria-label={UI.railTitle} data-testid="mini-rail">
      {nodes.map((node) => (
        // Only reached milestones are named: an unreached node is a shape, not a claim.
        <li key={node.kind}
          className={`s-mini-rail-node s-mini-rail-${node.kind}${node.reached ? " s-mini-rail-reached" : ""}${node.kind === current ? " s-mini-rail-current" : ""}`}
          aria-label={node.reached ? names[node.kind] : undefined}
          aria-hidden={node.reached ? undefined : true}
          aria-current={node.kind === current ? "step" : undefined}>
          <span className="s-mini-rail-dot" />
        </li>
      ))}
    </ol>
  );
}
