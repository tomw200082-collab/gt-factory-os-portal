# Tranche 167 — the admin can answer his own morning question

**Status:** built — tsc 0, vitest green
**Origin:** the 2026-08-18 v2 audit, findings P0-5, P1-7, P1-8 and admin-F7; masterprompt §5, which
scored 2 of 9 admin controls present.
sizing: M
scorecard_target_category: admin_surface
expected_delta: "what is stuck, what is slipping, what has no owner" is a screen instead of a SQL
statement, and the two lists that shaped the product stop needing a deploy to change.

## The defect

**The ingredients existed and nothing added them up.** An overdue lead showed a red date inside a
status tab; an unowned one showed nothing anywhere; a lead being worked that had gone quiet for a
fortnight looked exactly like one worked yesterday. The view layer had `next_touch_overdue` and a
`due_follow_up` bucket and never composed either into the question the admin actually asks. Tom's
own sentence for this — *what is stuck, what is slipping* — was answerable in SQL or not at all.

**`lead_event` carried an actor on every row and could only be read one lead at a time.** Supervising
a second person meant opening their leads individually.

**Two lists that shape the product were frozen into the build.** Lost reasons were a `const` array in
`labels.ts`, so splitting one reason into two was a code change. The queue's cap and order were
constants in two files.

**And settings wrote state with no history.** Changing the SLA from 24 to 96 retroactively recolours
every lead's badge — `sla_state` is computed at read time — and left nothing behind saying who did it.

## The fix

Backend companions 0326 and 0327 (`v_sales_attention`, `v_sales_activity`, `setting_event`, the
`queue` and `lost_reasons` keys); this is the console.

- **`/sales/attention`** — the fourth screen, and the last. Three sections: overdue, unowned for
  three days, stalled for fourteen with no event of any kind. A lead can appear in two; that is
  deliberate, each section answers a different question. Every row opens the same drawer the leads
  table opens, so seeing a problem and acting on it are one tap apart.
- **The activity feed** underneath it: every event, every lead, newest first, with the actor.
- **Queue shape and lost reasons become settings.** The cap, the order, and the reason vocabulary —
  with the free-text entry pinned to the end of the list, which is the rule tranche 165's positional
  check already relies on, stated in the hint rather than left implicit.
- **Every settings section shows who changed it last**, from `setting_event`.

v1 locked "three screens, no more", and that was right for an operator's loop — it was decided before
§5 asked for control. Putting this in a tab inside `/leads` would bury the one question the person
running this asks every morning, so it gets a screen (decision gate D5).

## Manifest

```
src/app/(sales)/_lib/api.ts
src/app/(sales)/_lib/labels.ts
src/app/(sales)/_lib/types.ts
src/app/(sales)/_components/ActivityFeed.tsx
src/app/(sales)/_components/AttentionList.tsx
src/app/(sales)/_components/SalesShell.tsx
src/app/(sales)/_components/SettingsForm.tsx
src/app/(sales)/sales/attention/page.tsx
src/app/(sales)/sales/attention/layout.tsx
tests/e2e/sales-attention.spec.ts
docs/portal-os/tranches/167-admin-attention-console.md
docs/portal-os/tranches/_active.txt
docs/portal-os/registry.md
```

`OutcomeSheet` and `LeadDrawer` already read `lost_reasons` from settings — tranche 165 wired the
readers; this one supplies the editor.

## Checklist

- [x] Three buckets with counts, each row opening the drawer
- [x] A clean board says so rather than rendering nothing
- [x] The activity feed reads across leads, with actor and business
- [x] `מצב` is in the tab bar and the desktop rail
- [x] Daily cap and order are editable and take effect on the queue
- [x] Lost reasons are editable, with the free-text entry pinned last
- [x] Each settings section names who changed it last
- [x] Registered in `docs/portal-os/registry.md` in the same commit
- [x] tsc 0 · vitest 1374/1374 · playwright sales-attention 6/6, all sales specs 31/31
