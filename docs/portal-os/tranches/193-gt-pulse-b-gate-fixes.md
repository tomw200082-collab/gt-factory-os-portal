# Tranche 193 — GT Pulse Unit B: the UX release gate's findings, fixed

**Status:** built on `claude/gt-pulse-b-portal`; ships in the same release PR as tranches 189 to 192.
**Origin:** the first `/ux-release-gate` run on Unit B (sales profile, strict P0 = P1 = 0). Five lenses reported:

| Lens | P0 | P1 | P2 |
|---|---|---|---|
| Flow | 1 | 4 | 3 |
| Interaction | 1 | 6 | 5 |
| Visual | 0 | 3 | 4 |
| Content | 0 | 7 | 4 |
| Accessibility | 0 | 3 | 8 |

**Backend:** gt-factory-os PR #339 (merged): an additive `held_by {org_id, name} | null` on identity candidates. The portal treats the field as optional and falls back to naming the merge as possible.

## Fixed

- **FLOW-B-001 (P0).** A business that moved to a distributor no longer shows a day count in its summary (T5).
- **INTER-B-001 (P0).**
  - A candidate another live org already holds says so on its card.
  - The confirm names the merge target, says the record closes for good, and asks "כן, לאחד".
  - The toast names the destination and links to it (FLOW-B-003).
- **FLOW-B-002 / 004.** Back goes to the sales screen the person came from, falling back to the list.
- **FLOW-B-005.** The link consequence states the merge as permanent.
- **INTER-B-002 to 007.**
  - Bulk bar: hidden while searching; it says why "שייך בעלים" is disabled.
  - Palette: says it is still looking.
  - Contact toast: names who and what.
  - Verify/reject: a gap of 2.
  - Review: one decision at a time, with a visible saving line.
- **VIS-B-001.** Filters are one row from 385px (measured: 308px needed, 322px at 390).
- **VIS-B-002.** The rep's forbidden review screen has the petrol band.
- **COPY-B-001 to 011.** All eleven content strings.
- **A11Y-B-001 to 011.**
  - A live count on the list.
  - Page states are no longer `role="alert"`.
  - `lang="he"` on the document while a sales page is open.
  - The org name is in the tab title.
  - `alertdialog` has `aria-describedby`.
  - Disabled-reason title; no `aria-busy` on a button.
  - A single state on the select toggle.
  - Dashed ink focus on the ring and the timeline, distinct from the current month.
  - Money isolated in `<bdi>`.
  - Focus moves to the org name after in-app navigation.
- **P2s.**
  - The ring and grid say "+N" past their cap.
  - Palette names wrap to two lines with a title.
  - A one-letter search says so.
  - A retired row's checkbox says why it is disabled.
  - The ring arrival uses the spring easing with an explicit `transform-box`.

## Not taken, with reason

- **VIS-B-003:** rejected. The inset shadow is D1's, passed at its own gate.
- **VIS P2, merging the circle centre's source and time into one line:** rejected. At 390px a single line wraps mid-date inside the ring (`scratchpad/gate2/x-ring-many.png`), so two lines read better.
- **Review count on the list's review link:** deferred. It would fetch the whole identity queue, candidates included, on every list visit.
- **VIS-B-007 inline-style refactor:** deferred. It is not material.

## Manifest

manifest:
  - docs/portal-os/tranches/193-gt-pulse-b-gate-fixes.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md
  - src/app/(sales)/_components/BackLink.tsx
  - src/app/(sales)/_lib/salesHistory.ts
  - src/app/(sales)/_components/BulkOwnerBar.tsx
  - src/app/(sales)/_components/CommandK.tsx
  - src/app/(sales)/_components/OrgList.tsx
  - src/app/(sales)/_components/SalesShell.tsx
  - src/app/(sales)/_components/org/BusinessCircle.tsx
  - src/app/(sales)/_components/org/ContactsList.tsx
  - src/app/(sales)/_components/org/IdentityReview.tsx
  - src/app/(sales)/_components/org/OrgHeader.tsx
  - src/app/(sales)/_components/org/OrgStates.tsx
  - src/app/(sales)/_components/org/OrgSummary.tsx
  - src/app/(sales)/_components/org/OrgWorkspace.tsx
  - src/app/(sales)/_components/org/Sheet.tsx
  - src/app/(sales)/_lib/labels.ts
  - src/app/(sales)/_lib/types.ts
  - src/app/(sales)/sales-tokens.css
  - src/app/(sales)/sales/orgs/page.tsx
  - tests/unit/sales/back-link.test.tsx
  - tests/unit/sales/business-circle.test.tsx
  - tests/unit/sales/command-k.test.tsx
  - tests/unit/sales/identity-review.test.tsx
  - tests/unit/sales/org-workspace.test.tsx
  - tests/unit/sales/orgs.test.tsx
  - tests/e2e/sales-orgs.spec.ts

## Gates

- Red first for every behaviour change. Typecheck, lint, vitest, build, and the mocked e2e.
- The UX gate is rerun until P0 = P1 = 0.

## Rollback

Revert the release merge commit. The backend field is additive, and older portals ignore it.
