// ---------------------------------------------------------------------------
// DetailPage pattern — empty convention shell. Substrate for Tranche A.
//
// This file establishes the TYPED CONTRACT that every detail surface in
// the portal will adopt in Tranche D. It renders a standard header + tab
// region + linkage region frame but does NOT implement tab switching,
// field rendering, or edit drawer composition. Adopters supply those
// concerns per-entity.
//
// Adoption rules (enforced in later-tranche dispatches, not here):
//   - Every `/admin/**/[id]` and `/purchase-orders/[id]` and similar
//     detail routes MUST compose DetailPage rather than hand-roll their
//     own layout.
//   - `header` is rendered at the top (identity + status + audit strip).
//   - `tabs` is rendered below the header (tab bar + tab content).
//   - `linkages` is rendered in a right-rail or lower card (related
//     entities navigable from here).
//   - `editDrawers` is an optional slot for edit-launching UI elements.
// ---------------------------------------------------------------------------

import type { ReactNode } from "react";

export interface DetailPageProps {
  entity: string;
  header: ReactNode;
  tabs: ReactNode;
  linkages?: ReactNode;
  editDrawers?: ReactNode;
  children?: ReactNode;
}

export function DetailPage({
  header,
  tabs,
  linkages,
  editDrawers,
  children,
}: DetailPageProps) {
  return (
    <>
      <div>{header}</div>
      {editDrawers && <div className="mb-2">{editDrawers}</div>}
      <div>{tabs}</div>
      {children}
      {linkages && <div className="mt-4">{linkages}</div>}
    </>
  );
}
