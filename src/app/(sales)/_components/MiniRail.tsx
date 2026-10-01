"use client";

// GT Pulse D1 signature: where this lead is, on every Today card.
import { UI } from "../_lib/labels";
import { MILESTONE_NAMES as names, furthestNode, railFromRow, type RailRow } from "../_lib/leadMilestones";

export function MiniRail({ row }: { row: RailRow }) {
  const nodes = railFromRow(row);
  const current = furthestNode(row);
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
