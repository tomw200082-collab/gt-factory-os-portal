# Tranche 195 — GT Pulse Unit B: the independent review and the gate's confirmation round

**Status:** built on `claude/gt-pulse-b-portal`; ships in the same release PR as tranches 189 to 194.
**Origin:** two inputs. First, an independent code review of the whole Unit B diff plus backend #339: Critical 0, Important 3, Minor 10. Second, the UX gate's confirmation round on tip bd34575, covering the redesigned timeline.
**Backend:** none.

## Fixed

### Code review: Important
- **I-1.** "Next action", "primary contact" and "leads" said *nothing here* when their read failed. Each now says it could not be read, that this does not mean there is nothing, and offers a retry (`PanelError`).
- **I-2.** The timeline could count an incomplete month as full. A month the mirror did not see to its end is now partial, so a stale mirror never shows a drop it did not see (`timelineMonths(months, asOf)`).
- **I-3.** A refunded last order was titled "completed". The order sheet now names an order from its own detail when the caller does not know its class.

### Code review: Minor
- **Proxies (M2).** Every `[id]` route checks the uuid, and the order route checks the gid, before forwarding. A malformed id gets a local 400, so a path cannot be reshaped upstream. Contact decisions are narrowed to verify and reject.
- **Smaller fixes.**
  - The list and search queries do not retry a 4xx.
  - The palette says when the search failed.
  - Changing the sort lets go of the selection.
  - The owner toast counts what the API updated.
  - A malformed id escape no longer crashes the page.
  - The merge toast that links to the destination stays until it is closed (WCAG 2.2.1).
  - An empty holder name falls back to words.
  - The workspace comment is corrected.

### Gate confirmation round
- **INTER-NEW-001 (P1).** The two years keep their place when the history read fails, or is empty, with a retry.
- **A11Y-194-001 (P1).** Month columns are narrower than a fingertip on a phone. Tom asked for two years at a glance, so both stay.
  - A finger drawn along the chart chooses the month under it.
  - 44px previous/next buttons in the callout reach every month: the WCAG 2.5.8 equivalent-control exception.
- **TL-001.** Zoom stops at the height of a typical month, where every column would otherwise only say it is cut.
- **TL-002.** The count bubble rides above the column and the trend point.
- **TL-003.** On the narrowest phones the fit button sheds its word.
- **P2s.**
  - A second tap lets go of a month.
  - A month with nothing has no open button.
  - No dimming transition under reduced motion.
  - The legend's comma.

### Found while verifying
- A press focuses a month, which chooses it, before its click. "Tap again to let go" therefore reads the choice from before the press.
- The test has to fail before the fix and pass after it.

### Found by the final full e2e run
- **Journey A (search → open a business).** It failed once under load. The list page's address sync ran `router.replace` again during the navigation away: it depended on the router object, which is not stable across renders, and it rewrote even an unchanged address. That pulled the person back to the list, and it also explains K's earlier intermittent failure.
- **The sync now:**
  - runs only when the view changes (filter, sort, settled query);
  - holds the router in a ref;
  - never rewrites the address it already shows.
- **Proof.** Red first: a unit test checks that no replace happens on an unchanged address. Then journeys A and K passed 16/16 across 8 repetitions each.

## Not taken, with reason

- **Identity merge race (review M1: send the expected holder, server answers 409).** Deferred. It needs a backend contract change. The toast already reports a merge that did happen.
- **History status per call (review M3).** Deferred, because it is an edge case: publication flipping between two reads.
- **Dev-shim production guard (review M10).** Outside this lane: `src/lib/api-proxy.ts` is portal-wide.
- **Reaching a disabled zoom button by keyboard (A11Y-194-003).** Not taken. It is the portal-wide disabled-with-title pattern.
- **Focus on a mouse click (INTER-NEW-004).** Not taken: Chrome focuses a tabindex=-1 SVG target on click.

## Manifest

manifest:
  - docs/portal-os/tranches/195-gt-pulse-b-review-fixes.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md
  - src/app/(sales)/_components/CommandK.tsx
  - src/app/(sales)/_components/EmptyStates.tsx
  - src/app/(sales)/_components/org/BusinessCircle.tsx
  - src/app/(sales)/_components/org/IdentityReview.tsx
  - src/app/(sales)/_components/org/NextAction.tsx
  - src/app/(sales)/_components/org/OrderSheet.tsx
  - src/app/(sales)/_components/org/OrdersTimeline.tsx
  - src/app/(sales)/_components/org/OrgLeads.tsx
  - src/app/(sales)/_components/org/OrgWorkspace.tsx
  - src/app/(sales)/_components/org/PrimaryContact.tsx
  - src/app/(sales)/_lib/api.ts
  - src/app/(sales)/_lib/labels.ts
  - src/app/(sales)/_lib/timeline.ts
  - src/app/(sales)/sales-tokens.css
  - src/app/(sales)/sales/orgs/[id]/page.tsx
  - src/app/(sales)/sales/orgs/page.tsx
  - src/app/api/sales/contacts/[id]/[action]/route.ts
  - src/app/api/sales/orgs/[id]/circle/route.ts
  - src/app/api/sales/orgs/[id]/contacts/route.ts
  - src/app/api/sales/orgs/[id]/identity/route.ts
  - src/app/api/sales/orgs/[id]/orders/[gid]/route.ts
  - src/app/api/sales/orgs/[id]/orders/route.ts
  - src/app/api/sales/orgs/[id]/river/route.ts
  - src/app/api/sales/orgs/[id]/route.ts
  - tests/e2e/sales-orgs.spec.ts
  - tests/unit/sales/api-stubs.test.ts
  - tests/unit/sales/command-k.test.tsx
  - tests/unit/sales/orders-timeline.test.tsx
  - tests/unit/sales/org-workspace.test.tsx
  - tests/unit/sales/orgs.test.tsx
  - tests/unit/sales/timeline.test.ts
  - src/app/api/sales/_ids.ts
  - tests/unit/sales/order-sheet.test.tsx
  - tests/unit/sales/proxy-ids.test.ts

## Gates

- Red first: every behaviour change was watched failing.
- vitest sales 509/509, typecheck 0, lint 0 new.
- `sales-orgs.spec` 21/21, including a touch scrub on a phone.
- Rendered at 320 and 390.

## Rollback

Revert the release merge commit.
