# Tranche 168 — the pass that makes it survive the fortieth repetition

**Status:** built — tsc 0, vitest green
**Origin:** the 2026-08-18 v2 audit — P0-7, P1-11 through P1-18, and the A11Y findings;
masterprompt §8 ("זוהר, מודרני, סופר מושך ומהמם", with legibility winning where the two fight).
sizing: M
scorecard_target_category: ux_polish
expected_delta: the card leads with the call instead of the exit, three ink tiers read as three, and
nothing on the surface sits under its accessibility floor.

## The defect

**The card's loudest control was the way out.** "אבוד" sat in the primary action row in
`hsl(0 72% 46%)` — the *same* red as the SLA alarm — next to a teal "התקשר". Red at 72% saturation
wins a pre-attentive race against teal at 42% every time, and this card repeats 149 times a morning.
A queue whose most salient button ends the conversation is a queue that hesitates.

**Three ink tiers read as two.** `--s-fg-muted` and `--s-fg-faint` were three percentage points of
lightness apart. At 13px on a phone that is not a hierarchy, it is one grey.

**Six controls sat under the 44px floor** the brief sets as a hard constraint: three header icons,
two dialog closes, the status filters, and the org-card lead rows. **The quick-add button was on the
wrong side of the screen** — `insetInlineEnd` resolves to the physical left in RTL, which is the far
side from a right-handed thumb.

**Three accessibility contracts were announced and not honoured:** a `radiogroup` with no arrow-key
navigation; `aria-invalid` on the SLA field with no error text to read; and a disabled call button
whose only explanation was a `title`, which iOS VoiceOver does not announce. Plus 11px text in three
places, an unmarked required field, a timeline that arrived silently, a `CommandK` input with no
boundary once focus left it, an active filter distinguished by colour alone, a table row with a
pointer cursor and no hover, a skeleton 56px shorter than the card it stood in for, and the English
word "active" rendering inside a Hebrew card.

## The fix

Scope held exactly: `sales-tokens.css` and `(sales)` components, everything under
`[data-app="sales"]`, `--s-*` prefixed. `globals.css` and `tailwind.config.ts` untouched.

- **`--s-danger-quiet`**, its own red at 50% saturation, so a clock and a decision stop looking like
  the same thing — and **"דחה" and "אבוד" leave the button row entirely**, becoming text links under
  the two primary actions. Still one tap; they just stop competing.
- **The ink hierarchy opens upward.** The obvious fix — lighten `faint` — would have dropped that
  tier under 4.5:1. The brief is explicit that legibility wins, so `muted` goes *darker* instead:
  the gap widens from 3 points to 12, and **both tiers gain contrast rather than spending it**.
  Two new test cases pin both halves of that, because the tempting fix is the one that spends it.
- **The 44px floor**, everywhere, including the desktop factory-switch. **The FAB moves to
  `insetInlineStart`** — the physical right in RTL, where the thumb is.
- **Roving tabindex and arrow keys** on both lost-reason groups; **a named SLA range** wired through
  `aria-describedby`; **`aria-disabled` with a described reason** instead of a `title` iOS ignores;
  a **12px floor** on all readable text; a **required marker** on quick-add's one required field; a
  polite live region when the timeline lands; a **bottom border** on the CommandK field; **600 weight**
  on the active filter so it survives greyscale; a **row hover**; a skeleton that matches the card;
  and "active" rendered as **פעיל**.
- `--s-shadow-card` from 4% to 8% — the old value was a shadow in the source and nothing on screen.

**One decision-gate change, stated out loud:** D4 approved widening `--s-fg-faint` to `220 6% 60%`.
Implementing it literally would have taken that tier from 4.5:1 to roughly 3.2:1 and forced the
contrast suite to be *weakened* to stay green — which §8 forbids in the same paragraph that asks for
the improvement. The hierarchy goal is met by moving the other end. The other two D4 tokens landed
as approved.

## Manifest

```
src/app/(sales)/sales-tokens.css
src/app/(sales)/_components/TodayCard.tsx
src/app/(sales)/_components/LeadsTable.tsx
src/app/(sales)/_components/LeadDrawer.tsx
src/app/(sales)/_components/OutcomeSheet.tsx
src/app/(sales)/_components/OrgCard.tsx
src/app/(sales)/_components/CommandK.tsx
src/app/(sales)/_components/CustomerBadge.tsx
src/app/(sales)/_components/EventTimeline.tsx
src/app/(sales)/_components/EmptyStates.tsx
src/app/(sales)/_components/QuickAddSheet.tsx
src/app/(sales)/_components/SalesShell.tsx
src/app/(sales)/_components/SettingsForm.tsx
src/app/(sales)/_lib/labels.ts
tests/unit/sales/sales-tokens.test.ts
tests/unit/sales/today-queue.test.tsx
tests/e2e/sales-visual-a11y.spec.ts
docs/portal-os/tranches/168-visual-a11y-pass.md
docs/portal-os/tranches/_active.txt
docs/portal-os/registry.md
```

## Checklist

- [x] The call is the loudest thing on the card; the exits are underneath it
- [x] `--s-danger-quiet` is distinct from `--s-sla-overdue`, both themes
- [x] Muted and faint are separable, and neither drops below 4.5:1
- [x] Every control clears 44px, phone and desktop
- [x] The FAB is in the right-hand thumb arc in RTL
- [x] Arrow keys move between lost reasons on both surfaces
- [x] The SLA error, the required marker and the timeline announcement all reach a screen reader
- [x] No readable text below 12px anywhere in the tree
- [x] Contrast suite extended (52 → 60 cases), never weakened
- [x] `globals.css` and `tailwind.config.ts` untouched
- [x] tsc 0 · vitest 1380/1380 · playwright 38/38 across all seven sales specs
