# Portal UX Standard — Working Rules

**Locked 2026-04-30 (Gate 4.2)** by Tom directive. Applies to every surface in the canonical portal (`gt-factory-os-portal` repo, this codebase).

This is a working rule, not a design manifesto. Future screens that drift from these standards should be normalized in a focused tranche, not allowed to ship.

## 1. Language

- **English only** in user-facing UI.
- **Plain operational English.** Avoid technical jargon, enterprise-sounding labels, or system-internal terms.
- A planner / operator / admin should understand every label in seconds without context.

### Standard term lexicon

Use these terms verbatim where applicable; do not rename them per surface.

| Concept | Use | Avoid |
|---|---|---|
| The product being produced | `Product` | item, sku, item_id |
| Quantity intended | `Planned quantity` | qty, planned_qty |
| Quantity actually produced | `Produced quantity` | output_qty, actual qty |
| The day a plan applies to | `Production day` | plan_date, plan day |
| A plan that has not run yet | `Planned` | open, pending |
| A plan whose actual report has been filed | `Completed` | done, finished, closed |
| A plan that was not executed | `Cancelled` | dismissed, rejected |
| A plan blocked by a missing input | `Blocked` | error, fail |
| A plan likely to slip | `At Risk` | warning, caution |
| Last completed planning run | `Last Planning Run` | latest run, run history tip |
| Last inventory event posted | `Last Inventory Update` | last ledger event |
| The form that posts inventory truth | `Production Report` | production actual, ledger event |
| The action that opens that form | `Open Production Report` | submit actual, run actual |
| Cancel a plan | `Cancel Plan` | dismiss plan, void plan |
| Reason field on cancel | `Reason for Cancellation` | reason_code, cancel_reason |
| A planning recommendation | `Production recommendation` / `Purchase recommendation` | rec, recommendation_id |
| Adding a planning rec to a plan | `Add from Recommendations` | import rec, attach rec |
| Manual entry path | `Add Manually` | manual create, custom plan |

### Forbidden in primary UI

- Raw `item_id`, `bom_version_id`, `recommendation_id`, or any UUID
- `JSON.stringify(body)` of an error response
- Raw enum names (e.g. `BOUGHT_FINISHED`, `PRODUCTION_PLAN_LINKED_ACTUAL`, `PLAN_NOT_EDITABLE`)
- API path names (`/api/v1/mutations/...`)
- Handler / mutation language (`mutate`, `dispatch`, `payload`)
- SQL fragments
- Hebrew strings in operator-facing copy (data values like supplier names are fine)

### Allowed in admin/dev surfaces

The forbidden list above applies to operator/planner/admin **operational** UI. Admin debug expansions, change-log raw views, and explicit "developer / system internals" surfaces may include raw fields — but they must be visually segregated and labeled as such.

## 2. Direction

- **LTR only.** No `dir="rtl"` anywhere on operational surfaces.
- Buttons and icons follow LTR placement: primary action on the right, secondary on the left.
- Modals and form layouts read top-to-bottom, left-to-right.
- Hebrew data values inside an LTR layout are wrapped in `<bdi>` to keep numbers and punctuation in the right order.
- New components should set `dir="ltr"` explicitly at the wrapper level when there is any chance of inheriting RTL from a parent.

## 3. State hygiene

A surface must show **exactly one** primary state at any time:

| State | Trigger | Show |
|---|---|---|
| Loading | request in flight, no prior data | skeleton blocks; do NOT show counts, chips, or empty messages |
| Error | request failed, no usable data | one inline error block with actionable copy + retry; do NOT show "0 X" counts |
| Empty | request succeeded, zero rows | one empty-state message + primary CTA(s) |
| Loaded | request succeeded, rows present | the data view |

Header summary chips (e.g. "0 planned", "5 completed") must be **gated on `query.data !== undefined && !query.isError`**. They never appear during loading or error.

Inline mutation errors (e.g. "couldn't save this plan") may appear alongside loaded data — those are localized errors, not full-page error states.

### Empty-state copy template

> No [thing] yet for this [scope].
> You can [primary action] or [secondary action].

### Error-state copy template

> We couldn't load the [thing].
> Try refreshing the page. If the problem continues, contact the system administrator.

### Loading state

Skeleton blocks of the right approximate shape (day cards, table rows, etc.). Never a blank page. Never a loading spinner alone on a wide surface.

## 4. Status semantics

Use one chip vocabulary across the corridor:

| State | Color/tone | Label |
|---|---|---|
| Planned (intent only) | info / blue | `Planned` |
| Done (actually produced) | success / green | `Completed` |
| Cancelled | neutral / grey | `Cancelled` |
| Blocked | warning / amber | `Blocked` |
| At risk | warning / amber | `At Risk` |
| Failed | danger / red | `Failed` |

Color alone is never the only signal — the textual label must always accompany the chip.

## 5. Planned vs actual

The hardest mistake: implying that planned production is real inventory.

- Plan rows always carry the `Planned Only — inventory will update only after actual production is reported.` banner at the top of the surface (non-dismissible).
- Plan-related counts say `planned`, never `produced` or `in stock`.
- Variance display only appears when `rendered_state === 'done'` (a plan with a linked actual).
- Cancellation flows include explicit copy: `Cancelling a plan does not change inventory.`
- Inventory-flow planned-overlay (Gate 5b) must use a visually distinct marker (dashed line, faint chip) labeled `Planned`, never blended into the actual stock line.

## 6. Source / freshness

Every decision-impacting number must show its source or explicitly say it isn't available.

Surface formats:
- `Stock at run time — 3h ago`
- `Lead time — supplier default (14 days)`
- `Forecast source — version published Apr 28, 2026`
- `Source unavailable` (when the API doesn't expose the field; flag as W1 backlog item)

Never fabricate a source label.

## 7. Mobile

- 390px is first-class. Every operational surface tested at this width.
- No horizontal scroll on data surfaces.
- Modals slide from the bottom (`flex items-end sm:items-center`).
- Primary actions reachable inline (not behind horizontal scroll, not below-fold without indication).
- Touch targets ≥ 32×32px. Edit/cancel buttons spaced ≥ 8px apart for fat-finger safety.
- Long English labels wrap rather than truncate where possible.

## 8. Button naming

- Primary actions use Title Case sentence-fragment imperatives: `Add Manually`, `Open Production Report`, `Cancel Plan`.
- Secondary/cancel actions use sentence case: `Cancel`, `Back`, `Close`.
- Confirmation buttons mirror the action verb: cancel modal's confirm button is `Cancel plan`, not `OK`.
- Disabled buttons explain why via `title=` tooltip.

## 9. Banner conventions

- **Info banner** (always-visible context, like "Planned Only"): `border-info/40 bg-info-softer`, AlertCircle icon, headline + sub.
- **Warning banner** (transitional state, e.g. "older planning run"): `border-warning/30 bg-warning-softer`, AlertTriangle icon.
- **Error banner** (full-page failure): `border-danger/40 bg-danger-softer`, XCircle icon.
- Toast for transient feedback: bottom-anchored, auto-dismiss 4.5s, includes Close button.

## 10. Drift control

When you touch any surface:
- Normalize it to this standard, even if the change you're making is small.
- If a surface is fully out-of-standard and would require a wholesale rewrite, log it in the Portal Language/Direction Audit List rather than expanding scope.
- Add a brief comment block at the top of new files indicating the standard applies.

## Reference

- Audit list of in-flight violations: `docs/portal_language_direction_audit.md`.
- Original Tom directive: 2026-04-30 Gate 4.2 message.
