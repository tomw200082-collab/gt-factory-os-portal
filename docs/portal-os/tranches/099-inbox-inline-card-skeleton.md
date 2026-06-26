# Tranche 099: inbox inline-card loading skeleton

status: in-progress
created: 2026-06-26
scorecard_target_category: ops_surface
expected_delta: 0 (loading-state polish)
sizing: XS (1 file; no backend)
source: /portal-audit interaction-design-specialist INTER-007 (2026-06-26)

## Why
`ApprovalInlineCard` showed a single pulsing text line ("טוען פרטים…") while
fetching the approval detail — no structural skeleton, so on a slow connection
the operator couldn't tell the card from a broken/empty state, and the layout
jumped when facts loaded. The detail pages use a proper `aria-busy` skeleton.

## Landed
- Replaced the single pulsing text with a 2-row `animate-pulse` skeleton grid
  (matching the fact-grid shape that loads), `aria-busy="true"` +
  `aria-label="טוען פרטים"` + `data-testid="approval-inline-loading"`. Gives a
  stable size anchor so the card doesn't jump.

## Scope (manifest)
manifest:
  - src/features/inbox/approval-inline-card.tsx
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/099-inbox-inline-card-skeleton.md
  - docs/portal-os/tranches/_active.txt

## Verification
- tsc 0 · eslint 0 · vitest 790/790.

## Inbox/approvals audit — status after this tranche
The 2026-06-26 interaction audit raised 8 findings. Landed: INTER-004/005/006
(tranche 097), INTER-003 (098), INTER-007 (this). Remaining:
- INTER-001 / INTER-002 — add a confirm step to detail-page Reject + inline
  Approve. HELD for Tom (confirm-panel UX decision, shared with the stock forms).
- INTER-008 — "recently dismissed" pill code comment says "one-tap undo" but no
  undo exists; comment-honesty fix (ux-content owns the copy). Follow-up.

## Checklist
- [x] inline-card skeleton + aria-busy · verified
- [ ] Tom review / merge
