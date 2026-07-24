# Tranche 145 — /production UX release-gate, iteration 1

**Status:** in progress
**Origin:** Production picking rollout plan Phase 4 (`gt-factory-os-production-brain/docs/plans/2026-07-24-production-picking-rollout.md`). Renumbered from the plan's "144" to **145** to avoid collision with a parallel session's tranche 144 (portal PR #184).
sizing: M
scorecard_target_category: ops_surface
expected_delta: closes all P0/P1 (+ cheap P2/P3) from a 5-lens /ux-release-gate pass on the `/production` corridor; hardens the surface before Denis/Maxim go live.

## Why this tranche
First of two post-launch UX polish iterations. Ran the full `/ux-release-gate` panel (interaction, visual-system, flow, accessibility) + design checklists against real rendered screenshots (light/dark × 390/1440 × today/tank-pick/pack-pick/report/empty) on the deployed `/production` corridor. This tranche fixes every real P0/P1 and every cheap P2/P3.

## Findings fixed (by auditor)
**P0/P1**
- INTER-001 / FLOW-001 (P0): IN_PRODUCTION run re-entry left pick rows interactive with no commit path → `disabled={terminal || committed}` on PickRow.
- INTER-002 (P1): UnplannedRunDialog header X unguarded during create → `disabled={mutation.isPending}`.
- INTER-003 (P1): AddMaterialControl save not client-gated (fired mutation → error) → `canSave` gate.
- VISUAL-145-01 (P1): EditQtySheet subtitle showed Hebrew `component_name` when a `floor_name` exists → `floor_name ?? component_name`.
- FLOW-002 (P1): ReportForm "Back to today" `backHref` pointed at the pick-list → `/production`.
- FLOW-004 (P1, portal part): success card showed local form state → render server-confirmed `report.data.output_qty/scrap_qty`. (Full filed-report audit trail needs a new backend read endpoint — ARCH, deferred to backend lane.)
- A11Y-T145-01 (P1): EditQtySheet quantity input unlabeled → `aria-labelledby`.
- A11Y-T145-02 (P1): ReportForm output `<label>` wrapped the step buttons (implicit assoc. hit the − button) → dedicated `htmlFor` label + input `id`.
- A11Y-T145-03 (P1): ReportForm scrap input unlabeled → `htmlFor` label + `id`.
- A11Y-T145-04 (P1): UnplannedRunDialog search results updated silently → persistent `aria-live` result-count region.
- A11Y-T145-05 (P1): DoneConfirmDialog Shift+Tab from the initial h2 escaped the focus trap → focus the primary confirm button on open.

**P2/P3**
- INTER-004 / INTER-005 (P2): disabled EditQtySheet Save + ReportForm submit gained `title` tooltips.
- FLOW-003 (P2): AddMaterialControl hidden when `lines.length === 0` (no empty dropdown alongside the empty-state card).
- FLOW-005 (P2): QC toggle collapse label "Cancel" → new copy key "Close" (`report_qc_close`).
- VISUAL-145-04 (P2): UoM label position unified (centered below the stepper input) across ReportForm to match EditQtySheet.
- VISUAL-145-05 (P2): ReportForm stepper glyphs `−`/`+` → Lucide `Minus`/`Plus` to match the other steppers.
- VISUAL-145-06 (P2): notes `<textarea>` used `.input` + `min-h-[3rem]` → `.textarea min-h-12`.
- A11Y-T145-06 (P2, contrast): `text-fg-subtle` (3.09:1 at 11px, fails AA in light) → `text-fg-muted` at the two `/production` call sites (DoneBar progress counter, PickRow UOM). Component-level swap only — the token itself is not edited (globals.css frozen).
- A11Y-T145-07 (P2): PickRow `aria-pressed` dropped in EDITED/NOT_COLLECTED → `aria-pressed={resolved}`.
- A11Y-T145-08 (P2): success announced the status label not the success copy → include `done` in the live-region message.
- A11Y-T145-09 (P3): QC `aria-controls` referenced an unmounted panel → conditional.
- A11Y-T145-10 (P3): DoneConfirmDialog container gained `tabIndex={-1}` focus fallback.

## Deferred (with rationale)
- VISUAL-145-02 (P1, **data not code**): the item "תה שחור" has no `floor_name`, so it renders Hebrew-primary. This is item master-data coverage — folded into the Phase 6 floor-name draft → Tom approval → 0298 backfill, not a portal code change.
- VISUAL-145-03 (P2, **kept by design**): the "Collecting is done" IN_PRODUCTION banner uses `warning`/amber. The IN_PRODUCTION run status is system-wide `warning` tone (its badge is amber). Recoloring only the banner would desync it from the status badge. Left as-is.
- FLOW-004 full (**ARCH/backend**): a `GET …/report-summary` endpoint to show the filed report on re-entry is a backend-lane change, out of scope for a portal tranche.

## Manifest (files that may be touched)
manifest:
- src/app/(production)/production/_lib/copy.ts
- src/app/(production)/production/_lib/copy.test.ts
- src/app/(production)/production/_components/UnplannedRunDialog.tsx
- src/app/(production)/production/runs/[run_id]/_components/PickList.tsx
- src/app/(production)/production/runs/[run_id]/_components/PickRow.tsx
- src/app/(production)/production/runs/[run_id]/_components/DoneBar.tsx
- src/app/(production)/production/runs/[run_id]/_components/EditQtySheet.tsx
- src/app/(production)/production/runs/[run_id]/_components/AddMaterialControl.tsx
- src/app/(production)/production/runs/[run_id]/report/_components/ReportForm.tsx
- tests/e2e/production-picking.spec.ts

## Out-of-scope
- Any globals.css / tailwind.config.ts / design-token edit.
- Backend contracts, schema, migrations.
- New mandatory fields; weakening the resolve-gate.

## Tests / verification
- `npx tsc --noEmit` → 0; `npx eslint .` → 0 errors (281-warning baseline).
- `npx vitest run` → all green (update copy.test.ts for the new `report_qc_close` key).
- `NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH=true` dev server + `npx playwright test --grep @mocked` → green (extend production-picking.spec.ts to assert IN_PRODUCTION rows are disabled + report back link).

## Exit evidence
- tsc/eslint/vitest/@mocked-playwright green in `portal-pr-guard`; P0 list empty (re-verified in Phase 5 / tranche 146).

## Rollback
Revert the commit. All changes are component-level prop/label/copy/class edits; no data-layer or token change; clean revert.

## Operator approval
- [x] Tom approved the rollout plan (autonomy 2026-07-24); Phase 4 iteration.

## Actual evidence (build run 2026-07-24)
- `npx tsc --noEmit` → 0.
- `npx eslint .` → 0 errors, 281 warnings (unchanged baseline).
- `npx vitest run` → 129 files / 1063 tests green (+1 new copy.test.ts assertion for the tranche-145 keys).
- `npx playwright test --grep @mocked` → 51/51 green (+2 new production-picking.spec.ts tests: IN_PRODUCTION rows read-only; report "Back to today" → /production).
- 5-lens `/ux-release-gate` panel run (interaction, visual-system, flow, accessibility) against 20 real screenshots (light × 390/1440 × 5 screens); consolidated 20+ findings, all P0/P1 fixed, cheap P2/P3 fixed, 3 items deferred with rationale (above).
- Files changed: copy.ts (+3 keys) + copy.test.ts; UnplannedRunDialog.tsx; PickList.tsx; PickRow.tsx; DoneBar.tsx; EditQtySheet.tsx; AddMaterialControl.tsx; ReportForm.tsx; production-picking.spec.ts. No token/globals/backend change.
