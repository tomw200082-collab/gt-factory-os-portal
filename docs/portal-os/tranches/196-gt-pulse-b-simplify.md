# Tranche 196 — GT Pulse Unit B: /simplify

**Status:** built on `claude/gt-pulse-b-portal`; ships in the same release PR as tranches 189 to 195.
**Origin:** `/simplify` over the Unit B diff: four reviewers (reuse, simplification, efficiency, altitude). Behaviour is unchanged.

## Applied

- **The timeline's work.**
  - Each month's marks, labels and accessible name are computed once per data, scale and width. A hover or a scrub step re-renders only what the lit month changes.
  - Each month has one stable ref setter.
  - Marks are counted with arithmetic, not by building and filtering arrays.
  - A single index is computed for the chosen and lit months (it was five `indexOf` calls and an IIFE).
  - The trend points are reversed once instead of sorted.
  - A drag reads the plot's box once, not on every step.
- **One glow per column, not per mark.** An SVG filter is painted, not composited, and a selection fades 23 columns at once.
- **The zoom floor lives in the tested library** (`zoomLevels(dataMax, floor)`, `typicalMonth`). The clamp effect is gone; one derived index is used everywhere.
- **The ring is built once.** `onMonth(ym, month)` carries the month, so the workspace no longer rebuilds the ring to find it. The circle's month lists are memoised.
- **The Hebrew month formatters are built once**, not 48 times a render.
- **Reuse.** The owner's name comes from `assigneeName`. Numbers in the labels and the timeline go through `fmtCount`.
- **Merge sheet.** The copy is one `confirmCopy(pending)` function; the three parallel ternaries and the IIFE are gone. The missing-name fallback is one `holderName`.
- **Dead code.** Six unused labels are removed, among them `orgNotCustomer`, `prospectTitle` and `timelineForLead`. `ORG_UI` is no longer exported. Classes with no rule are dropped, and so are two lines that could never act.
- **Orders cache.** A month sheet's orders stay fresh for 5 minutes. They are mirror data with their own "as of".

## Not taken, with reason

- **One proxy factory for the `[id]` routes.** Every sales route file exports its own handler, and `api-stubs.test.ts` holds that contract.
- **Larger restructures, deferred** because of regression risk at release:
  - a shared panel shell for loading, error and empty;
  - value components that own `<bdi>`;
  - moving the toast timer into `Toast`;
  - a shared search-state hook;
  - colour utility classes;
  - a single gesture model for focus versus press.
- **Narrowing invalidation after a contact decision.** Its effects on the river and tasks are not verified.

## Manifest

manifest:
  - docs/portal-os/tranches/196-gt-pulse-b-simplify.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md
  - src/app/(sales)/_components/org/BusinessCircle.tsx
  - src/app/(sales)/_components/org/IdentityReview.tsx
  - src/app/(sales)/_components/org/OrdersTimeline.tsx
  - src/app/(sales)/_components/org/OrgWorkspace.tsx
  - src/app/(sales)/_lib/api.ts
  - src/app/(sales)/_lib/labels.ts
  - src/app/(sales)/_lib/ring.ts
  - src/app/(sales)/_lib/timeline.ts
  - src/app/(sales)/sales-tokens.css
  - tests/unit/sales/timeline.test.ts

## Gates

- vitest sales 510/510 (zoom floor and typical month: new tests), typecheck 0, lint 0 new.
- `sales-orgs.spec` 21/21.
- Timeline re-rendered and compared at 390, light and dark.

## Rollback

Revert the release merge commit.
