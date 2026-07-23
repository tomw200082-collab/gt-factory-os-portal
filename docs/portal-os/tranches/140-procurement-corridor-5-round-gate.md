# Tranche 140 — Procurement corridor: 5-round /ux-release-gate audit-and-fix loop

**Status:** in progress
**Origin:** Tom-directed (2026-07-23 chat, after tranche-134-follow-on base-batch work): `/ux-release-gate` + `/frontend-design` + `/ui-ux-pro-max` — "תעבור שוב על הדף הזה ועל כל התהליך ותשפר כל מה שאתה מוצא לנכון. תעשה 5 איטרציות כאלה על כל תהליך הרכש מקצה לקצה" (go over this again and improve whatever you see fit; do 5 such iterations across the entire procurement process end to end).
**Scope:** the full procurement corridor — recommendation → weekly purchase session → PO approval → office-manager placement:
- `/planning/procurement` + `[session_po_id]/sheet` (`_components/*`, `_lib/*`)
- `/planning/purchase-session` (`_lib/*`)
- `/planning/purchase-calendar` (`_lib/*`)
- `/purchase-orders`, `/purchase-orders/new`, `/purchase-orders/[po_id]`
- `/purchase-orders/placement-queue` (`_components/*`, `_lib/*`)

Out of scope (explicit boundary, not silently dropped): `/stock/receipts` (goods receipt against a PO — a separate corridor with its own tranche 137), backend/schema/contract changes (portal lane only), and the Hebrew/RTL doctrine itself on `/planning/procurement` and `/purchase-orders/placement-queue` (locked exception, CLAUDE.md) — findings that would "fix" Hebrew to English are out of bounds; only content/flow/visual/a11y quality within the Hebrew surface is in scope.

**Departure from the read-only gate default:** `/ux-release-gate` is normally report-only (its own spec: "Not usable for: ... editing portal code to fix findings"). Tom's instruction this run explicitly directs applying fixes between audit rounds — a 5-round audit → fix → verify loop, not a single report. The five UX agents stay read-only per their tool grants; all fixes are applied by the orchestrating session directly, matching how the agents' `Edit`/`Write`-less tool sets are configured.

## Round log

(filled in per round as it completes — findings closed, evidence, deferred items)

## Files

(finalized at tranche close — every source file touched across all 5 rounds)

## Evidence

(finalized at tranche close — tsc/eslint/vitest/playwright per round + cumulative)
