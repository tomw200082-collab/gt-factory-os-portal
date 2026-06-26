# Tranche 094: stock-form idempotency-key lifecycle (double-post fix)

status: in-progress
created: 2026-06-25
scorecard_target_category: ops_surface / data_truthfulness (stock truth)
expected_delta: 0 (correctness — closes a duplicate-ledger-event risk)
sizing: S (3 operator forms + 1 guard test; no backend)
source: /portal-audit interaction-design-specialist (2026-06-25), finding INTER-002

## Why (the bug)
All three operator stock forms generated the idempotency key **inline in the
submit envelope** (`idempotency_key: newIdempotencyKey()`), so every submit —
including a retry — carried a NEW key. That defeats the key's entire purpose: if
the first POST reached the backend (wrote the ledger event) but the response was
lost (network timeout on the response), the operator's retry posts a SECOND
ledger event with a fresh key. For goods-receipt / waste / physical-count that is
a **duplicate stock movement** — a stock-truth violation, the system's most
sacred invariant.

Verified inline at:
- `receipts/page.tsx:824`
- `waste-adjustments/page.tsx:298`
- `physical-count/page.tsx:495`
(physical-count's CANCEL call at :599 correctly mints its own per-cancel key — a
distinct operation — and is left as-is.)

## The fix
Each form now holds the submit key in a `idemKeyRef = useRef<string | null>(null)`:
- lazily generated on the first submit (`if (!idemKeyRef.current) idemKeyRef.current = newIdempotencyKey()`),
- **reused on every retry** (error paths do NOT clear it), so a retry after a lost
  response replays the same key → the backend returns `idempotent_replay` instead
  of double-posting,
- cleared on a **successful post** and on an **explicit reset/cancel**, so the next
  logical operation gets a fresh key (receipts: success reset + Reset/Pick-again;
  waste: success branches + handleReset; physical-count: resetFlow()).

This is the standard idempotency-key lifecycle; it is what `newIdempotencyKey()`
was always meant to support.

## Scope (manifest)
manifest:
  - src/app/(ops)/stock/receipts/page.tsx
  - src/app/(ops)/stock/waste-adjustments/page.tsx
  - src/app/(ops)/stock/physical-count/page.tsx
  - tests/unit/stock/idempotency-key-lifecycle.guard.test.ts
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/094-idempotency-key-lifecycle.md
  - docs/portal-os/tranches/_active.txt

## §V (invariant)
Guard test `tests/unit/stock/idempotency-key-lifecycle.guard.test.ts`: each form
contains `idemKeyRef` and NOT the inline `idempotency_key: newIdempotencyKey()`
envelope pattern.

## Verification
- tsc 0 · eslint 0 · vitest 787→790 (787 held + 3 guard cases)
- Behavior held for all tested paths (no existing test broke); the change is
  transparent to a single successful submit and only alters the retry/replay key.
- Manual trace: submit→(response lost)→retry now replays the same key; submit→
  success→new receipt issues a fresh key; reset issues a fresh key.

## Triage of the rest of the INTER-* audit (not in this tranche)
The same audit raised 11 other findings. Disposition:
- **INTER-001 / INTER-007** (mandatory confirm panel before goods-receipt /
  physical-count submit) — HELD FOR TOM: adds friction to the core daily flow;
  Tom owns that UX tradeoff (waste already has one per T041).
- **INTER-004, INTER-008, INTER-011, INTER-012, INTER-005, INTER-003, INTER-006**
  (spinners, retry buttons, button styling, reset confirms, stepper disable) —
  bounded UI polish, candidate for a follow-up tranche.
- **INTER-009** (per-line inline validation errors) — L effort, follow-up.
- **INTER-010** (roving focus on reason chips) — keyboard-flow, follow-up (reuse
  `useRovingTabList`).

## Checklist
- [x] receipts · waste · physical-count key lifecycle · §V guard · behavior held
- [ ] Tom review / merge · decide INTER-001/007 confirm panels
