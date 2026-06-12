# Tranche 063 — chain-audit fixes: forecast → meeting → procurement → PO → goods receipt

status: in progress (branch `claude/sales-forecast-procurement-audit-7rr3h1`; Tom merges)
source: full-chain audit report (2026-06-12, commit 61d86d2) — 27 audited findings,
implemented in six groups (A cache trust · B chain bridges · C procurement flow ·
D forecast list · E PO surfaces · F receipts).
language policy (locked for this tranche): `/planning/procurement` and its components
REMAIN Hebrew (Tom's deliberate operator experience — scoped exception). All other
surfaces are English-first. New Hebrew strings on the procurement surface match the
register of the existing copy there.

## File manifest
- `docs/portal-os/tranches/063-chain-audit-fixes.md` — this plan.
- `docs/portal-os/tranches/_active.txt` — set to 063 while active; cleared at close.
- `src/app/(ops)/stock/receipts/page.tsx` — A1 invalidation set; R01 over-receipt
  two-step submit; R03 manual-success forward links.
- `src/app/(po)/purchase-orders/new/page.tsx` — A2 create-success invalidation;
  N01 reactive summary card; N02 po_number display; N03 description copy.
- `src/app/(po)/purchase-orders/page.tsx` — A3 "From recommendation" repoint to
  /planning/procurement; A13 mirror q= and late=1 into the URL.
- `src/app/(po)/purchase-orders/[po_id]/page.tsx` — PO01 save success feedback;
  PO02 human field labels; PO03 drop supplier_id suffix when name exists.
- `src/app/(planning)/planning/runs/[run_id]/recommendations/[rec_id]/page.tsx` —
  A6 convert-to-PO invalidation extension.
- `src/app/(planning)/planning/runs/page.tsx` — A7 run-trigger also invalidates
  ["planning","overview"].
- `src/app/(planning)/planning/forecast/[version_id]/page.tsx` — A4 post-publish
  bridge → /planning/meeting (+ quiet diagnostics link to runs); A7 publish also
  invalidates ["planning","overview"]; A8 key-root rename forecast→forecasts.
- `src/app/(planning)/planning/forecast/[version_id]/_lib/use-auto-save.ts` — A8
  key-root rename.
- `src/app/(planning)/planning/forecast/page.tsx` — A8 key-root rename
  (production-liters); F01 staleness banner below WorkflowHeader.
- `src/app/(planning)/planning/forecast/_lib/staleness.ts` — NEW pure helper for
  the F01 banner state, with unit test.
- `src/app/(planning)/planning/forecast/_components/ForecastRow.tsx` — F03 pencil
  only on drafts, eye only on published/archived.
- `src/app/(planning)/planning/meeting/_lib/cadence.ts` — A7 + A9 firm-week
  invalidation extension.
- `src/app/(planning)/planning/meeting/page.tsx` — A5 "Open Sunday procurement →"
  CTA in the firm-success banner.
- `src/app/(planning)/planning/procurement/page.tsx` — PC02 inline supersede
  confirmation (replaces window.confirm; sends supersede:true); PC03 session-start
  success banner; PC04 quiet order-history link; A14 ?view=calendar support.
- `src/app/(planning)/planning/procurement/_components/FocusMode.tsx` — A12
  DoneSummary link to created orders.
- `src/app/(planning)/planning/purchase-session/_lib/api.ts` — PC02 optional
  supersede flag on the start mutation (forward-compatible).
- `src/app/(planning)/planning/purchase-calendar/page.tsx` — A14 redirect target
  becomes /planning/procurement?view=calendar.
- `src/app/(planning)/planning/production-simulation/_components/SimulationModeShell.tsx`
  — A10 mode lifted into ?mode= searchParam.
- `src/app/(planning)/planning/production-simulation/_components/date-range/DateRangePlanShell.tsx`
  — A10 date range lifted into ?from=/?to= searchParams.
- `src/app/(planning)/planning/production-simulation/_components/SimulationResults.tsx`
  — A10 shortage CTA → /planning/procurement (+ secondary /purchase-orders/new).
- `src/app/(planning)/planning/production-simulation/_components/date-range/MaterialRequirementsResults.tsx`
  — A10 shortage CTA → /planning/procurement (+ secondary /purchase-orders/new).
- `src/features/dashboard/quick-actions.ts` — A3 Procurement tile added; runs tile
  blurb relabelled as diagnostics.
- `src/components/purchase-orders/types.ts` — N01 pure draft-summary helper.
- `src/components/purchase-orders/po-draft-summary.test.ts` — NEW unit test (N01).
- `src/app/(planning)/planning/forecast/_lib/staleness.test.ts` — NEW unit test (F01).
- READ ONLY (R04 verification): `src/app/(ops)/stock/receipts/_components/ReceiptLandingPicker.tsx`,
  `POLedgerHeader.tsx`, `POLineMatchCard.tsx` — confirmed free of Hebrew UI copy;
  no change.

## Checklist
### Group A — cache invalidation trust (P1)
- [ ] FLOW-A1 GR submit success invalidates PO/GR/planner/inventory-flow prefixes
- [ ] FLOW-A2 manual PO create success invalidates planner/PO/open-PO lists
- [ ] FLOW-A6 convert-to-PO success invalidates the PO-list keys
- [ ] FLOW-A7 run-trigger / forecast publish / firm-week invalidate ["planning","overview"]
- [ ] FLOW-A8 forecast key roots unified on plural "forecasts"
- [ ] FLOW-A9 firm-week also invalidates ["cadence","firmed-week-demand"]
### Group B — chain bridges (P1/P2)
- [ ] FLOW-A4 post-publish bridge CTA → /planning/meeting; quiet runs diagnostics link
- [ ] FLOW-A5 firm-success banner gains "Open Sunday procurement →" CTA
- [ ] FLOW-A3 "From recommendation" → /planning/procurement; Procurement quick-action tile; runs tile = diagnostics
- [ ] FLOW-A12 FocusMode DoneSummary link "צפייה בהזמנות שנוצרו ←" → /purchase-orders?status=OPEN
- [ ] FLOW-A10 simulation shortage CTAs → procurement (+ manual PO); mode + date-range in URL
- [ ] FLOW-A14 ?view=calendar on /planning/procurement; purchase-calendar redirect targets it
### Group C — procurement surface flow quality (P0/P1, Hebrew)
- [ ] FLOW-PC02 inline supersede confirmation replaces window.confirm; sends supersede:true
- [ ] FLOW-PC03 dismissible session-start success banner above SessionView
- [ ] FLOW-PC04 quiet "היסטוריית הזמנות ←" link near the summary strip
### Group D — forecast list (P1)
- [ ] FLOW-F01 staleness banner (none / covered / elapsed), gated on loaded data
- [ ] FLOW-F03 ForecastRow: pencil only for drafts, eye only for published/archived
### Group E — PO surfaces (P1/P2)
- [ ] FLOW-PO01 "Order updated." success feedback after notes/expected-date save
- [ ] FLOW-PO02 source_run_id / source_recommendation_id → human labels
- [ ] FLOW-PO03 header drops · supplier_id suffix when supplier_name exists
- [ ] FLOW-N01 reactive read-only summary card between line editor and submit
- [ ] FLOW-N02 success state shows po_number when the response carries it
- [ ] FLOW-N03 manual-PO description copy extended (urgent/exceptional only)
- [ ] FLOW-A13 PO list mirrors q= and late=1 in the URL, restoring on load
### Group F — receipts (P1)
- [ ] FLOW-R01 over-receipt two-step submit with amber inline confirmation zone
- [ ] FLOW-R03 manual receipt success links: movement log + submissions
- [ ] FLOW-R04 receipts _components verified English-only (no change needed)

## Verification gates
- `npm run typecheck` · `npm run lint` · `npm run test` (vitest) — all green before
  each commit. Baseline (pre-change): tsc 0 errors · eslint 0 errors (269 pre-existing
  warnings) · vitest 622/622 (78 files). Zero new failures allowed.
- Playwright not runnable in this environment — skipped per dispatch.
