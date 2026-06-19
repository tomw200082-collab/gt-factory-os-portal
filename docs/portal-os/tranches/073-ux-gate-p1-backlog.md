# Tranche 073 — UX release-gate P1 backlog

> **Status: PROPOSED (awaiting Tom approval).** Produced by `/ux-release-gate` on
> 2026-06-17 against PR #95 surfaces. P0-1 (raw `JSON.stringify` in the waste-adjustments
> error banner) was already fixed under the gate; the Hebrew-scope question was resolved
> by authorizing `/planning/procurement` + `/credit-tracking` in `CLAUDE.md`. Everything
> below is the verified P1 backlog — real, schedulable, none ship-blocking.

This is too large for one bounded commit set. Recommended execution as **four bounded
sub-batches** via `/portal-tranche-fix`, in value order. Each batch is independently
shippable and independently verifiable.

---

## Batch A — Stock-write safety (highest value: protects stock truth)
Add a confirm step + post-action feedback to irreversible ledger writes, matching the
existing waste-adjustments `confirmPending` pattern.

| ID | File | Change |
|---|---|---|
| INT-1 | `src/app/(planning)/planning/procurement/_components/FocusCard.tsx` | "Place PO" → inline confirm zone naming supplier + total before `placeMut.mutate`. |
| INT-2 | `src/app/(planning)/planning/procurement/_components/FocusCard.tsx` | "Skip" → one-step confirm + visible "Skipped — moved to next" feedback. |
| INT-5 | `src/app/(ops)/stock/receipts/page.tsx` | Apply the over-receipt two-step confirm to ALL receipts, not just over-receipts. |
| INT-6 | `src/app/(ops)/stock/physical-count/page.tsx` | Inline confirm before posting the count (item, qty, unit). |
| INT-7 | `src/app/(admin)/admin/masters/components/[component_id]/page.tsx` | "Promote to primary" → add `disabled={isPending}` + use existing `useConfirm`. |

## Batch B — Copy hygiene (enum/jargon/status leaks)
| ID | File | Change |
|---|---|---|
| COPY-7 | `src/app/(po)/purchase-orders/new/page.tsx:524` | `"Status: OPEN…"` → `"Now open. Add receipts when goods arrive."` |
| COPY-8 | `src/app/(po)/purchase-orders/[po_id]/page.tsx:1539` | Collapse redundant double "cancelled" copy into one actionable line. |
| COPY-9 | `src/app/(planning)/planning/inventory-flow/[itemId]/page.tsx:269,307` | Humanise raw `{status}` enums via a display map. |
| COPY-10 | `src/app/(ops)/stock/production-actual/page.tsx:489` | Drop raw reason-code fallback → plain English. |
| COPY-11 | `src/app/(ops)/stock/physical-count/page.tsx:474` | "snapshot" jargon → "Could not start the count…". |
| COPY-12 | `src/app/(planning)/planning/inventory-flow/[itemId]/page.tsx:242` | "No LionWheel orders" → "No open customer orders". |
| COPY-6 | `src/app/(shared)/credit-tracking/page.tsx:213` | Raw API path + status in thrown Error → plain English. |

## Batch C — Visual tokens & missing classes
> **Gate note:** VIS-1/VIS-2 require editing `globals.css`, which `portal-production-executor`
> is normally forbidden from. Needs explicit Tom authorization, or routing to whoever owns
> the design-system layer. Listed here so it isn't lost.

| ID | File | Change |
|---|---|---|
| VIS-1 | `src/app/globals.css` | Define `.btn-accent` (alias of `.btn-primary`; used on 20+ CTAs but undefined → renders as base `.btn`). |
| VIS-2 | `src/app/globals.css` | Define `.input-sm` (`h-7 px-2 text-xs`; PO inline-edit inputs render full-height). |
| VIS-3 | `src/app/(shared)/credit-tracking/page.tsx:526,632` | `text-destructive` (undefined) → `text-danger-fg`. |
| VIS-4 | waste-adjustments, receipts, production-actual (see audit lines) | `text-white` → `text-accent-fg` / `text-fg-inverted`. |
| VIS-5 | procurement, PO new, PO detail (see audit lines) | `bg-danger/5` → `bg-danger-softer` (token, dark-mode-correct). |

## Batch D — Accessibility (WCAG AA gaps)
| ID | File | Change |
|---|---|---|
| A11Y-1 | `src/app/(ops)/stock/waste-adjustments/page.tsx` | Associate quantity input + notes textarea with real `<label htmlFor>` (item field already has `ariaLabel`). |
| A11Y-2 | `src/app/(po)/purchase-orders/[po_id]/page.tsx` | Add `htmlFor`/`aria-label` to inline line-edit + overview-edit inputs. |
| A11Y-3 | `src/components/purchase-orders/PoLineEditor.tsx` | `aria-describedby` + `role="alert"` on per-line validation errors. |
| A11Y-4 | `src/app/(po)/purchase-orders/[po_id]/page.tsx:1017` | Line-cancel Yes/No → ≥44px touch targets. |
| A11Y-5 | `src/app/(po)/purchase-orders/[po_id]/page.tsx:999` | `aria-label="Edit line {n}"` / `"Cancel line {n}"`. |
| A11Y-6 | `src/app/(po)/purchase-orders/[po_id]/page.tsx:256` | `aria-label` on the `progressbar`. |
| A11Y-7 | `src/app/(planning)/planning/inventory-flow/[itemId]/page.tsx:219` | Tab ARIA semantics (`role=tablist/tab/tabpanel`, `aria-selected`). |
| A11Y-8 | waste-adjustments + physical-count | `required`/`aria-required` on mandatory inputs. |
| A11Y-9 | `src/app/(ops)/stock/physical-count/page.tsx:185` | Step-indicator complete-state text alternative. |

## Deferred / not in scope
- **FLOW-2** (procurement fallback link loop) — dead code (`onOpen` always passed); harden opportunistically.
- **FLOW-3** (null `po_id` post-place dead-end), **FLOW-4/INT-4** (new-PO cancel data loss), **FLOW-10** (supply-tab → PO link), **FLOW-12** (approval forward link), **FLOW-13** (activity empty-state copy) — flow-nav polish; fold into Batch A or B when touched.

## Verification (each batch)
`npm run typecheck` (0) · `vitest` green · `playwright` green on the batch's critical path ·
no `portal-regression-guard` violations · scorecard delta recorded.
