# Tranche 139 — Meeting tuning cockpit + plan-board quantity tuning (gate P0 batch)

**Status:** implemented (pending merge)
**Origin:** `/ux-release-gate` full run 2026-07-23, Tom-dispatched in chat with two explicit directives:
1. "אני אפילו לא יכול לכוונן את הכמויות מדף תכנון הייצור — בכרטיסייה אין לי אופציה" — base-batch (tank) rows had **no quantity-tuning affordance anywhere in the stack** (FLOW-001/INT-P0, confirmed: `PatchProductionPlanRequest` had no `pack_manifest`, EditModal only date/qty/uom/notes and its qty field is illegal for base rows).
2. "תעשה שאוכל לכוונן הכל בצורה הכי מקצועית מדף הפגישה השבועית ישירות" — the weekly-meeting page had zero tuning affordances (read-only chips + links away).

**Cross-lane note:** the backend half (PATCH `pack_manifest` + `fill_l_per_unit` in reads) lives in `gt-factory-os` on the same branch — companion PR. Authorized by Tom's direct dispatch of the fix ("תתקן את כל מה שצריך").

## What shipped

### The cockpit (new capability)
- **`BatchTuneDialog`** (`production-plan/_components/BatchTuneDialog.tsx`, new) — the one tune dialog for a production batch anywhere it appears: production day, per-product pack split with a **live liters-vs-batch meter** (Σ qty×fill vs batch_size_l, ok/under/over tones, unit-total degrade when fill unknown), item-row quantity, notes, and a danger-zone **cancel-with-reason** — all in one surface. Dirty-close guard + in-flight close block + house dialog a11y.
- **Backend PATCH extension** (gt-factory-os): edit-mode accepts `pack_manifest` (complete replace; server recomputes `fg_share` from `items.base_fill_qty_per_unit`; 422 guards: NOT_A_BASE_BATCH, BASE_BATCH_QTY_FIXED, PACK_MANIFEST_DUPLICATE_ITEM, PACK_ITEM_NOT_FOUND, PACK_ITEM_WRONG_BASE). Read DTOs now carry `fill_l_per_unit` per manifest line (plan list + draft-week).
- **/planning/production-plan**: base-batch card Edit now opens BatchTuneDialog (item rows keep EditModal). The split is finally editable from the board card — Tom's #1 complaint.
- **/planning/meeting**: every W2 draft chip gains a tune affordance (pencil, canAct-gated, keyboard-operable); the **incoming-week (W1) strip became a full 5-day inline board** — every batch tunable/cancellable in place, done batches marked, plus "Open on the full board →". `usePatchPlan`/`useDeletePlan` now invalidate `["cadence"]` so meeting reads refresh after any tune.

### Gate P0s closed (same files, same dispatch)
- **COPY-001** — header counts: drafts no longer counted as "planned"; "N planned · M drafts to lock" in both count strips.
- **COPY-002** — unlock-week consequence banner ("procurement will no longer buy for this week") + confirm button renamed "Cancel N batches and stop procurement".
- **COPY-003/004** — cadence errors: no raw HTTP codes / backend detail passthrough; 403 carries a recovery path.
- **VIS-001/002** — `text-fg-subtle` (3.09:1) removed from modal form labels (`tracking-sops` pattern → `text-fg-muted`), past-day names, empty-lane CTA.
- **VIS-003** — draft cards get a distinct info-tinted surface (opacity alone collapsed at board density).

### S-effort P1s folded in
- **INT-002** — all 7 modals: backdrop click / Escape blocked while a mutation is in flight (incl. EditModal/EditNoteModal requestClose + the new dialog).
- **FLOW-003/009** — post-lock links carry `?week=`; firm-success banner leads with "View the locked week on the board →", procurement relabeled "For Sunday".
- **FLOW-004** — Edit/Cancel/Delete modal subtitles are base-batch aware (no more "Unnamed item"/"this item · 500 L").
- **FLOW-007** — regenerate confirm quantifies hand-edited drafts ("N of which carry your hand edits").
- **FLOW-010** — card notes wrapped in `<bdi dir="auto">` (Hebrew data values).
- **COPY-006** — "Not reportable yet" → "Lock in Weekly Meeting to report →" (deep-linked, week-aware).
- **COPY-009** — empty lane copy scoped to the day.
- **COPY-012** — "Generate / refresh drafts" → context-sensitive "Generate drafts"/"Regenerate drafts".
- **INT-006/INT-010** — AddFromRecs + Delete buttons gain in-flight spinners.
- **A11Y-005 (partial)** — "View report" links carry per-plan aria-labels.

## Files

Portal (`gt-factory-os-portal`):
- `src/app/(planning)/planning/production-plan/_components/BatchTuneDialog.tsx` (new) + `.test.tsx` (new, 12 tests)
- `src/app/(planning)/planning/production-plan/_components/ProductionJobCard.tsx`
- `src/app/(planning)/planning/production-plan/_components/ProductionDayLane.tsx`
- `src/app/(planning)/planning/production-plan/_lib/types.ts`, `_lib/usePlans.ts`
- `src/app/(planning)/planning/production-plan/page.tsx`
- `src/app/(planning)/planning/meeting/page.tsx`, `_lib/cadence.ts`
- `tests/unit/features/meeting-a11y.test.tsx`, `meeting-mobile.test.tsx` (stale-assertion updates for the intentional label/affordance changes)
- `docs/portal-os/tranches/139-meeting-tuning-cockpit.md`, `registry.md`, `_active.txt`

Backend (`gt-factory-os`, companion PR):
- `api/src/production-plan/schemas.ts` (PATCH schema + PackManifestLine.fill_l_per_unit)
- `api/src/production-plan/handler.ts` (pack_manifest branch: validation + fg_share recompute + is_user_modified)
- `api/src/production-plan/handler.reads.ts` (fill_l_per_unit in both manifest reads)
- `api/src/planning/handler.draft_week.ts`, `api/src/planning/schemas.ts` (fill in draft-week packs)

## Evidence

- Portal `npx tsc --noEmit` → clean (exit 0).
- Portal `npx vitest run` → **947/947 pass** (12 new BatchTuneDialog tests; 3 stale assertions updated for the intentional COPY-012 label change + the new chip tune affordance).
- Backend `npx tsc --noEmit` → no errors in changed modules (`production-plan/*`, `planning/*`); 10 pre-existing errors in untouched old test files (`greeninvoice/__tests__`, `test/shopify_adapter.test.ts`) — unrelated, predate this tranche.
- Playwright `@mocked` run: see PR check / e2e log.

## Deliberately NOT in this tranche (backlog → 140)

- **INT-001 / FLOW-006 (ARCH, L)** — "Add tank batch" manual-create path (POST has no base_bom_head_id). Needs a backend POST contract first.
- **INT-003 (L)** — quick day-move / drag-and-drop on the board (the tune dialog's date field now covers the verb in 2 taps).
- **A11Y-001 (M)** — RecipeOverridePanel nested-confirm focus trap.
- A11Y-002/003/006/008/009/010/011/012, VIS-004…VIS-012 (token sweeps, timeline-rail alignment, overlay token), COPY-005/007/008/010/011, INT-004/005/007/008/009/011/012, FLOW-005/008/011/012, A11Y-004/007 (touch-target floor on note cards + toast).
