// ---------------------------------------------------------------------------
// ListPage pattern — empty convention shell. Substrate for Tranche A.
//
// This file establishes the TYPED CONTRACT that every list surface in the
// portal will adopt in later tranches (D, F, G). It intentionally renders
// its children in a standard frame but does NOT implement table logic,
// filtering, pagination, or drawer opening — those concerns live in the
// adopter pages and in their column definitions.
//
// Adoption rules (enforced in later-tranche dispatches, not here):
//   - Every entity list page MUST compose ListPage rather than hand-roll
//     its own page header + table + filter bar.
//   - `entity` is the human-readable plural noun ("Items", "Suppliers",
//     "Planning runs"). It drives the WorkflowHeader title.
//   - `columns` and `filters` shapes are defined by the adopter (the generic
//     is left on purpose — TanStack Table column defs and zod-driven filter
//     schemas live per-entity).
// ---------------------------------------------------------------------------

import type { ReactNode } from "react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";

export interface ListPageProps {
  entity: string;
  // Column definitions — generic on purpose. Adopter pages type-narrow.
  columns: readonly unknown[];
  // Filter descriptors — generic on purpose. Adopter pages type-narrow.
  filters?: readonly unknown[];
  // Optional slot for a create drawer trigger rendered in the header area.
  createDrawer?: ReactNode;
  // Optional toggle for ACTIVE / INACTIVE / ALL views.
  statusToggle?: ReactNode;
  // Optional pagination control.
  pagination?: ReactNode;
  // Optional description under the title.
  description?: string;
  // The rendered table / empty state / loading state.
  children?: ReactNode;
}

export function ListPage({
  entity,
  createDrawer,
  statusToggle,
  pagination,
  description,
  children,
}: ListPageProps) {
  return (
    <>
      <WorkflowHeader
        eyebrow="List"
        title={entity}
        description={description}
      />
      {(createDrawer || statusToggle) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>{statusToggle}</div>
          <div>{createDrawer}</div>
        </div>
      )}
      <div>{children}</div>
      {pagination && <div className="mt-3">{pagination}</div>}
    </>
  );
}
