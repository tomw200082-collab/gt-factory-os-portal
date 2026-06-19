# UX release gate — 2026-06-17 (PR #95)

**Verdict at run time: HOLD → resolved to CONDITIONAL_SHIP after Tom decisions.**

Five UX auditors (flow, interaction, visual, copy, accessibility) ran read-only against the
PR-changed surfaces: `/planning/procurement` (+FocusCard, ActionList), `/purchase-orders/new`
& `/[po_id]` (+PoLineEditor), the four `(ops)/stock` forms, Recipe-Health item/component pages,
`/planning/inventory-flow/[itemId]`, `/me/activity`, `/credit-tracking`.

## Governor verification (key discipline)
Raw audits reported **16 P0s**. Each was checked against the code before weighting:
- **FLOW-11** (`/inventory` "broken") — FALSE; route exists. Dropped.
- **FLOW-2** (procurement fallback loop) — dead code (`onOpen` always passed). → P2.
- **VIS-1/2/3** (`btn-accent`/`input-sm`/`text-destructive` undefined) — confirmed undefined but all fall back to styled, usable base classes. → P1.
- **A11Y-1** (waste inputs unlabeled) — overstated; item field has `ariaLabel`. → P1.
- **INT-1/5/6** (stock writes lack confirm) — accurate, but forms have loading/success states + server idempotency. → P1 (safety).
- **Hebrew on procurement/credit-tracking** — flagged as English-first violations; in fact intentional (procurement Hebrew established in tranche 040). CLAUDE.md doc-lag, not a defect.

**Net verified hard P0: 1** — `JSON.stringify(body)` rendered to the operator in the
waste-adjustments error banner (`page.tsx:352`, a `portal_ux_standard §1` forbidden pattern;
flagged independently by flow, interaction, and copy).

## Tom decisions (via AskUserQuestion)
1. **Hebrew scope:** authorize `/planning/procurement` + `/credit-tracking` in `CLAUDE.md`
   (keep Hebrew). → CLAUDE.md updated 2026-06-17.
2. **Fixes:** fix P0-1 now; plan the P1 backlog as a tranche.

## Actions taken this run
- ✅ **P0-1 fixed** — waste-adjustments error branch no longer renders raw JSON; surfaces a
  server `message`/`error` string only if plain, else a clean English line. typecheck 0.
- ✅ **CLAUDE.md** — UI-language exception extended to procurement + credit-tracking.
- ✅ **Tranche 073 (PROPOSED)** — `docs/portal-os/tranches/073-ux-gate-p1-backlog.md`:
  P1 backlog grouped into 4 bounded batches (stock-write safety, copy hygiene, visual tokens,
  accessibility) for `/portal-tranche-fix`. Not yet executed — awaiting approval.

## Resulting status
| Dimension | Verified P0 | P1 | Status |
|---|---|---|---|
| Flow | 0 | 6 | GREEN (post-fix) |
| Interaction | 0 | 6 | AMBER |
| Visual | 0 | 4 | AMBER |
| Copy | 0 (P0-1 fixed; Hebrew authorized) | 6 | GREEN |
| Accessibility | 0 | 9 | AMBER |

**Post-decision verdict: CONDITIONAL_SHIP** — zero open P0; P1 backlog scheduled as tranche 073.
Does not replace `/release-check` (git/lane safety) before any merge.
