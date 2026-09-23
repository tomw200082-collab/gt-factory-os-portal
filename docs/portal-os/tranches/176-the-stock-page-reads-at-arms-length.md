# Tranche 176: the stock page reads at arm's length

status: built
created: 2026-09-23
scorecard_target_category: ops_surface
expected_delta: +0 on ops_surface (readability pass — no route, role or data change; a numeric delta would be invented)
sizing: S

**Origin:** Tom, 2026-09-23: "צריך לסדר וויזואלית את הדף של המלאי — הוא קצת מבולגן מדי. הכתב קצת יותר
גדול, פחות כל מיני כתבים שלא מבינים מה הם אומרים, יותר מודגש ויפה."

## Why this tranche

`/inventory` is the page the factory reads most and it was set for a dashboard reviewer, not for an
operator at arm's length: 39 uses of 10–11px type (`text-3xs`, `text-2xs`), a "trust strip" that
explained the ledger in system vocabulary, supply-method micro-badges (MF / BF / RP), a "Tier"
column, a "UOM" filter, a "Stale" pill on every quiet row, a Comfortable / Compact density toggle,
and two of the four headline cards about cost coverage rather than stock. Tom asked for bigger type,
fewer labels nobody understands, and a bolder, calmer page. Same data, same filters, same links.

## Scope

- Type floor raised: secondary text 13px, item names 14px semibold, on-hand quantity 17px bold,
  headline numbers 30px bold. No token or config change — Tailwind classes only.
- Words: header description in plain English; trust strip removed; "Tier" → "Status"; "UOM" →
  "Unit"; "Stale (14d+)" → "No movement 14d+"; "Value (ILS)" → "Value"; search placeholder without
  the keyboard hint (the `/` shortcut still works).
- Removed from rows: supply-method badge, Stale pill, italic cost pills (missing cost now reads
  "No cost" in the cost column; the Missing-cost filter chip and count stay).
- Density toggle removed; one comfortable density.
- Headline cards: Stock value · Items · Needs attention (below floor + out of stock + critical,
  across both tabs) · Cost coverage (one card instead of two).
- Everything else unchanged: tabs, category / status / unit filters, group-by, sort, Reconcile badge
  and drawer, bulk-count link, mobile cards, deep-link `?item_id=`, test ids.

## Manifest (files that may be touched)
manifest:
  - src/app/(shared)/inventory/page.tsx

## Revive directives (if any)
revive: []

## Out-of-scope

- Which rows appear. The "ACTIVE masters only" rule Tom asked for the same day is a backend
  read-model change and ships in `gt-factory-os` (`api/src/stock/handler.ts`, same branch name).
- Shared components (`GroupFilterBar`, `ReconcileBadge`, `StockTruthDrawer`, `WorkflowHeader`,
  `SectionCard`), design tokens, `tailwind.config.ts`, `globals.css`.
- Hebrew on this surface — `/inventory` is an operator surface and stays English (portal `CLAUDE.md`).

## Tests / verification

- typecheck clean
- vitest: full run (no unit test targets this page; the run proves nothing else moved)
- playwright: `tests/e2e/inventory-reconcile.spec.ts` selectors kept verbatim — `h1 Inventory`,
  button `Reconcile`, button `All`, `data-testid="inventory-desktop"` / `"inventory-mobile"`
- regression-sentinel: no baseline regressions (no route, nav or role change)

## Exit evidence

- typecheck + vitest counts in the PR body
- PR link

## Rollback

Revert the PR on main; one client component, no data-layer change, revert is clean.

## Operator approval

- [x] Tom asked for this directly in chat (2026-09-23); no separate plan step.

## Actual evidence (filled in by the run)

See PR body.
