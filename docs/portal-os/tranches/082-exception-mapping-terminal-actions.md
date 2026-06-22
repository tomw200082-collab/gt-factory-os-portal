# Tranche 082: exception-mapping-terminal-actions

status: in-progress
created: 2026-06-22
landed:
pr:
scorecard_target_category: flow_continuity
expected_delta: +3 (every inbox exception category reaches a real terminal action — no dead-ends; mapping-corridor interaction + a11y hardening)
sizing: M (no backend change; deep-link routing + mapping-surface UX/a11y)

## Why this tranche
Tom 2026-06-22: "תבדוק את הזרימה של כל סוגי הדברים בexceptions ... שלכל exception יהיה
נקודת סיום אופטימלית ושממפה ולא כמו עכשיו dead end" + "/ux-flow-audit /ux-release-gate
... איטרציות של תיקונים בדיקות ושיפורים עד שאתה לא מוצא כלום."

A read-only audit pass (ux-flow-architect + interaction-design-specialist +
accessibility-usability-auditor + ux-content-state-designer) found that the
prior inbox fix (commit 7c09e06) over-routed three Shopify exception categories
and `gi_expense_review` to surfaces that cannot display or resolve them —
re-creating dead-ends — plus a set of interaction/a11y gaps on the
supplier/SKU-alias mapping corridor.

## Scope (portal-only — no backend / schema / token change)
- **`src/features/inbox/client.ts`** — `resolveExceptionDeepLink` corrections:
  - `gi_expense_review` → `/inbox` (inline review; was dead-ending at /admin/integrations).
  - `shopify_variant_not_found` → `/inbox` (decision category; inline resolve).
  - `shopify_available_mapping_missing` / `shopify_available_mapping_stale` →
    `/admin/integrations` (AfS sync health; the alias page cannot show them).
  - `lionwheel_unknown_sku` → `/admin/sku-aliases?channel=lionwheel` (explicit).
  - `gi_unmapped_supplier` → `/admin/suppliers?hint=gi_unmapped` (context banner).
- **`src/app/(admin)/admin/suppliers/page.tsx`** — contextual banner when
  `?hint=gi_unmapped` is present; include `green_invoice_supplier_id` in the
  search filter so the operator can paste the GI id/name from the exception.
- **`src/app/(admin)/admin/masters/suppliers/[supplier_id]/page.tsx`** —
  field-specific success copy + "back to inbox" link after saving
  `green_invoice_supplier_id`; CostEditCell visible (non-tooltip) error + clear
  "Saved" on value change + cancel-button aria-label; "Add sourcing link"
  disabled while picker data loads.
- **`src/app/(admin)/admin/sku-aliases/page.tsx`** — "Check inbox" link on the
  approve-success banner; human-readable supply-method labels (no raw enums);
  real error copy + retry (replace "not yet available"); gate metric chips on
  load; per-row approve loading state; QuickCreateItemModal focus trap +
  return-focus + error role=alert; notes input aria-label.
- **`src/features/inbox/*` + `(inbox)/inbox/page.tsx`** — reject double-submit
  guard; dismiss-confirmation context; in-page bulk-resolve confirm (drop
  window.confirm); success-banner auto-dismiss; aria-live on success/error
  banners and recommendation outcomes; textarea labels; density button
  aria-label + touch target.
- **`src/components/tables/InlineEditCell.tsx` / `InlineEditSelectCell.tsx`** —
  visible save-error text + focus-visible ring; search input aria-label;
  listbox accessible name.
- **`src/components/admin/ClassWEditDrawer.tsx`** — optional `confirmLabel` so
  Archive/Restore confirm buttons mirror the verb.

### Out of scope (Tom decisions / other lanes)
- Inbox Hebrew→English button labels (A11Y-018) — `/inbox` Hebrew may be
  intentional; CLAUDE.md authorized-surface list is Tom-only. HOLD for Tom.
- Severity-dot token contrast (A11Y-001) — visual-system-designer lane.
- A dedicated Shopify AfS-mapping surface (FLOW-001 long-term) — needs backend
  contract; fallback routing used here.

## Manifest
manifest:
  - src/features/inbox/client.ts
  - src/features/inbox/meta.ts
  - src/features/inbox/approval-inline-card.tsx
  - src/features/inbox/recommendation-inline-card.tsx
  - src/app/(inbox)/inbox/page.tsx
  - src/app/(admin)/admin/suppliers/page.tsx
  - src/app/(admin)/admin/masters/suppliers/[supplier_id]/page.tsx
  - src/app/(admin)/admin/sku-aliases/page.tsx
  - src/app/(admin)/admin/integrations/page.tsx
  - src/components/tables/InlineEditCell.tsx
  - src/components/tables/InlineEditSelectCell.tsx
  - src/components/admin/ClassWEditDrawer.tsx
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/082-exception-mapping-terminal-actions.md
  - docs/portal-os/tranches/_active.txt

## Tests / verification
- typecheck clean (`tsc --noEmit` → 0).
- eslint clean on touched files.
- vitest green.

## Rollback
Revert the listed source files to their pre-082 form. No backend or token change.

## Operator approval
- [x] Tom 2026-06-22: "/ux-flow-audit /ux-release-gate ... איטרציות של תיקונים בדיקות ושיפורים."

## Iteration log
- **Iteration 1 (2026-06-22) — landed:** deep-link terminal-action corrections
  (`client.ts`: gi_expense_review + shopify_variant_not_found → /inbox;
  shopify_available_mapping_missing/_stale → /admin/integrations;
  lionwheel_unknown_sku → explicit ?channel=lionwheel; gi_unmapped_supplier →
  /admin/suppliers?hint=gi_unmapped); suppliers-list mapping-hint banner +
  GI-id search (FLOW-003); supplier-detail GI-save success + inbox link
  (FLOW-004) and de-jargoned GI help text (COPY-024); sku-aliases QuickCreate
  human-readable supply-method labels + de-snake_cased field labels +
  de-jargoned approve description + raw-id-free success copy
  (INTER-005/COPY-010/011/012/013/014). Verified: typecheck 0, eslint 0 errors,
  vitest 754/754.
- **Iteration 2 (2026-06-22) — landed:** shared inline-edit a11y (high leverage —
  every admin inline-edit surface): `InlineEditCell` focus-visible ring +
  visible role=alert save error instead of tooltip-only (A11Y-005/012,
  INTER-008); `InlineEditSelectCell` focus-visible ring + search-input aria-label
  + listbox accessible name (A11Y-005/013/016); supplier `CostEditCell` visible
  role=alert error + cancel-button aria-label (A11Y-014/015, INTER-009 partial);
  sku-aliases per-row notes aria-label (A11Y-010). Verified: typecheck 0,
  eslint 0 errors, vitest 754/754.
- **Iteration 3 (2026-06-22) — landed:** inbox screen-reader announcements:
  success/error toast banners now `role=status`/`role=alert` + aria-live
  (A11Y-020) and the success toast auto-dismisses after 4.5s (INTER-012);
  recommendation-inline-card approved/dismissed → aria-live polite,
  conflict/error → aria-live assertive (A11Y-017). Pure aria/logic — no Hebrew
  copy touched. Verified: typecheck 0, eslint 0, vitest 754/754.
- **Deferred to later iterations:** in-page bulk-resolve confirm (INTER-003);
  QuickCreate focus trap (A11Y-006); per-row approve loading (INTER-004);
  metric-chip load gating (INTER-011); ClassWEditDrawer confirmLabel
  (INTER-006); "Add sourcing link" loading-disable (INTER-007); integrations
  copy (COPY-016/018/020); density button aria-label/touch target
  (A11Y-002/008); reject double-submit guard (INTER-001).
- **HOLD for Tom (out of scope — see PR notes):** convert inbox Hebrew to
  English (COPY-001/003/004/005/006/007 + credit-card; A11Y-018). `/inbox` is
  not on the CLAUDE.md authorized-Hebrew list, but the strings carry explicit
  `Tom-locked Hebrew` comments and the operator Hebrew is plainly intentional.
  CLAUDE.md is Tom-only — recommend adding `/inbox` to the authorized list
  rather than de-Hebraizing.

## Actual evidence
- Iteration 1: `tsc --noEmit` → 0; `eslint` on touched files → 0 errors (11
  pre-existing exhaustive-deps warnings); `vitest run` → 754/754 pass (96 files).
- PR: (link at push)
