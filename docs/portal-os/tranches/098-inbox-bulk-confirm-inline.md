# Tranche 098: inbox bulk-resolve inline confirm (replace window.confirm)

status: in-progress
created: 2026-06-26
scorecard_target_category: ops_surface / regression_resistance
expected_delta: 0 (robustness — destructive action confirm made reliable + testable)
sizing: S (1 file; no backend)
source: /portal-audit interaction-design-specialist INTER-003 (2026-06-26)

## Why
The `/inbox` bulk-resolve action (resolve N exceptions at once — destructive,
irreversible) gated on `window.confirm`. `window.confirm` returns `false`
silently in some embedded/mobile WebView contexts and under popup-blocking
policies, so the operator's confirm could be swallowed and the action silently
aborted; it also breaks the `jsdom` test environment, so the path could not be
unit-tested. Every other confirm on this surface is an inline UI element.

## The fix (no added friction — replaces an existing confirm)
Two-step inline confirm in `BulkActionBar`, matching the surface's own pattern:
- The "Resolve N" button now ARMS an inline confirm (`bulkConfirming` state)
  instead of calling `window.confirm`.
- The bar then shows "Resolve N? This cannot be undone." with **Cancel** and
  **Confirm — resolve N** buttons; the mutation fires only on Confirm.
- `⌘⏎` arms on the first press and confirms on the second.
- Arming resets on selection change, Clear, Cancel, and on mutation success.

## Scope (manifest)
manifest:
  - src/app/(inbox)/inbox/page.tsx
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/098-inbox-bulk-confirm-inline.md
  - docs/portal-os/tranches/_active.txt

## Landed
- `bulkConfirming` state + reset on toggle/clear.
- `onBulkResolve` → arm; new `onConfirmBulk` → the actual `bulkResolveMutation`.
- `BulkActionBar` gains `confirming` / `onConfirmBulk` / `onCancelBulkConfirm`
  props and renders the two-step confirm (testids: `inbox-bulk-confirm-prompt`,
  `-cancel`, `-proceed`).
- `⌘⏎` arms-then-confirms.
- No `window.confirm` call remains in the inbox page (the two grep hits are
  explanatory comments).

## Verification
- tsc 0 · eslint 0 · vitest 790/790 (no test depended on the removed
  window.confirm; the new inline path is now unit-testable for a follow-up test).

## Checklist
- [x] window.confirm removed · inline two-step confirm · ⌘⏎ wired · verified
- [ ] Tom review / merge (follow-up: a unit test for the inline confirm path)
