"use client";

// ---------------------------------------------------------------------------
// FlowRibbon — Band 1, the dashboard's signature visual (Tranche 060,
// design-doc §1 + §4). The factory pipeline rendered left-to-right:
//
//   INBOUND → MATERIALS → PRODUCTION → FINISHED GOODS → OUTBOUND
//
// Each node answers two things: state (one semantic color) and the number
// that proves it. Edges animate ONLY when a real movement crossed them
// today. OUTBOUND ships as a quiet node until the LionWheel-mirror read
// API lands (design-doc §8.3).
//
// Semantics: an <ol> — the pipeline is an ordered sequence of stages.
// Mobile: horizontal scroll-snap strip (design-doc §8.1) with the same
// ScrollFade affordance used by Quick Actions.
// ---------------------------------------------------------------------------

import { Fragment } from "react";
import { ScrollFade } from "@/components/ui/ScrollFade";
import { SectionHeading } from "@/components/workflow/SectionHeading";
import { FlowEdge, FlowNode, type FlowNodeData } from "./FlowNode";

export interface FlowEdgeActivity {
  /** Movement crossed this edge today (drives the dash-flow animation). */
  activeToday: boolean;
  /** Accessible description, e.g. "Goods received today". */
  label: string;
}

export interface FlowRibbonProps {
  nodes: FlowNodeData[];
  /** edges[i] sits between nodes[i] and nodes[i+1]. */
  edges: FlowEdgeActivity[];
  /** "updated 2m ago" — provenance for the whole band. */
  asOfLabel: string | null;
  loading?: boolean;
}

export function FlowRibbon({ nodes, edges, asOfLabel, loading }: FlowRibbonProps) {
  return (
    <section aria-label="Factory flow" data-testid="flow-ribbon">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <SectionHeading eyebrow="Factory flow" title="Suppliers to shipments" />
        {asOfLabel ? (
          <span className="text-2xs font-medium text-fg-faint">{asOfLabel}</span>
        ) : null}
      </div>

      <ScrollFade
        className="-mx-1 sm:mx-0"
        contentClassName="dash-ribbon flex items-stretch gap-0 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] sm:items-center sm:overflow-visible sm:px-0 sm:pb-0"
      >
        <ol className="contents" aria-label="Factory pipeline stages">
          {nodes.map((node, i) => (
            <Fragment key={node.key}>
              <li className="dash-ribbon-item contents sm:block">
                <FlowNode node={node} loading={loading} />
              </li>
              {i < nodes.length - 1 ? (
                <li aria-hidden className="dash-ribbon-edge-item flex items-center justify-center self-center">
                  <FlowEdge
                    active={edges[i]?.activeToday ?? false}
                    label={edges[i]?.label ?? ""}
                  />
                </li>
              ) : null}
            </Fragment>
          ))}
        </ol>
      </ScrollFade>
    </section>
  );
}
