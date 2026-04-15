"use client";

import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { FreshnessBadge } from "@/components/badges/FreshnessBadge";
import { EmptyState } from "@/components/feedback/states";

export default function ProductionRecsPage() {
  return (
    <>
      <WorkflowHeader
        eyebrow="Planning workspace"
        title="Production recommendations"
        description="Lighter review surface for production ordering. Planned for v1.1 — shell only."
        meta={
          <>
            <FreshnessBadge label="Run" lastAt="2026-04-14T05:00:00Z" />
            <Badge tone="neutral">v1.1 slice</Badge>
          </>
        }
      />
      <SectionCard
        title="Not yet wired"
        description="Same approve / reject / hold pattern as purchase recs. Actions will be added once planning engine writes production_rec rows."
      >
        <EmptyState
          title="Production recommendations come from the planning engine"
          description="Blocked on Window 3 (planning) and Window 1 (planning_runs schema). This shell slice is reserved."
        />
      </SectionCard>
    </>
  );
}
