# Tranche 005: planning-ux-polish

status: landed-pending-review
created: 2026-04-22
landed: 2026-04-22
scorecard_target_category: planning_surface
expected_delta: +2 (planning_surface 7→9, flow_continuity 3→4)
sizing: S (3 files)

## Why this tranche
Three planning-surface WARN-level gaps from the audit: (1) `forecast/new` open-draft redirects without invalidating `['forecasts','versions']` so returning to the list shows a stale cached view; (2) convert-to-PO toast in the planning-run detail page prints the PO number as plain text with no link; (3) exception rows render `related_entity_type:id` as plain text so planners cannot click through to the corresponding approval. All three are one-line or small-block fixes.

## Scope
- `forecast/new/page.tsx`: add `useQueryClient` + invalidate `['forecasts','versions']` in `openMut.onSuccess` before the router push.
- `runs/[run_id]/page.tsx`: extend toast state to support an optional `href` + `hrefLabel`; convert-to-PO success now includes `href: /purchase-orders/{po_id}`; render toast with a trailing `<Link>` when href present.
- `exceptions/page.tsx`: map `related_entity_type` values `physical-count-submission` and `waste-adjustment-submission` to `/inbox/approvals/{type}/{id}`; wrap the entity reference in a `<Link>` when the mapping applies.

## Manifest (files that may be touched)
manifest:
  - src/app/(planning)/planning/forecast/new/page.tsx
  - src/app/(planning)/planning/runs/[run_id]/page.tsx
  - src/app/(planner)/exceptions/page.tsx

## Revive directives (if any)
revive: []

## Out-of-scope
- Widening `['forecasts','versions']` invalidation to other forecast mutations.
- Deep-link banners in operator submit forms (Tranche 006).

## Tests / verification
- typecheck clean.
- grep `invalidateQueries` in forecast/new shows the new call site.

## Rollback
Revert the single tranche commit.

## Operator approval
- [x] Tom approves this plan (session directive "פשוט תתקן את הכל בריצה אחת" 2026-04-22).

## Actual evidence
Filled in post-land.
