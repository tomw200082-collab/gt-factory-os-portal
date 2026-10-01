# Tranche 188 — GT Pulse copy round: the UX gate's copy decisions

**Status:** in progress on `feat/gt-pulse-copy-round`.
**Origin:** Tom, 2026-10-01: "מאשר הכל". He gave this in reply to the five copy decisions left open by the tranche 187 UX gate (brain `docs/phase8/dry-runs/2026-10-01-gt-pulse-d1-corridor-ux-gate.md`).
**Scope:** register and wire the approved strings. No layout change beyond a prospect badge and one hint line. No backend change, no flag.

## Copy register (Tom approved, 2026-10-01)

| Key | Hebrew | Where | Gate item |
|---|---|---|---|
| `UI.flowScope` | כל הלידים | Today journey-flow caption; replaces the unrendered "כל הלידים הפתוחים" | COPY-T187-001 |
| `UI.orgNotCustomer` | טרם לקוח | org list badge for a business that is not a customer | VISUAL-187-002 |
| `UI.noteNeeded` | כתבו הערה כדי לשמור | under the lead card's disabled note save, linked by `aria-describedby` | INTER-187-005 |
| `UI.customerStatusActive` / `UI.customerStatusDisabled` | פעיל / לא פעיל | customer snapshot status; was inline in `CustomerBadge.tsx` (same words) | COPY-T187-002 |
| `UI.navMain` / `UI.navBar` | ניווט ראשי / סרגל ניווט | names of the desktop and phone nav landmarks | A11Y-004 |

## Manifest

manifest:
  - docs/portal-os/tranches/188-gt-pulse-copy-round.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md
  - src/app/(sales)/_lib/labels.ts
  - src/app/(sales)/sales-tokens.css
  - src/app/(sales)/_components/JourneyFlow.tsx
  - src/app/(sales)/_components/CustomerBadge.tsx
  - src/app/(sales)/_components/OrgList.tsx
  - src/app/(sales)/_components/SalesShell.tsx
  - src/app/(sales)/_components/LeadDrawer.tsx
  - tests/unit/sales/journey-flow.test.tsx
  - tests/unit/sales/leads.test.tsx

## Gates

- Unit, typecheck, lint, build.
- Mocked sales e2e.
- No overflow at 320/390/430.

## Rollback

Revert the merge commit.
