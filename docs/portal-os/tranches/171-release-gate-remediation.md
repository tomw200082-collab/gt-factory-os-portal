# Tranche 171 — what the release gate found

**Status:** built — tsc 0, vitest green, playwright green
**Origin:** `/ux-release-gate` iteration 1 over `/sales/{today,leads,orgs,attention,settings}`, five
dimensions in parallel against render-grade evidence at `/tmp/ux-shots/*.png`. The gate returned
**3 P0 · 20 P1 · 21 P2**. Any P0 forces HOLD, so this tranche exists to clear them and every P1
before iteration 2.
sizing: M
scorecard_target_category: ux_polish
expected_delta: HOLD → SHIP.

## The three P0s

1. **INTER-001 — the bulk bar acted on rows nobody could see.** `selected` was never cleared when
   `tab`, `uncontactableOnly` or `unownedOnly` changed. Select eight leads on `חדש`, switch to
   `אבוד`, press שייך — eight leads you are no longer looking at get assigned. The selection now
   clears whenever the visible set changes.
2. **INTER-002 — a failed bulk assign was silent.** The bar went spinner → idle with no message, and
   the selection stayed, so the natural response was to press it again. `BulkBar` now takes an
   `error` prop and the page wires `bulkAssign.error` into it.
3. **A11Y-001 — the bulk bar's existence was invisible to a screen reader.** `role="region"` does not
   announce on mount, so a keyboard user selecting rows got no signal that bulk actions had appeared.
   A persistent `role="status" aria-live="polite"` element now lives on the page — outside the
   conditional render, because a live region that mounts with its message never announces it.

## The P1s, by dimension

**Flow** — calling from `/sales/attention` armed nothing, so the outcome was never asked for and the
conversation was never logged: the one defect v2 was built to close, still open on the newest screen.
Attention now mounts `useOutreach` + `useOutcomeCapture` + `OutcomeSheet`, exactly as Today and Leads
do. The activity feed gained loading and error states — a blank `<section>` while a query was in
flight was indistinguishable from "no activity ever".

**Interaction** — the per-section daily cap yielded 2× the admin's number (15 new + 15 follow-ups
against a cap of 15); it is now one budget across both capped sections, which is what "כמה שיחות
ביום" says. The settings save button was enabled while the cap field was invalid. The deactivation
warning vanished the moment you unchecked the box that triggers it. The drawer backdrop discarded an
unsaved note that Escape would have protected. `useSetNextTouch` got the optimistic `onMutate` its
sibling `useOutcome` has had since 165.

**Accessibility** — 20 checkboxes all announced "בחר ליד"; every remove button announced "הסר"; the
person toggle announced "פעיל" without saying whose. Select-all had no `mixed` state, so a partial
selection read as none. Sections had headings with no programmatic association.

**Visual** — the settings screen used `.s-eyebrow` for both section headings and the field labels
inside them, collapsing two tiers into one; a new `.s-section-heading` separates them. The attention
org name — the only way into a lead from that screen — rendered as unstyled bold text with no
affordance. The leads sub-filter chips carried tab-shaped content with no tab-shaped styling. The
mobile stats strip serialised four counts into a `<p>` that wrapped to four lines and swallowed the
header; it is a two-column grid now.

**Copy** — six Hebrew number-agreement bugs (`1 נבחרו`, `שויכו 1 לידים`, `1 אירועים`, …), and
`אחראי` vs `בעלים` for the same field in the same widget.

## Deferred, with the reason

- **VISUAL-010** (arbitrary `text-[13px]` → named scale steps) — mechanical, zero visible change,
  touches eight components. Real, and worth doing; not worth the regression surface inside a gate
  remediation batch.
- **VISUAL-011** (badge cluster out of the org-name cell into its own column) — a table restructure.
  Same reasoning.
- **`/sales/orgs` dead end** — pre-existing, untouched by v2, and outside this tranche's manifest.
- **Erik first-run hint** — an onboarding design task, not a defect.

## Manifest

```
src/app/(sales)/_lib/labels.ts
src/app/(sales)/_lib/api.ts
src/app/(sales)/_lib/queue.ts
src/app/(sales)/_components/BulkBar.tsx
src/app/(sales)/_components/LeadsTable.tsx
src/app/(sales)/_components/LeadDrawer.tsx
src/app/(sales)/_components/AttentionList.tsx
src/app/(sales)/_components/ActivityFeed.tsx
src/app/(sales)/_components/SettingsForm.tsx
src/app/(sales)/_components/StatsStrip.tsx
src/app/(sales)/_components/TodayQueue.tsx
src/app/(sales)/sales/leads/page.tsx
src/app/(sales)/sales/today/page.tsx
src/app/(sales)/sales/attention/page.tsx
src/app/(sales)/sales/settings/page.tsx
src/app/(sales)/_styles/sales-tokens.css
tests/unit/sales/queue.test.ts
tests/unit/sales/settings.test.tsx
tests/unit/sales/attention.test.tsx
tests/e2e/sales-leads.spec.ts
tests/e2e/sales-attention.spec.ts
docs/portal-os/tranches/171-release-gate-remediation.md
docs/portal-os/tranches/_active.txt
docs/portal-os/registry.md
```

## Checklist

- [x] All 3 P0s closed, each with a test verified to fail without the fix
- [x] All 20 P1s closed
- [x] Deferred P2s named in this file, not silently dropped
- [x] tsc 0 · vitest 1401/1401 (+20) · playwright 42/42 across eight sales specs (+4)
- [x] Screenshot round confirmed the visual fixes, and showed one more — the settings
      rows spread 700px apart, the same defect 170 fixed on the attention cards. Fixed
      by capping the form to a readable measure, confirmed in one further round, stopped.
- [ ] Gate iteration 2 issues a verdict
