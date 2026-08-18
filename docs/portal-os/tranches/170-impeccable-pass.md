# Tranche 170 — what the screenshots showed

**Status:** built — tsc 0, vitest green
**Origin:** the `impeccable` audit → polish → harden pass the v2 plan schedules after tranches
164–169, run as the skill prescribes: build fully, inspect once in a batched round (desktop and
mobile together), fix everything it shows in one batch, confirm with one more round, stop.
sizing: XS
scorecard_target_category: ux_polish
expected_delta: five defects that only a rendered screen reveals, closed before the release gate.

## What the detector said, and what it could not

`impeccable detect` reported **zero findings** across every changed component and the token file.
That is worth stating plainly, because it is also the limit of the tool: every defect below was
invisible to static analysis and obvious in a screenshot.

## The five

1. **The floating "+ ליד חדש" sat on top of the add-a-reason button on `/sales/settings`.** A
   floating action obscuring a real one, on the screen where the floating action means nothing —
   you do not add a lead from a settings form. It no longer renders there.
2. **The page ended underneath its own furniture.** Bottom padding cleared the tab bar but not the
   FAB above it, so the last control on a long form sat under a button.
3. **The status column repeated the active tab on every row.** With one status per tab, `חדש` down
   the whole `חדש` tab spends table width to restate the tab's own label — and the business column
   was truncating for it. Hidden, with the prop kept so an "all" tab restores it.
4. **The attention rows read as a layout accident on a wide screen.** `flex-1` on the business name
   pushed everything to the far edge, so connecting a business to its number of days meant crossing
   1,000px of nothing. Identity and its metadata now travel together; the phone stays at the edge.
5. **The activity feed was a run-on string.** Four fields, no separators, no rhythm — a log that
   reads as one sentence. A hairline per row, the actor and time grouped at the far end.

## Manifest

```
src/app/(sales)/_components/SalesShell.tsx
src/app/(sales)/_components/LeadsTable.tsx
src/app/(sales)/_components/AttentionList.tsx
src/app/(sales)/_components/ActivityFeed.tsx
src/app/(sales)/sales/leads/page.tsx
docs/portal-os/tranches/170-impeccable-pass.md
docs/portal-os/tranches/_active.txt
docs/portal-os/registry.md
```

## Checklist

- [x] No floating control covers an interactive one, on any screen
- [x] Every page ends above its own furniture
- [x] No column restates its own filter
- [x] Attention rows compose rather than spread
- [x] The activity feed reads as a log
- [x] Confirmed in one further screenshot round, then stopped
- [x] tsc 0 · vitest 1381/1381
