# Tranche 172 — what the second look found

**Status:** built — tsc 0, vitest 1406/1406, playwright 46/46
**Origin:** `/ux-release-gate` **iteration 2**, re-running the three dimensions tranche 171 changed
code for (interaction, accessibility, visual) against fresh renders. Iteration 1's verdict was
HOLD on 3 P0s; 171 closed them. Iteration 2 was asked to verify or refute, and to look
specifically for defects the fixes themselves introduced. It found both.
sizing: S
scorecard_target_category: ux_polish
expected_delta: HOLD → SHIP.

## The P0 that was only half closed

**INTER-001.** 171 cleared the selection on `tab`, `uncontactableOnly` and `unownedOnly`. The
visible set also depends on `query`, and that was left out — so: select eight leads, type a search
that narrows the list to three, press שייך, and five leads nobody is looking at move. Same defect,
a different door.

The fix is not a longer dependency array. The invariant is **"the selection is what is on screen"**,
so the effect now prunes to the visible ids rather than clearing on named triggers. That covers the
tab, both chips, the query, and the rows themselves arriving — and it means refining a search no
longer throws away a selection the person is still building. Returning `prev` unchanged when nothing
was pruned is load-bearing: a fresh `Set` every run would re-trigger the effect forever.

One iteration-1 test asserted the blunt behaviour (any chip wipes the selection) and now fails,
correctly: L1 *is* unowned, so the unowned chip does not hide it, so the selection should survive.
The test was rewritten to state the invariant instead of the old mechanism.

## Defects the fixes introduced

- **Optimistic writes only ever patched one scope.** `salesKeys.today(scope)` is
  `["sales","today", scope ?? "all"]`, and both optimistic handlers reached for `salesKeys.today()`
  — the `"all"` entry. On `שלי` the live cache is keyed by the signed-in email, so the patch landed
  on a cache nobody was reading and the answered card sat on screen until the refetch settled. The
  one scope a second salesperson works in was the one where the queue felt broken. This predates
  171 — `useOutcome` has had it since 165 — and 171's new `useSetNextTouch` inherited it by copying
  the pattern. Both now match on the `["sales","today"]` prefix and roll back key by key.
- **The attention drawer never armed.** 171 armed the attention *cards* and left the drawer opened
  from those same cards unarmed: a call placed one tap deeper dialled and asked nothing. The same
  hole the tranche existed to close, one level down.
- **`.s-link` had no size and no focus ring.** It made the org name the primary target of every
  attention card and gave it a colour and an underline — ~20px tall beside a 44px call button, and
  falling back to the browser's own focus ring because that rule enumerates each pattern by hand.
  `min-height: 44px` plus `inline-flex` (min-height does nothing to an inline box), and the class
  added to the focus rule.
- **The remove buttons lost their width.** Moving them off `.s-btn` dropped its `padding-inline`
  with it, so the target kept its height and lost its width — ~35px against a 44px floor that is
  bidirectional.
- **The sheet arrived on `/attention` without the wrapper that makes it modal on iOS.**
  `aria-modal` is only partly honoured there, which is why `/sales/today` hides the queue behind an
  open sheet. The new sheet had no equivalent.
- **`.s-section-heading` was applied in one of the two places that needed it** — the attention
  bucket headings still used `.s-eyebrow`, the exact collapse the rule was written to prevent.

Also: one error channel instead of two on a failed bulk assign (the inline bar carries the server's
own message; the toast carried a generic one and both were on screen together, and both announced);
the scope toggle is inert while a sheet is open; the activity feed loads as skeleton shapes rather
than the word "loading"; and both settings error elements stay in the DOM so `aria-describedby`
always resolves.

## Two findings refuted, and why

Not every finding survived checking, and neither was fixed:

- **"The activity feed has no empty state."** `ActivityFeed.tsx:14-20` returns `UI.activityEmpty` on
  zero rows. The file was not opened.
- **"Multi-tab sessionStorage collision can double-post an outcome."** `sessionStorage` is scoped
  per tab by definition, so two tabs cannot share an armed intent. The finding contradicts its own
  premise in the same paragraph.

## Still deferred, unchanged

`VISUAL-010` (arbitrary px → named scale steps) and `VISUAL-011` (badge cluster into its own
column). Iteration 2 reviewed both deferrals and judged the reasoning sound. `/sales/orgs`' dead end
remains pre-existing and outside this manifest.

## Manifest

```
src/app/(sales)/_lib/api.ts
src/app/(sales)/_components/AttentionList.tsx
src/app/(sales)/_components/SettingsForm.tsx
src/app/(sales)/sales/leads/page.tsx
src/app/(sales)/sales/today/page.tsx
src/app/(sales)/sales/attention/page.tsx
src/app/(sales)/sales-tokens.css
tests/unit/sales/gate-remediation.test.tsx
tests/e2e/sales-leads.spec.ts
tests/e2e/sales-today.spec.ts
tests/e2e/sales-attention.spec.ts
docs/portal-os/tranches/172-gate-iteration-2.md
docs/portal-os/tranches/_active.txt
docs/portal-os/registry.md
```

## Checklist

- [x] The reopened P0 closed, with a test verified to fail against 171's fix
- [x] Both new P1s closed, each with a test verified to fail without its fix
- [x] Every new P2 closed
- [x] Two findings refuted with evidence rather than fixed
- [x] tsc 0 · vitest 1406/1406 · playwright 46/46
- [x] Screenshot round confirms the touch-target and heading fixes
- [x] Gate verdict issued
