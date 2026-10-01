# Tranche 187 — GT Pulse D1, corridor-wide: every sales screen at the D1 level

**Status:** in progress on `feat/gt-pulse-d1-corridor`; not deployed.
**Origin:** Tom, 2026-10-01: "תביא את כלל המסכים לאותה רמה עיצובית ועם חוויית משתמש מושלמת". This follows tranche 186 (D1, live at `49435b1`), under the same production go and program spec §8.
**Spec:** Sales-Machine `docs/superpowers/specs/2026-10-01-gt-pulse-d1-visual-design.md` (V1–V12, plus V13 for the corridor).
**Scope:**
- The shell: glass app bar and a floating tab bar.
- A petrol band on every screen: leads, attention, orgs and settings.
- Lead cards carry the mini rail.
- The org card gets the lead card's treatment.
- Settings sit in panels.
- Empty and loading states.
- Sheet handle.
- Three strings Tom approved on 2026-10-01 (UX gate FLOW-001, FLOW-003 and FLOW-004).

No backend change, no flag.

## Copy register (Tom approved, 2026-10-01: "מאשר!")

| Key | Hebrew | Where |
|---|---|---|
| `UI.flowScope` | כל הלידים הפתוחים | caption of the Today journey flow; the flow shows the whole visible pipeline |
| `UI.noteSaved` | נשמר ✓ | inline status next to the lead card's note save, after the write lands |
| `UI.teamCounts` | כל הצוות | caption of the manager's triage counts on Today |

## Manifest (every path this tranche may touch)

manifest:
  - docs/portal-os/tranches/187-gt-pulse-d1-corridor.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md
  - src/app/(sales)/sales-tokens.css
  - src/app/(sales)/_lib/labels.ts
  - src/app/(sales)/_components/SalesShell.tsx
  - src/app/(sales)/_components/JourneyFlow.tsx
  - src/app/(sales)/_components/StatsStrip.tsx
  - src/app/(sales)/_components/MiniRail.tsx
  - src/app/(sales)/_components/LeadsTable.tsx
  - src/app/(sales)/_components/LeadDrawer.tsx
  - src/app/(sales)/_components/OrgList.tsx
  - src/app/(sales)/_components/OrgCard.tsx
  - src/app/(sales)/_components/AttentionList.tsx
  - src/app/(sales)/_components/ActivityFeed.tsx
  - src/app/(sales)/_components/SettingsForm.tsx
  - src/app/(sales)/_components/EmptyStates.tsx
  - src/app/(sales)/sales/today/page.tsx
  - src/app/(sales)/sales/leads/page.tsx
  - src/app/(sales)/sales/attention/page.tsx
  - src/app/(sales)/sales/orgs/page.tsx
  - src/app/(sales)/sales/settings/page.tsx
  - tests/unit/sales/journey-flow.test.tsx
  - tests/unit/sales/mini-rail.test.tsx
  - tests/unit/sales/today-queue.test.tsx
  - tests/unit/sales/sales-tokens.test.ts
  - tests/e2e/sales-visual-a11y.spec.ts

## Gates

- Unit, typecheck, lint, build.
- Mocked sales e2e.
- No horizontal overflow at 320/390/430 on any sales screen or card.
- UX release gate, sales profile: 0 P0, and no open P1 that Tom has not decided.

## Rollback

Revert the merge commit; presentation only.
