# Tranche 031: procurement-focus-hardening

status: landed-pending-review
created: 2026-05-29
activated: 2026-05-29
landed: 2026-05-29
scorecard_target_category: flow_continuity
expected_delta: +0 on flow_continuity (hardening — robustness/a11y/mobile, no new surface)
sizing: S  (≤4 files)

## Why this tranche
End-to-end verification pass of the procurement focus mode (027–030, now on
main) surfaced four real robustness/UX gaps. This tranche fixes them — no new
surface, just making the shipped flow strong on mobile, accessible, and honest
at the edges.

## Scope (findings → fixes)
1. **Mobile overflow** — FocusCard's lines table can overflow a narrow card.
   Wrap it in `overflow-x-auto`.
2. **Dialog accessibility** — FocusMode has no initial focus or focus
   containment. Add initial focus to the dialog and a lightweight Tab focus-trap
   so keyboard/SR users stay within the overlay.
3. **Mobile footer** — the keyboard hint crowds narrow screens; hide it below
   `sm`.
4. **Honest completion** — reaching the end via manual "next" while orders are
   still open showed the celebratory "done" screen. Make DoneSummary
   remaining-aware: when work is left, show a neutral "N still open" state with a
   "continue to remaining" action (jumps to the next unresolved order); keep the
   celebration only when everything is genuinely placed/skipped. Backed by a new
   pure `remainingCount` helper + unit test.

## Manifest (files that may be touched)
manifest:
  - src/app/(planning)/planning/procurement/_components/FocusMode.tsx
  - src/app/(planning)/planning/procurement/_components/FocusCard.tsx
  - src/app/(planning)/planning/procurement/_lib/focus-queue.ts
  - src/app/(planning)/planning/procurement/_lib/focus-queue.test.ts

## Revive directives (if any)
revive: []

## Out-of-scope
- New procurement features; backend changes; the classic session/calendar pages.

## Tests / verification
- typecheck clean.
- vitest: focus-queue.test.ts incl. new `remainingCount` cases.
- production build clean.
- regression-sentinel: additive hardening, no surface/route change.

## Exit evidence
- production build pass + vitest pass count.
- PR link + scorecard (no delta; declared).

## Rollback
Revert the PR; all changes are local to the focus overlay/card + one pure
helper.

## Operator approval
- [ ] Tom approves (comment `@claude /portal-tranche-fix 031`)

## Actual evidence (filled in by /portal-tranche-fix run)

Executed 2026-05-29 on branch `claude/procurement-forecast-review-Bv31m` as a
20-iteration end-to-end verification + fix pass on the merged epic.

**Verification iterations (highlights):**
- Production `next build` → clean (117 static pages; /planning/procurement
  16.5 kB, /purchase-orders/new builds; classic /planning/purchase-session still
  builds).
- typecheck → exit 0.
- full vitest → 317 passed (was 316; +1 remainingCount); 35 pre-existing
  unrelated failures unchanged.
- hygiene scan of all new procurement + shared files → no console/debugger/
  TODO/FIXME/`any`.
- nav URL guard → only the 4 PRE-EXISTING dashboard import leaks; procurement
  files clean.
- a11y spot-check → icon-only controls carry aria-labels.

**Fixes delivered:**
1. FocusCard lines table wrapped in `overflow-x-auto` (+ `min-w-[28rem]`) — no
   more clipping on narrow screens.
2. FocusMode: dialog `containerRef` + Tab focus-trap (Tab/Shift-Tab wrap within
   the overlay); keyboard hint hidden below `sm`.
3. Honest completion: `remainingCount` pure helper (+ unit test); DoneSummary is
   now remaining-aware — celebratory only when everything is placed/skipped,
   otherwise a neutral "N still open" with a "המשך לפתוחות" action that jumps to
   the next unresolved order.

**CI gate (`portal-pr-guard`)**: typecheck + registry presence — green.
**Scorecard delta:** +0 (declared hardening).
