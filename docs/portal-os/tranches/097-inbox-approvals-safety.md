# Tranche 097: inbox/approvals safety fixes (audit INTER cluster)

status: in-progress
created: 2026-06-26
scorecard_target_category: ops_surface / data_truthfulness (approval correctness)
expected_delta: 0 (correctness/safety — no flow change)
sizing: S (3 files + 1 wiring; no backend)
source: /portal-audit interaction-design-specialist on inbox/approvals (2026-06-26)

## Why
The planner's inbox/approvals surface approves/rejects stock-affecting
submissions. The audit raised 8 findings; this tranche lands the three that are
clear correctness/safety fixes WITHOUT adding operator friction (the
confirm-ADDING findings INTER-001/002 are held with the stock-form confirm-panel
family for Tom).

## Landed (each verified against current code)
- **INTER-005** (P0 cache-coherence) — the inline approve/reject card
  (`ApprovalInlineCard`) showed a success chip but never invalidated the
  `["inbox", …]` queries, so the actioned row lingered until the 30s staleTime.
  Added an `onActionComplete` prop, threaded through `InboxRowCard` →
  `renderInboxRow` → `invalidateExceptions`, fired on any non-error outcome
  (approved/rejected/conflict). Same class as tranche 089.
- **INTER-006** (P0 safety) — on the waste + physical-count detail pages the
  Approve AND Reject buttons were enabled while `detailQuery` was still loading
  (`d` undefined → the self-approval guard short-circuited false), so a planner
  could approve/reject a submission whose facts they had not seen (the confirm
  zone would render placeholder values). Added `!d ||` to both buttons' disabled
  conditions on both pages. (The inventory-movement page already guarded this via
  its `isPending = !d` derivation.)
- **INTER-004** (P1 double-fire) — the keyboard `a` (acknowledge) shortcut called
  `ackMutation.mutate` without an `isPending` guard, so two fast keypresses fired
  two calls. Added `!ackMutation.isPending` to the handler condition.

## Scope (manifest)
manifest:
  - src/features/inbox/approval-inline-card.tsx
  - src/app/(inbox)/inbox/page.tsx
  - src/app/(inbox)/inbox/approvals/waste/[submission_id]/page.tsx
  - src/app/(inbox)/inbox/approvals/physical-count/[submission_id]/page.tsx
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/097-inbox-approvals-safety.md
  - docs/portal-os/tranches/_active.txt

## Held / deferred (from the same audit)
- **INTER-001 / INTER-002** — add a confirm step to detail-page Reject and to
  inline Approve. Restores the surface's own confirm pattern but adds a click;
  grouped with the stock-form confirm-panel family for Tom's UX decision.
- **INTER-003** — replace the bulk-resolve `window.confirm` with an inline confirm
  bar (M effort); follow-up.
- **INTER-007** (inline-card skeleton) + **INTER-008** ("recently dismissed" undo
  copy) — polish/copy; follow-up (copy item → ux-content-state-designer).

## Verification
- tsc 0 · eslint 0 · vitest 790/790 (no test broke; the wiring is additive and
  the disabled/guard changes don't affect the tested paths).

## Checklist
- [x] INTER-005 cache · INTER-006 load-guard · INTER-004 double-fire · verified
- [ ] Tom review / merge · decide INTER-001/002 confirm family
