// ---------------------------------------------------------------------------
// FlowNode — one stage of the Factory Flow Ribbon (Tranche 060, design-doc
// §4 Band 1). Anatomy: stage label + state dot · display number · sub-line.
// A linked node carries a hover/focus drill card with up to 3 secondary rows
// (CSS-revealed; the full focus-trapped popover is a 061 refinement).
//
// data-state drives all color through tokens: ok / warn / danger / quiet.
// "quiet" = anatomically present but not yet live (OUTBOUND until the
// LionWheel-mirror read API lands) — reduced opacity, no link, no fake data.
// ---------------------------------------------------------------------------

import type { ReactNode } from "react";
import Link from "next/link";

export type FlowNodeState = "ok" | "warn" | "danger" | "quiet";

export interface FlowDrillRow {
  key: string;
  label: string;
  value: string;
}

export interface FlowNodeData {
  key: string;
  /** Stage label: "Inbound" / "Materials" / … */
  label: string;
  state: FlowNodeState;
  /** Display number ("12", "2.1d", "₪ 1.2M"). Null while loading. */
  display: string | null;
  /** Full-precision tooltip for the display number (optional). */
  displayFull?: string | null;
  sub: ReactNode;
  href: string | null;
  /** Up to 3 drill rows shown in the hover/focus card. */
  drill: FlowDrillRow[];
  /** Screen-reader stage summary ("Stage 2 of 5, Materials: …"). */
  srSummary: string;
}

export function FlowNode({ node, loading }: { node: FlowNodeData; loading?: boolean }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="dash-node-label">{node.label}</span>
        <span className="dash-node-dot" aria-hidden />
      </div>
      {loading || node.display === null ? (
        node.state === "quiet" ? (
          <div className="dash-node-value" aria-hidden>
            —
          </div>
        ) : (
          <div
            className="relative mt-1 h-8 w-16 overflow-hidden rounded bg-bg-muted"
            aria-hidden
          >
            <div
              className="absolute inset-y-0 w-3/5 bg-gradient-to-r from-transparent via-bg-raised/80 to-transparent motion-reduce:hidden"
              style={{ animation: "gt-shimmer 1.5s ease-in-out infinite" }}
            />
          </div>
        )
      ) : (
        <div
          className="dash-node-value"
          title={node.displayFull ?? undefined}
        >
          {node.display}
        </div>
      )}
      <div className="dash-node-sub">{node.sub}</div>
      <span className="sr-only">{node.srSummary}</span>

      {/* Drill card — CSS-revealed on hover/focus-within (desktop). */}
      {node.drill.length > 0 ? (
        <div className="dash-node-card" role="group" aria-label={`${node.label} details`}>
          {node.drill.slice(0, 3).map((d) => (
            <div key={d.key} className="flex items-baseline justify-between gap-3 text-2xs">
              <span className="truncate text-fg-muted">{d.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-fg-strong">
                {d.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );

  if (node.href && node.state !== "quiet") {
    return (
      <Link
        href={node.href}
        data-state={node.state}
        data-testid={`flow-node-${node.key}`}
        className="dash-node is-link group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        {body}
      </Link>
    );
  }
  return (
    <div
      data-state={node.state}
      data-testid={`flow-node-${node.key}`}
      className="dash-node"
      title={node.state === "quiet" ? "Activates with the shipments mirror." : undefined}
    >
      {body}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FlowEdge — directional connector between two stages. The dash-flow
// animation runs ONLY when a real movement crossed this edge today
// (LAW 2: motion encodes a real event). A still edge is information too.
// ---------------------------------------------------------------------------
export function FlowEdge({ active, label }: { active: boolean; label: string }) {
  return (
    <div
      className="dash-edge"
      data-active={active ? "true" : undefined}
      role="img"
      aria-label={label}
    >
      <svg viewBox="0 0 28 12" width="28" height="12" aria-hidden className="shrink-0">
        <line
          x1="1"
          y1="6"
          x2="21"
          y2="6"
          className="dash-edge-line"
          strokeWidth="1.5"
        />
        <path d="M20 2 L26 6 L20 10" fill="none" className="dash-edge-head" strokeWidth="1.5" />
      </svg>
    </div>
  );
}
