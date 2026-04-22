# Tranche 014: inbox-federation

status: landed-pending-review
created: 2026-04-22
landed: 2026-04-22
scorecard_target_category: flow_continuity + nav_integrity
expected_delta: +2 (flow_continuity 8→9, nav_integrity 7→8)
sizing: S (1 file)

## Why this tranche
The `/inbox` landing page is a one-link stub (`FALLBACK_LINKS = [{Exceptions}]`). All exception data the inbox should triage is already exposed at `/api/exceptions?status=…`, and Tranche 005 already mapped `physical-count-submission` / `waste-adjustment-submission` related-entity types to their approval deep links. This tranche stitches those two together: the inbox now becomes a real triage surface listing open + acknowledged exception rows with category badges, severity indicators, age, and deep links — using **only existing endpoints and existing logic**. No new backend dependency. The Exceptions deep link stays as a "see all" footer.

## Scope
- Convert `inbox/page.tsx` from a static server component into a client component that uses `useQuery` against `/api/exceptions?status=open&status=acknowledged&limit=50` (matches the planner exceptions page query shape).
- Render typed rows: severity dot, category badge, title, age (relative time), and an action affordance — when the row's `related_entity_type` matches an approval-able submission type, render an "Open approval" Link to the corresponding `/inbox/approvals/{type}/{id}` page; otherwise an "Open exception" Link to `/exceptions`.
- Group counts at the top: "Open: N · Acknowledged: M".
- Honest degradation: query error renders a danger banner with the upstream message; empty state renders an explicit "Inbox is clear" panel.
- Footer keeps the existing FALLBACK link to `/exceptions` for the full filter+resolve UX.
- Reuse the Tranche 005 entity-href mapping (extract a shared helper since it lives in two places now).

## Manifest (files that may be touched)
manifest:
  - src/app/(inbox)/inbox/page.tsx

## Revive directives (if any)
revive: []

## Out-of-scope
- Federating a separate `/api/approvals?status=pending` list — that endpoint doesn't exist yet (backend lane). When it lands, this same surface can add a second useQuery and merge.
- Inline acknowledge / resolve actions — those live on `/exceptions` and the approval detail pages; this tranche is a triage surface, not a mutation surface.
- Refactoring `entityHref` into a shared utility — defer; if the same logic appears in a third place, extract.

## Tests / verification
- typecheck clean.
- Manual: open `/inbox` while there are open exceptions → see typed rows; click on one with related_entity_type=physical-count-submission → lands on `/inbox/approvals/physical-count/{id}`.

## Rollback
Revert; the stub page is restored.

## Operator approval
- [x] Tom approves this plan (session directive 2026-04-22 — explicit "audit all and start the loop").

## Actual evidence
Filled in post-land.
