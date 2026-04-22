# Portal OS — Migration history

## 2026-04-22 — OS bootstrap (narrow merge)

The Portal Improvement OS was bootstrapped onto `main` via a narrow merge from PR #3 (`claude/audit-all-VuctU`).

### What was imported from PR #3 (✅ present on main)

- `.claude/` — Portal OS infrastructure (commands, agents, hooks, settings)
- `.github/workflows/` — @claude handler + PR guard + weekly drift cron
- `CLAUDE.md` — thin pointer
- `docs/portal-os/audit-reports/` — two audit reports from 2026-04-22 (baseline + re-audit) describing the portal as it existed on the PR #3 branch
- `docs/portal-os/backend-package-admin-superuser-depth.md` — 5-deliverable package describing how to move `admin_superuser_depth` to 10/10 (backend-blocked work; still relevant)
- `docs/portal-os/tranches/001-*.md` through `019-*.md` — tranche plan files documenting 19 proposed improvements

### What was NOT imported (deliberately excluded)

- **All `src/` changes from tranches 001-019.** These were authored on PR #3's branch which was based on Tranche A (pre-B/C/D/E). Main has since advanced through Tranches B/C/D/E which reorganized the same files. Applying PR #3's src/ changes on top of main caused typecheck failures (cascading API rename conflicts). The tranche plans remain as documentation; their src implementations are discarded.

### What was reset to blank

- `scorecard.json` + `scorecard.md` — reset to `unscored` (PR #3's 86/100 was measured against PR #3's branch state, NOT main; would be a truth lie if carried over).
- `route-manifest.json` — reset to bootstrap template (PR #3's manifest used old URLs like `/admin/boms` which main replaced with `/admin/masters/boms`).
- `baseline.json` — reset to bootstrap template (anchor_sha will be set by first `/portal-audit` run on main).
- `quarantine.json` — reset to bootstrap template (empty entries + standard forbidden_strings).

### What happens next (required first action after merge)

Run `/portal-audit all` on main to produce:
1. A fresh audit report reflecting main's current state (post-Tranche-E).
2. A fresh scorecard reflecting main's actual current score.
3. A new baseline anchored at current `main` HEAD.

After that first audit, the tranche plans 001-019 can be reviewed against the fresh audit. Some may already be obsolete (their described problems fixed by main's Tranches B/C/D/E). Others may still be valid — those can be re-applied as NEW tranches against current main via `/portal-tranche-plan <focus>`.

### Decision trail (for later reconciliation)

- PR #3 was never merged intact because of 7 src/ conflicts with main's Tranches B/C/D/E.
- Resolving with "keep main" on all 7 conflicts exposed 23 non-conflicting PR #3 src/ files that would have been pulled in.
- Those 23 files included a cross-cutting `FakeSession → DevShimSession` rename (tranche 002) + a MobileNav component (tranche 008) that depended on PR #3's SideNav API (which we discarded).
- Typecheck failed with cascading errors. This narrow-merge path was chosen as the minimum-risk way to install the OS without destabilizing main's portal code.
- Tom's mobile work is preserved in: (a) the Portal OS infrastructure itself, (b) the 19 tranche plans as specification documents, (c) the two audit reports + backend package as historical analysis.

last_reviewed: 2026-04-22
