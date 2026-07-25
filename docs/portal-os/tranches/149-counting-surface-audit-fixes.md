# Tranche 149 — physical-count + bulk-count: mobile/tablet audit fixes

status: verified
created: 2026-07-25
scorecard_target_category: ops_surface
expected_delta: +0 — see rationale below (real category is at ceiling for portal-only scope; the remaining gap is backend-blocked).
sizing: L

## Why this tranche

Tom's ask ("make sure everything is super clear, beautiful, amazing UX for Denis and Maxim before tomorrow's team briefing") plus `ACTIVE_NOW.md`'s own record that Denis (RM/PKG, Thursday) and Maxim (finished goods, Thursday 8:00) both depend on physical counting — surfaced that `/stock/physical-count` and `/inventory/bulk-count` had never had a dedicated mobile/tablet UX pass (last touch was tranche 025, well before this project's mobile-first push, and neither had e2e screenshot coverage of any kind before this tranche). Dispatched a full 5-lens audit (interaction, accessibility, visual, flow, content) against both pages. This tranche fixes every P0 and the highest-value P1s; the rest is a documented backlog below.

## What shipped

**P0 — data integrity:**
- **FLOW-015**: `bulk-count`'s `submitRow` generated a fresh idempotency key on every call instead of reusing one across retries (the single-item form already did this correctly). A network drop after the server had processed the POST, followed by a retry, could post a second count against the same item. Fixed: `CountRow` now owns a stable `idemKeyRef`, generated lazily and reused across retries, cleared only when a genuinely new count attempt begins (fresh row or after a rejection triggers a recount) — mirrors `/stock/physical-count`'s existing `idemKeyRef` pattern exactly.

**P0 — locked-decision compliance:**
- **COPY-005**: `bulk-count` section headers rendered Hebrew (`groupLabel()`'s Hebrew-first default, via the shared `src/lib/taxonomy/groups.ts`) even though `/inventory/bulk-count` is not on the Hebrew whitelist in `gt-factory-os-portal/CLAUDE.md`. Fixed by adding an optional `preferEnglish` parameter to `groupLabel()`/`groupKeyLabel()` (default `false`, so every existing Hebrew-whitelisted call site is untouched) and wiring `bulk-count`'s `sectionLabel` to pass `true`. Live-verified: section headers now render "Cocktails" / "Syrups & Alcohol" instead of the Hebrew group names.
- **COPY-001–004**: developer/internal jargon and raw error strings removed from operator-facing copy on both pages — "Opening snapshot…" → "Starting count…", "Cancel snapshot" → "Cancel this count", "Large variance vs the snapshot" / "new anchor" → plain English, raw `{(err as Error).message}` (which could leak strings like `STOCK_FETCH_404`) replaced with a static actionable sentence on both pages' load-error states.

**P1 — touch targets (portal_ux_standard.md §7, ≥32px floor):**
- physical-count: every `btn-sm` (28px) promoted to `btn` (36px) — clear-search button widened to `h-9 w-9`; cancel-confirm pair, "Cancel this count", and all result-banner action buttons.
- bulk-count: Recount, Confirm 0 / Change (zero-guard pair), type-tab filter buttons (`py-1.5`→`py-2`, +`min-h-[32px]`), "Clear all filters" (was ~16px, now ≥32px with padding).

**P1 — real bugs, not just polish:**
- **VISUAL-001/002**: sticky bottom action bar on physical-count and sticky top progress header on bulk-count had no `env(safe-area-inset-*)` — on notched iPhones the Submit button could sit partially behind the home-indicator gesture area, and the bulk-count header could underflow the TopBar. Both now use the same safe-area formula already established in `globals.css`'s `.filter-bar-sticky`.
- **INTER-002**: physical-count's qty-validation error only rendered in the top-page result banner — off-screen on mobile once scrolled to the hero input. Now also shown inline, directly under the qty input.
- **INTER-005**: physical-count's adjustment-delta chip could show a raw 8dp string ("+5.00000000"). Now formatted via a new `fmtSignedDelta()` helper (preserves the +/- sign that a bare `fmtNumStr()` would have discarded via `Number()` parsing).
- **FLOW-001**: a `SNAPSHOT_EXPIRED`/`SNAPSHOT_NOT_FOUND`/`SNAPSHOT_OWNER_MISMATCH` error showed a "Try again" button that would always re-fail (retrying against the same dead snapshot). Now classified as terminal and shows "Start count again", which opens a fresh snapshot instead of resubmitting.
- **FLOW-003**: the 60-minute snapshot expiry (contract §2.1) had no warning. The snapshot pill now escalates to amber at 45 minutes elapsed and red at 55, showing "Expires in ~Nm".

**P1/P2 — accessibility:**
- A11Y-003: cancel-confirm `alertdialog` gained `aria-modal`, `aria-labelledby`, a focus trap (Tab/Shift-Tab cycles the two buttons only), and Escape-to-dismiss.
- A11Y-004: search result-count live region was conditionally mounted (misses the first-keystroke announcement in most screen readers) — now an always-mounted `sr-only` region, matching the pattern tranche 145 already established for `UnplannedRunDialog`.
- A11Y-005/A11Y-008: load-error (physical-count) and rejected-count note (bulk-count) gained `role="alert"`.
- A11Y-007: physical-count's "Advanced" disclosure toggle gained `aria-expanded`/`aria-controls`.
- A11Y-009: bulk-count's "Recount" button gained an item-specific `aria-label` (previously every row's button read identically to a screen reader).
- A11Y-006: bulk-count's type-tab filters were marked up as `role="tab"`/`role="tablist"` (which requires arrow-key navigation) but behaved like plain Tab-reachable buttons. Simplified to `aria-pressed` toggle buttons — the correct, simpler pattern for this interaction, not a partial ARIA-tab implementation.

**P2 — visual/content polish:**
- VISUAL-004: off-scale `text-5xl`/`text-6xl` (outside the Operational Precision type scale) on the physical-count qty input → `text-4xl`, matching the hero-number size already established on `/production`'s PickRow/ReportForm.
- VISUAL-005: both pages' blind-count banners moved from neutral tone to the portal_ux_standard §9 info-banner convention (`border-info/40 bg-info-softer`).
- INTER-007/A11Y-014: emoji/Unicode used as functional icons (⏳ pending badge, ⌕ search icon, ∅ never-counted chip) replaced with SVG icons or plain text, matching the rest of the app's SVG-only icon convention.
- COPY-006–013: further jargon sweep ("masters"→"items", "picker"→description text, "Stale"→"Not moved Nd+ days", "stock balance anchor"→"stock balance", "local tick"/"Tick marks"→"checkmark"/"Checkmarks", raw network-error message dropped in bulk-count row errors, empty-state CTA text).
- FLOW-023: each count surface now cross-links to the other ("Counting many items at once? Use Bulk Count →" / "Counting one specific item? Use the single-item count form →").
- INTER-008: qty stepper buttons on physical-count now round through `fmtNumStr()` (fixes a float-artifact edge case on fractional base quantities, e.g. `0.7 + 1` → `1.7000000000000002` unrounded).

## Deferred (documented backlog, not blocking)

Fully speced by the audit, intentionally not rushed today:

- **A11Y-001/002** (M effort): physical-count's search combobox has no keyboard arrow-key navigation and its dropdown options are `<button>` elements instead of `role="option"` — blocks keyboard-only and screen-reader users from Step 1 entirely. Deferred because Denis and Maxim are touch-only phone/tablet users (not the population this blocks) and it's a genuinely bigger, riskier change to rush same-day; the audit already specs the exact fix (stable `activeIndex` state, `aria-activedescendant`, `ArrowDown`/`ArrowUp`/`Enter`/`Escape` handling, option buttons → `role="option"` divs).
- **FLOW-007** (M): no "resume in-progress count" affordance if the operator navigates away mid-count on physical-count (the server-side snapshot survives 60 min; the client state doesn't). Spec: `sessionStorage` + a "Resume count" banner on mount.
- **FLOW-008** (M): dismissing the pending-approval banner on physical-count loses the only visible link to that submission; bulk-count's pending badge isn't a link. Spec: an in-memory pending-submissions list / make the badge a link to `/inbox`.
- **FLOW-019** (L, ARCH_REQUIRED): bulk-count has no "requires count before plan locks" signal from the planning engine — `BulkStockRow` has no such field. Portal-side filter chip is trivial once the backend field exists; this needs a `backend-db-executor` change, escalated to `factory-os-governor` rather than attempted here.
- **FLOW-024** (S, deferred for risk/time, not effort): auto-collapse a bulk-count section the moment its last row is counted. Straightforward but touches render-loop state; skipped today to keep the diff reviewable under time pressure.
- **A11Y-012**: physical-count's selected-item chip truncates the label on mobile instead of wrapping (§7) — real layout-redesign implications for a compact single-line chip, not a one-line fix.
- **A11Y-010**: bulk-count section-expand buttons have `aria-expanded` but no `aria-controls`.

## Manifest (files touched)

- `src/app/(ops)/stock/physical-count/page.tsx`
- `src/app/(ops)/inventory/bulk-count/page.tsx`
- `src/lib/taxonomy/groups.ts`

## Out-of-scope

- FLOW-019 (backend field) — escalated, not attempted.
- globals.css / tailwind.config.ts / design-token edits.
- Any change to the physical-count API contract or backend.

## Tests / verification

- `npx tsc --noEmit` → 0 errors.
- `npx eslint .` → 0 errors, 281 warnings (unchanged baseline; one `react/no-unescaped-entities` introduced and fixed during this tranche).
- `npx vitest run` → 130 files / 1089 tests, all green (no count change — no new unit-test files this tranche; existing suites cover neither page directly, which is itself part of why the audit found what it found).
- Live Chromium verification (WebKit unavailable in this sandbox) at 390px and 768px, both pages, with mocked `/api/items`, `/api/components`, `/api/groups`, `/api/stock`: zero JS console/page errors across all 4 page loads; bulk-count section headers confirmed rendering English ("Cocktails", "Syrups & Alcohol") not Hebrew; screenshots visually inspected — info-tone blind-count banners, cross-links, English section labels, no clipping, no horizontal scroll at either width.

## Exit evidence

All checks above green. Screenshots retained in the session scratchpad (gitignored `test-results/` convention, not committed).

## Rollback

Revert the commit. All changes are component-level prop/class/copy/state edits plus the additive (default-`false`) `preferEnglish` parameter on two shared `groups.ts` functions — no existing call site's behavior changes. No data-layer, route, or backend change. Clean revert.

## Operator approval

- [x] Direct response to Tom's request this session ("make sure everything is clear, beautiful, amazing UX for Denis and Maxim" ahead of tomorrow's briefing) plus the explicit factory-mapping record that both named operators depend on these two pages. Autonomous merge/deploy per the 2026-06-20 / 2026-07-24 written grants in `gt-factory-os-production-brain/CLAUDE.md`.

## Actual evidence (build run 2026-07-25)

See "Tests / verification" above — all commands run and their output captured in this session; no evidence is a projection.
