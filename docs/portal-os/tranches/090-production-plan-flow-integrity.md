# Tranche 090: production-plan — flow-integrity (P0 + in-flight safety)

status: in-progress
created: 2026-06-26
scorecard_target_category: flow_continuity / ops_surface
expected_delta: +1 (close the single P0 + the in-flight race/no-feedback class on a core planner surface)
sizing: M (6 surface files; logic + feedback, no copy/visual/token changes)
source: /screen-scorecard /planning/production-plan (2026-06-26) — 5-agent audit

## Why
The screen scorecard rated `/planning/production-plan` BLOCKED on one P0 plus a
recurring "no in-flight feedback / no guard" class flagged independently by the
flow, interaction, and a11y auditors. This tranche closes the correctness/safety
findings only. Visual-token cleanup and copy/lexicon land in later tranches (091, 092)
to keep each tranche bounded and independently verifiable.

## Findings addressed (correctness + in-flight safety)
- FLOW-013 [P0] page.tsx:2572 — empty-diff edit closes modal silently; add a toast.
- INTER-007 [P1] card action buttons fire during inflight mutation (race) — disable per-plan.
- INTER-001 [P1] header add CTAs not disabled during inflight create — double-modal risk.
- INTER-006 [P1] "Report" link discards unsaved RecipeOverridePanel edits — guard.
- INTER-011 [P1] InventoryImpactPanel BOM error has no retry — add refetch affordance.
- INTER-005 [P1] CancelModal confirm missing spinner (irreversibility *copy* deferred to 092).
- FLOW-017 [P1] RecipeOverridePanel does not restore focus on close — add focus-restore.
- INTER-002/003/004/008 [P2] missing spinners on secondary submit paths (same Loader2 pattern).

Out of scope here (later tranches): all VISUAL-*, all COPY-*, A11Y aria-hidden/label polish.

## Scope (manifest)
manifest:
  - src/app/(planning)/planning/production-plan/page.tsx
  - src/app/(planning)/planning/production-plan/_components/ProductionJobCard.tsx
  - src/app/(planning)/planning/production-plan/_components/ProductionNoteCard.tsx
  - src/app/(planning)/planning/production-plan/_components/RecipeOverridePanel.tsx
  - src/app/(planning)/planning/production-plan/_components/InventoryImpactPanel.tsx
  - src/app/(planning)/planning/production-plan/_components/ProductionDayLane.tsx
  - src/app/(planning)/planning/production-plan/_components/InventoryImpactPanel.test.tsx
  - docs/portal-os/registry.md

## Verification
- tsc 0 (baseline: 0 on 2026-06-26).
- vitest full suite green (baseline: 789/789); new focused tests for disabled-during-mutation + empty-diff toast.
- No copy/string changes, no token/className-visual changes (those are 091/092).

## Checklist
- [x] FLOW-013 toast on empty-diff edit (page.tsx handleEdit)
- [x] INTER-001 header CTAs disabled during create (3 header buttons)
- [x] INTER-011 BOM retry (InventoryImpactPanel error branch + test)
- [x] INTER-005 cancel spinner (CancelModal confirm)
- [x] INTER-003/004 spinners on EditModal / EditNoteModal / AddFromRecs save paths
- [x] FLOW-017 focus-restore (RecipeOverridePanel unmount)
- [x] tsc 0 + vitest green-after (790/790, +1 InventoryImpactPanel retry test)
- [ ] Tom merge review

## Deferred (honest scoping — moved out of 090)
- INTER-006 (Report-link guard vs unsaved recipe edits): the RecipeOverridePanel
  is a full overlay, so its open state already blocks reaching a card's Report
  link — low trigger; a clean guard needs the panel's dirty-state lifted to the
  page. Defer to a focused follow-up.
- INTER-007 (per-plan disable of card Edit/Cancel/Delete during inflight): those
  buttons only OPEN modals (the mutation + its spinner live in the modal, which
  covers the board), so the race is largely mitigated already. Wiring the
  existing `pendingPlanId` down to the cards is a clean later add, not worth the
  regression surface here.
- INTER-002 / INTER-008 (secondary "Add without reviewing recipe" + "Load last
  improvisation" spinners): P2 polish, bundle with 092.
