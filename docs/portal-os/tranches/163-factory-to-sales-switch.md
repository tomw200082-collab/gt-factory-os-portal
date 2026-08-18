# Tranche 163 — the switch between the two apps only worked one way

**Status:** built — tsc 0, vitest green
**Origin:** Tom, 2026-08-18, minutes after first opening the sales workspace on production:
*"צריכה להיות גם אופצייה פשוטה לעבור לצד של המכירות מהצד של התפעול."*
sizing: XS
scorecard_target_category: ops_surface
expected_delta: the sales workspace is reachable from the operations portal in one tap, so it stops
being a URL you have to remember.

## The defect

Tranche 162 shipped the crossing in one direction only. `SalesShell` carries a
`מעבר לייצור` control (`src/app/(sales)/_components/SalesShell.tsx:122`) that lands on `/home`,
because during that tranche the phone had no way out of the sales tab bar at all. Nothing was added
in the opposite direction: from anywhere in the operations portal the only routes to sales were
typing `/sales/today` by hand or going through `/apps`, which is itself only reachable by typing.

For the one person who holds both roles that is the difference between a workspace he uses and a
workspace he has to remember exists.

## The fix

One control in `TopBar`, mirroring the sales-side one rather than inventing a second pattern:

- Same icon (`ArrowLeftRight`), same shape — icon-only on phones, labelled from `sm` up.
- Sits in the `ml-auto` cluster next to the command palette, so it is present on every operations
  route without touching `NAV_MANIFEST` or the sidebar.
- Goes straight to `/sales/today`, not to `/apps`. The sales-side control goes straight to `/home`;
  a switchboard in between would make the two directions asymmetric for no gain.
- Renders only for `role === "admin"` — the same predicate that gates `/apps`
  (`src/app/apps/page.tsx:21`) and the `(sales)` route group (`RoleGate minimum="admin:execute"`).
  An operator, planner or viewer sees no control, exactly as before.

**Label is English.** The factory shell is English-first; the Hebrew exception in the portal
`CLAUDE.md` covers `/apps` and the `(sales)` route group, and this control lives in neither. The
destination is Hebrew; the doorway to it is not.

## Manifest

```
src/components/layout/TopBar.tsx
src/components/layout/TopBar.switch.test.tsx
docs/portal-os/tranches/163-factory-to-sales-switch.md
docs/portal-os/tranches/_active.txt
```

## Checklist

- [x] Control renders for admin
- [x] Control absent for operator / planner / viewer
- [x] Points at `/sales/today`
- [x] Label hidden below `sm`, accessible name present at every width
- [x] `NAV_MANIFEST` unchanged — no new primary-nav entry, no quarantine re-entry
- [x] tsc clean · vitest green
