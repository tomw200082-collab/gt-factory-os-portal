# Tranche 207 — A lead note keeps focus while typing

**Status:** in progress on `claude/lead-note-focus`.
**Origin:** Tom, 2026-10-03. When adding a note to a lead, one letter can be typed and then the field stops taking input until it is tapped again. He asked to verify the exact cause first. It was verified, and he approved the fix ("תתקן").

## Before

The lead drawer's Escape and Tab-trap effect also moved focus to the drawer panel, and it ran again whenever `dirty` changed. The first letter of a note flips `dirty` from false to true, so the effect pulled focus out of the note. A throwaway test confirmed it: focus moved from the textarea to `.s-drawer-panel` after the first letter.

## Change

- The panel takes focus only when the drawer opens, or when it stops being suspended. Typing never moves focus.
- Escape still asks before closing over an unsaved note. The keydown handler reads the dirty state and `onClose` through refs, so it no longer needs to re-run.

## Manifest

manifest:
  - docs/portal-os/tranches/207-lead-note-focus.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md
  - src/app/(sales)/_components/LeadDrawer.tsx
  - tests/unit/sales/leads.test.tsx

## Gates

- A red-first unit test: focus stays in the note after the first and second letter.
- The existing drawer tests stay green, including Escape asking before discarding a typed note.
- tsc, the full vitest, and the sales @mocked e2e.

## Rollback

Revert the squash commit. There is no data, API or copy change.
