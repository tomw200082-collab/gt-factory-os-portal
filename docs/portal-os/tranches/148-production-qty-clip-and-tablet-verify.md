# Tranche 148 — production qty-clip fix + tablet verification pass

status: verified
created: 2026-07-25
scorecard_target_category: ops_surface
expected_delta: +0 — hardening on an already-Gate-5'd corridor (tranches 145/146), not new capability. See scorecard.json `_notes`.
sizing: S

## Why this tranche

Tom reported live, in Hebrew, while using `/production` ("today's runs"): "sometimes the numbers get cut off" while collecting raw materials and packaging. Root-caused to `PickRow.tsx`'s tap-to-edit quantity button: a fixed `w-24`/`sm:w-28` box holding the quantity at `text-3xl`/`text-4xl` bold monospace, inside a row with `overflow-hidden`. `fmtNumStr()` — the shared quantity formatter used app-wide — only stripped trailing zeros; it did not enforce its own documented "never more than 4 decimal places" rule, so a `numeric(24,8)` value with genuine precision beyond 4dp (e.g. a computed BOM requirement) rendered at full length and silently clipped. Large integer quantities could hit the same box from the other direction.

Separately, Tom's earlier ask this session ("make sure today's runs works perfectly on tablet, not just mobile") found that `/production`'s Gate 5 pass (tranches 145/146) only captured real screenshots at 390/1440 — never at 768px, the exact mobile→desktop Tailwind breakpoint where responsive layout is most likely to break. Same gap existed on `/home` (tranche 136) and `/stock/receipts` (tranche 137), both verified at 390px only.

## Scope

- Fix `fmtNumStr()` to round to ≤4 decimal places (its own documented hard rule) before stripping trailing zeros — a one-function fix that propagates to all 36 call sites app-wide.
- `PickRow.tsx`: number button `w-24 sm:w-28` (fixed) → `min-w-24 sm:min-w-28` (flexible) so a legitimately long value grows the box instead of clipping.
- `EditQtySheet.tsx`: split the truncating single-line "name · Need X · On-hand Y" into two lines, so a long item name can't swallow the trailing numbers via CSS `truncate`.
- New regression test (`production-picking.spec.ts`) proving an unrounded 8dp value renders capped and un-clipped, with a bounding-box assertion.
- New `format-quantity.test.ts` (none existed) covering the rounding fix and existing stripping behavior.
- New tablet Playwright project (`playwright.config.ts`) + three `tablet-*.spec.ts` screenshot specs (production, home Today board, receipts door mode), mirroring the existing `mobile-*.spec.ts` convention at 768px (iPad Mini) instead of 390px.
- Fixed a pre-existing, independently-discovered bug: `mobile-operator-forms-smoke.spec.ts` targeted dead `/ops/stock/...` URLs (404) instead of the real `/stock/...` routes for all 4 operator forms — invisible until now because it requires WebKit (not tagged `@mocked`, excluded from the chromium-only CI gate), and WebKit isn't installed in this sandbox either. Confirmed live via curl (`/ops/stock/physical-count` → 404, `/stock/physical-count` → 200) and re-verified the fixed URLs render their expected headings.

## Manifest (files touched)

- `src/lib/utils/format-quantity.ts`
- `src/lib/utils/format-quantity.test.ts` (new)
- `src/app/(production)/production/runs/[run_id]/_components/PickRow.tsx`
- `src/app/(production)/production/runs/[run_id]/_components/EditQtySheet.tsx`
- `tests/e2e/production-picking.spec.ts` (+1 test)
- `tests/e2e/mobile-operator-forms-smoke.spec.ts` (URL fix)
- `playwright.config.ts` (+tablet project)
- `tests/e2e/tablet-production.spec.ts` (new)
- `tests/e2e/tablet-home-today-board.spec.ts` (new)
- `tests/e2e/tablet-receipts-door-mode.spec.ts` (new)

## Out-of-scope

- `/stock/physical-count` + `/inventory/bulk-count` (Maxim's + Dennis's counting surfaces) — under a separate 5-lens audit in progress; findings land as tranche 149, not folded in here to keep this tranche a clean, immediately-shippable bounded fix.
- globals.css / tailwind.config.ts / design-token edits.
- Backend contracts, schema, migrations.

## Tests / verification

- `npx tsc --noEmit` → 0 errors.
- `npx eslint .` → 0 errors, 281 warnings (unchanged baseline).
- `npx vitest run` → 130 files / 1089 tests, all green (was 129/1063 before this tranche — +1 file, +26 tests: format-quantity.test.ts is new).
- `npx playwright test tests/e2e/production-picking.spec.ts --project=chromium` → 13/13 green, including the new long-precision-qty regression test.
- Live-rendered evidence (WebKit unavailable in this sandbox — only Chromium is pre-installed; drove Chromium directly at the target viewports instead of the `mobile-safari`/`tablet` Playwright projects, which are WebKit-based for parity with real iOS Safari when run in an environment that has WebKit installed): screenshots + `document.documentElement.scrollWidth`/`clientWidth` checks at 390px and 768px for `/production` (runs list + pick list + edit sheet with a deliberately long-decimal and large-integer quantity), `/home` (Today board), and `/stock/receipts` (landing + PO track). No horizontal scroll on any surface at either width; the qty number box measured 157px wide (grew from its 96px floor) to fully contain "144000.5 L Change" instead of clipping it.
- Fixed-URL smoke check: all 4 operator-forms routes (`/stock/waste-adjustments`, `/stock/physical-count`, `/stock/production-actual`, `/stock/receipts`) confirmed 200 + correct heading via a direct Chromium check.

## Exit evidence

- All checks above green. Screenshots retained in the session scratchpad (not committed — matches existing `mobile-*.spec.ts` precedent of screenshots living in `test-results/`, gitignored).
- `tablet-*.spec.ts` files are WebKit-only (same as `mobile-*.spec.ts`) and were not executable end-to-end in this sandbox; their assertions and route-mocks were validated by running equivalent logic through Chromium directly (see above). They will run for real under `--project=tablet` in any environment with WebKit installed, exactly like the pre-existing `mobile-*.spec.ts` files.

## Rollback

Revert the commit. All changes are component-level prop/class/formatting-function edits plus new/fixed test files; no data-layer, route, or backend change. Clean revert.

## Operator approval

- [x] Tom reported the bug directly in chat (2026-07-25) and asked for tablet verification in the same session; this tranche is the direct response. Autonomous merge/deploy per the 2026-06-20 / 2026-07-24 written grants in `gt-factory-os-production-brain/CLAUDE.md`.

## Actual evidence (build run 2026-07-25)

See "Tests / verification" above — all commands run and their output captured in this session; no evidence is a projection.
