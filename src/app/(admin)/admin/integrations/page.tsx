"use client";

import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { FreshnessBadge } from "@/components/badges/FreshnessBadge";
import { ApprovalBanner } from "@/components/workflow/ApprovalBanner";

const INTEGRATIONS = [
  {
    id: "lionwheel",
    name: "LionWheel",
    role: "Open orders + shipment mirror",
    status: "warn",
    last_at: "2026-04-14T09:48:00Z",
  },
  {
    id: "shopify",
    name: "Shopify",
    role: "FG stock sync (outbound)",
    status: "ok",
    last_at: "2026-04-14T11:20:00Z",
  },
  {
    id: "greeninvoice",
    name: "Green Invoice",
    role: "Supplier invoice + price evidence",
    status: "warn",
    last_at: "2026-04-14T07:02:00Z",
  },
] as const;

const STATUS_TONE = { ok: "success", warn: "warning", fail: "danger" } as const;

export default function IntegrationsAdminPage() {
  return (
    <>
      <WorkflowHeader
        eyebrow="System"
        title="Integrations"
        description="Connection health for boundary systems. Manual resync is wired as a mock button."
      />

      <ApprovalBanner
        tone="info"
        title="v1.1 slice — configuration UI deferred"
        reason="Live field names and credentials land in Windows 3/5. This shell lists the known boundary systems only."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {INTEGRATIONS.map((i) => (
          <SectionCard
            key={i.id}
            title={i.name}
            description={i.role}
            actions={<Badge tone={STATUS_TONE[i.status as "ok" | "warn" | "fail"]}>{i.status}</Badge>}
          >
            <FreshnessBadge label="Last sync" lastAt={i.last_at} warnAfterMinutes={30} />
            <div className="mt-3 flex gap-2">
              <button className="btn text-xs" disabled>
                Resync now
              </button>
              <button className="btn btn-ghost text-xs" disabled>
                View logs
              </button>
            </div>
          </SectionCard>
        ))}
      </div>
    </>
  );
}
