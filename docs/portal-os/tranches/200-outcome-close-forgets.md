# Tranche 200 — Closing "what happened?" forgets the call

**Status:** in progress on `claude/outcome-dismiss-forgets`.
**Origin:** Tom, 2026-10-02. After tapping a lead's call or WhatsApp button, the "what happened?" sheet came back on every return to the app. Closing it with X did not stop it, even after leaving the app and coming back. He asked that X forget the action, so the sheet does not open again by itself. He confirmed this reading ("נכון. תתקן את זה").

## Before

`useOutcomeCapture.dismiss` only hid the sheet. The call stayed armed in `sessionStorage` (`gt.sales.outreach`), and the next real return to the app raised the sheet again until an answer was given. This was a deliberate queue-discipline rule, not a recorded doctrine decision.

## Change

- Closing the sheet clears the armed call, the same as answering it, but records nothing.
  - The sheet does not come back on a return or a reload.
  - A new call or WhatsApp tap asks again.
  - The lead stays in the queue, because nothing was answered.
- The `dismissedRef` focus guard is gone. With nothing armed, an ordinary focus has nothing to raise.

## Manifest

manifest:
  - docs/portal-os/tranches/200-outcome-close-forgets.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md
  - src/app/(sales)/_lib/useOutcomeCapture.ts
  - tests/unit/sales/use-outcome-capture.test.tsx
  - tests/e2e/sales-today.spec.ts

## Gates

- Red-first unit tests, covering three cases:
  - closing forgets the call across a return;
  - closing forgets it across a reload;
  - a new call asks again.
- vitest, typecheck, lint, and the sales e2e specs.

## Rollback

Revert the merge commit.
