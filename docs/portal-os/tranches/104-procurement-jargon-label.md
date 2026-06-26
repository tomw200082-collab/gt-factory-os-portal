# Tranche 104: procurement add-line jargon label (§1)

status: in-progress
created: 2026-06-26
scorecard_target_category: planning_surface / data_truthfulness
expected_delta: 0 (copy correctness — removes internal jargon from a planner surface)
sizing: XS (1 file; no backend)
source: /portal-audit interaction-design-specialist on /planning/procurement (2026-06-26)

## Why
**INTER-010** — the inline add-line form in the procurement focus card rendered
the raw internal `selected.kind` ("item" / "component") as visible meta text. Per
portal_ux_standard §1, internal enum strings must not surface in operator UI.

## Landed
- `AddLineForm.tsx` — `{selected.kind}` → mapped Hebrew label
  (`component → "רכיב"`, `item → "פריט"`) on this authorized Hebrew/RTL surface.
  Dropped the `uppercase` class (no-op on Hebrew, was for the code-like enum).

## Rejected finding (verified false)
- **INTER-011** (auditor proposed disabling the "הבא" / next button at the last
  queue position) — REVERTED. The two FocusMode unit tests (M4 "paging past the
  end shows the completion screen", M6 "continue to remaining") prove that
  clicking next at the last position **intentionally advances to the done
  screen** — that is how the planner finishes the walk-through, not a bug. The
  prev/next asymmetry is by design. "Green before AND after" caught this:
  disabling next broke both tests. Left as-is.

## Scope (manifest)
manifest:
  - src/app/(planning)/planning/procurement/_components/AddLineForm.tsx
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/104-procurement-jargon-label.md
  - docs/portal-os/tranches/_active.txt

## Verification
- tsc 0 · eslint 0 · vitest 790/790.

## Procurement audit — remaining (triaged)
- **INTER-002** (place-PO confirmation) + **INTER-003** (skip confirmation) —
  HELD for Tom with the confirm-panel family (add friction to primary
  money-facing actions).
- **INTER-004** (P0 — Escape/× discards unsaved line edits silently) — dedicated
  follow-up tranche (cross-component FocusCard↔FocusMode plumbing; e2e-sensitive).
- **INTER-005** (invalid qty silently reverts on save), **INTER-008** (stale
  cross-mutation error) — follow-up.
- **INTER-006** (date min), **INTER-009** (busy-scope) — minor polish follow-up.

## Checklist
- [x] INTER-010 jargon label · INTER-011 verified false (reverted)
- [ ] Tom review / merge · follow-up: INTER-004 unsaved-edit guard
