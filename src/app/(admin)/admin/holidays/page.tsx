"use client";

// ---------------------------------------------------------------------------
// /admin/holidays — Israel holiday calendar admin (NOT YET WIRED).
//
// Per inventory_flow_contract.md §7 the upstream Fastify endpoints are not
// yet built (UNRESOLVED-IF-ADMIN-HOLIDAYS-API). The portal page renders the
// not-yet-wired empty state. Holiday data is seeded from Hebcal (75 rows for
// 2026–2028) and consumed by the v_daily_inventory_flow projection without
// the admin override UI.
// ---------------------------------------------------------------------------

import { CalendarDays } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { Badge } from "@/components/badges/StatusBadge";
import { EmptyState } from "@/components/feedback/states";

export default function AdminHolidaysPage() {
  return (
    <>
      <WorkflowHeader
        eyebrow="Admin"
        title="Holiday calendar"
        description="Israel holiday calendar (Hebcal-derived) used by the daily inventory flow projection. Friday and Saturday are non-working by default; holidays may block pickup, supply, or both."
        meta={
          <Badge tone="warning" dotted>
            Backend not yet wired
          </Badge>
        }
      />

      <EmptyState
        icon={
          <CalendarDays className="h-5 w-5 text-fg-faint" strokeWidth={1.5} />
        }
        title="Admin override UI coming in a future cycle"
        description="Holiday data is seeded from Hebcal (75 rows for 2026–2028) and is already consumed by the projection. The per-row admin override (blocks_pickup, blocks_supply, notes) requires the upstream PATCH endpoint, which is tracked as UNRESOLVED-IF-ADMIN-HOLIDAYS-API and will be added by W1 in a follow-on cycle."
      />
    </>
  );
}
