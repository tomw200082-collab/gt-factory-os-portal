# Tranche 166 — leads can be handed to a second person

**Status:** built — tsc 0, vitest green
**Origin:** the 2026-08-18 v2 audit, findings P0-2 and P1-2; UNRESOLVED **U-012** in
`Sales-Machine/CURRENT_STATE.md`; masterprompt §6.1, decided as **option C** (decision gate D1).
sizing: L
scorecard_target_category: ops_surface
expected_delta: 188 leads can be distributed, ownership is visible on every list, and the queue can
be scoped to the person looking at it.

## The defect

Assignment existed and delivered nothing.

`assignee` was **free text validated by nobody**. A typo assigned the lead to a ghost, and because
the column was rendered on **no list at all** — not the table, not the cards, not the search — no
screen would ever say so. Ownership was visible only inside the drawer of the lead you already had
open, which is the one place you do not need it.

There was **no bulk verb**: every write was one lead per HTTP call, so distributing the backlog was
188 open-type-save cycles, which is a thing nobody does twice.

An assignment carried **no due date**, so a handed-over lead landed in somebody's name and in
nobody's queue.

And the **per-assignee queue scope had been built and never wired**: `handleSalesToday` has accepted
`?assignee=` since v1 and applies "mine or unclaimed", the proxy forwards the query, and no caller in
the portal ever sent it.

## The fix

Backend companion `gt-factory-os` 0325: the roster lives in `app_setting('assignees')`, every write
is validated against it, and `bulk_assign` moves up to 200 leads in one transaction with the roster
checked once before any lock is taken. Curated rather than derived, because `private_core.app_users`
carries roughly a hundred test accounts and a picker built from it would offer every one of them.

- **`AssigneePicker`** replaces the text box everywhere. An assignee already on a lead but no longer
  active still renders, so a departed person's leads do not silently read as unowned.
- **Ownership is on the list**: a `בעלים` column on the table, a name on the card, and a `ללא בעלים`
  chip for the ones nobody has taken.
- **Selection and a bulk bar**: check rows, pick a person, pick a date, one call.
- **The date is not optional in the UI.** Handing a lead over asks when it is due back; returning one
  to the pool does not.
- **`הכל / שלי`** on Today, remembered across sessions, finally sending the parameter the backend has
  always accepted.
- **Settings grows a people section** — add, rename by re-adding, deactivate — and warns, without
  blocking, when the person being deactivated still owns open leads.

**Erik still has no account** (audit F10). That is the point of option C: the roster is not the
identity system. Tom adds `erik@` here the day the Supabase user exists, and from this tranche on
every screen already knows what to do with him.

## Manifest

```
src/app/(sales)/_lib/api.ts
src/app/(sales)/_lib/labels.ts
src/app/(sales)/_lib/types.ts
src/app/(sales)/_lib/useQueueScope.ts
src/app/(sales)/_components/AssigneePicker.tsx
src/app/(sales)/_components/BulkBar.tsx
src/app/(sales)/_components/LeadsTable.tsx
src/app/(sales)/_components/LeadDrawer.tsx
src/app/(sales)/_components/TodayCard.tsx
src/app/(sales)/_components/TodayQueue.tsx
src/app/(sales)/_components/SettingsForm.tsx
src/app/(sales)/sales/leads/page.tsx
src/app/(sales)/sales/today/page.tsx
src/app/(sales)/sales/settings/page.tsx
src/app/api/sales/attention/route.ts
src/app/api/sales/activity/route.ts
src/app/api/sales/bulk-assign/route.ts
tests/e2e/sales-assignment.spec.ts
docs/portal-os/tranches/166-assignment-and-people.md
docs/portal-os/tranches/_active.txt
docs/portal-os/registry.md
```

The attention and activity proxies ship here and light up in tranche 167: they are the same
back-end lane landing in one place rather than two.

## Checklist

- [x] The picker offers the active roster only, never a raw email box, never a test account
- [x] A deactivated person's existing leads still render with their name
- [x] Assigning from the drawer carries a due date
- [x] The table names the owner; a chip isolates the unowned
- [x] Select-all plus bulk assign is one request for the whole batch
- [x] `הכל / שלי` scopes the queue and is remembered
- [x] Settings can add a person and deactivate one, warning about open leads
- [x] Registered in `docs/portal-os/registry.md` in the same commit
- [x] tsc 0 · vitest green · playwright sales-assignment 7/7
