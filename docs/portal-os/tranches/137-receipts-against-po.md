# Tranche 137 — receipts-against-po: door mode for Dennis

**Status:** implemented (pending merge)
**Origin:** mapping v3 decision **Q10 (Tom, 2026-07-22)** — goods receipt is entered by Dennis, at the door, in the system form ("בחירת PO → שורות מולאו מראש → מזין כמויות בפועל → פער מסומן"), or a manual receipt when no PO exists. English UI per policy (`/stock/receipts` is not on the CLAUDE.md Hebrew whitelist).
**Promoted from:** `docs/portal-os/tranches/137-receipts-against-po.DRAFT.md` (2026-07-22 lean-nav audit session). Renumbering not needed — 137 was still free at execution time.
**Scope:** one tranche, `/stock/receipts` operator-fit + short-receipt presentation only. No backend/API change (`open_qty` math is already server-truth). No lattice/middleware change.

## Ponytail read on scope (declared up front)

Most of the PO-receiving machinery already existed (landing picker, PO prefill, express full-receive, over-receipt two-step confirm, idempotency) from tranches 013/020/065/086/094. This tranche closes exactly the gap the DRAFT's "Current state" audit identified — operator-fit presentation and the missing symmetric half of the over-receipt UX — and nothing else:

1. **Dennis access (scope item 1)** — no code change. The `(ops)` layout's `RoleGate minimum="stock:execute"` already admits `operator`; verified via `setFakeRole(page, "operator")` e2e, not a lattice edit (lattice is Tom-locked per `CLAUDE.md`). Provisioning Dennis's real Supabase user is an admin/Tom action outside portal-code scope (tranche doc's own Dependencies section flags this).
2. **Express-receive guard (scope item 4)** — verified, not built. Tranche 086's confirm banner ("All N open lines are set to the full open quantity. Post to receive in full, or review the lines first." + a "Confirm & receive all" tap) already names totals before posting — it is not one-tap-blind. No code change; this is exactly the "does an existing pattern already cover it" case.

The two items below are the real diff.

## What changed

### Door mode (scope item 2)

- `ReceiptLandingPicker.tsx`: the "Receive without a PO" CTA is now `btn-outline` instead of `btn-primary` — manual entry stays reachable (same position, same copy) but reads as secondary to "Expected today & this week", which already led the card order.
- `POLedgerHeader.tsx`: new optional `collapseProgressByDefault` prop. When true (wired from `session.role === "operator"` in `page.tsx`), the progress row (lines-fully-received / qty% — planner-depth detail) starts behind one disclosure toggle ("Show progress" / "Hide progress", `aria-expanded`) instead of always-open. The section is never removed, only collapsed by default, per the tranche doc's OQ-3 default. Planner/admin views are unchanged (prop defaults `false`).
- `page.tsx`: the per-line "Remove" button touch target bumped from `btn-sm` (28px) to an explicit 44px square, matching the existing qty-stepper precedent (`h-12 w-12`) already in the file.

### Short-receipt visibility (scope item 3)

Symmetric counterpart to the existing over-receipt exception UX (tranche 020/065), which had a two-step confirm, a summary badge, and a per-line danger callout — a short receipt (received < `open_qty`) had none of that, only the neutral "Left" pill on `POLineMatchCard`.

- `types.ts`: new pure `computeShortReceiptLines(lines, poLines)` helper (mirrors the existing `expectedBucketLabel` pattern) — a matched line posting less than the remaining `open_qty` is "short"; exact-match and over-receipt are excluded (over-receipt keeps its own, separate, louder gate).
- `page.tsx`: pre-submit — a neutral (not danger) "N short" badge in the sticky-bar summary, plus a summary block: *"Short vs ordered: N \<unit\> — PO stays open for the rest."* per line, before the operator taps submit. No extra confirm tap required (a short receipt is expected/allowed, unlike over-receipt).
- `page.tsx`: success panel — the same delta line renders per posted line (`postedLineDetails[].shortBy`), so the operator sees it again after posting, not just before.
- English copy only, per the CLAUDE.md Hebrew whitelist (this route is not on it).

## Manifest / files touched

- `src/app/(ops)/stock/receipts/page.tsx`
- `src/app/(ops)/stock/receipts/_components/ReceiptLandingPicker.tsx`
- `src/app/(ops)/stock/receipts/_components/ReceiptLandingPicker.test.tsx` (new: door-mode default-bucket + manual-demotion tests)
- `src/app/(ops)/stock/receipts/_components/POLedgerHeader.tsx`
- `src/app/(ops)/stock/receipts/_components/types.ts` (new: `computeShortReceiptLines`)
- `tests/unit/stock/receipts-short-receipt.test.ts` (new: short-receipt summary builder, 7 cases)
- `tests/e2e/receipts-door-mode.spec.ts` (new, `@mocked`, chromium)
- `tests/e2e/mobile-receipts-door-mode.spec.ts` (new, mobile-safari iPhone-14 screenshot pass — untagged, matches the existing `mobile-operator-forms-smoke` / `mobile-input-zoom` precedent so it stays out of the chromium-only CI `--grep @mocked` gate)
- `docs/portal-os/tranches/137-receipts-against-po.md` (this doc), `docs/portal-os/registry.md`, `docs/portal-os/scorecard.json`, `docs/portal-os/scorecard.md`, `docs/portal-os/tranches/_active.txt`

Not touched: `POLineMatchCard.tsx` (its existing "Left" pill + progress bar already degrade gracefully for a short line; the new pre-submit summary and success delta live in `page.tsx`/`types.ts` instead of adding a second in-card callout — smaller diff, same visibility outcome).

## Deviations from the DRAFT

- **Scorecard category.** The DRAFT's `scorecard_target_category: operator_daily_fit` does not exist in the current 10-category `scorecard.json` rubric (never introduced by a `/portal-scorecard` recompute). Credited the `expected_delta: +1` under `ops_surface` instead — the real category already carrying the tranche-013 receipt-PO-linkage entry this tranche builds on. See the 2026-07-23 `scorecard.json` `_notes` entry.
- **Express-receive guard (scope item 4) and Dennis access (scope item 1)** — verified as already satisfied, no code change (see "Ponytail read on scope" above), rather than adding a redundant confirm step or lattice edit.

## Evidence

- `npx tsc --noEmit` → clean (0 errors).
- `npx eslint .` → 0 errors (pre-existing warnings elsewhere in the repo, unrelated to this diff, unchanged).
- `npx vitest run` → **944/944 pass** (baseline 935 + 9 new: 7 in `receipts-short-receipt.test.ts`, 2 in `ReceiptLandingPicker.test.tsx`).
- `npx playwright test --grep @mocked` (chromium, dev-shim auth) → **25/25 pass** (baseline 23 + 2 new in `receipts-door-mode.spec.ts`): operator picks an "expected today" PO, edits one line short, sees the pre-submit short-marking, submits, sees the success-panel delta, PO stays `OPEN` (not `RECEIVED`); manual track still reachable from the picker.
- `npx playwright test tests/e2e/mobile-receipts-door-mode.spec.ts --project=mobile-safari` (iPhone-14, webkit) → **1/1 pass**; screenshots captured of the landing picker (door-mode card order, demoted manual CTA) and the PO track with the collapsed progress disclosure + pre-submit short-receipt summary.
- regression-sentinel: no baseline drift (no route/nav/quarantine changes; presentation-only diff inside the existing `/stock/receipts` manifest row).

## Rollback

Revert the PR. Presentation + flow-order changes only inside one page + its `_components`; the `GoodsReceiptRequest` contract, ledger semantics, and PO-line `open_qty` math are all untouched — revert is clean.
