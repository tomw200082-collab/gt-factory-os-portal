# Tranche 073 — planning P0 clears (contained set)

status: implemented (branch `claude/planning-pages-uxui-testing-pyyurn`; Tom merges)
source: planning UX/UI audit (2026-06-14) + `/ux-release-gate` HOLD verdict.
Clears the contained P0 blockers (the larger `/planning/boms` mock-data strip is
its own tranche). No DB/backend/token edits.

## Changes
- INTER-001 — `/planning/production-plan` "Move to tomorrow" `window.confirm()` →
  shared `useConfirm()` dialog (the last window.confirm in planning).
- COPY-002 — `/planning/production-plan` raw `Reference: HTTP {status}` →
  "If this continues, contact your system administrator."
- INTER-005 — `/planning/forecast` filter-tab count chips gated on
  `query.data !== undefined && !isError` (no "0" during load).
- COPY-005 — `/planning/inventory-flow/supply` Hebrew filter labels
  ("קבוצת חומר" / "לפי קו מוצר") → English ("Material group" / "Used by product
  line"); this surface is NOT in the Hebrew exception (only procurement is).
- COPY-023/024 — infrastructure jargon removed from operator error/loading copy
  on inventory-flow + supply ("Railway logs", "stack trace", "SQL pass",
  "Endpoint missing", "ping the backend deploy", "cold-start"/"warm cache",
  "API service", "FG", "bought-finished item") → plain operator English.
- COPY-003 — `/planning/production-simulation` raw BOM head ID removed from the
  blocked-recipe message.
- COPY-004 / COPY-046 — raw supply-method enum (`MANUFACTURED`/`BOUGHT_FINISHED`)
  → human labels; "PACK recipe"/"BASE recipe" → "Packaging recipe"/"Liquid
  recipe".

## Verification
tsc --noEmit clean · vitest 677/677 · next build OK · eslint 0 errors.

## Remaining for SHIP (next tranches)
`/planning/boms` mock-data → honest empty states (decision delegated to Claude);
a11y pack (tablist arrow-keys, MonthlyGrid role=grid, ManualAddModal
Escape+labelledby, publish/toast live regions, scope=col, skip-link); residual
visual token/table/chip drift and COPY P1 abbreviations/status-terms.
