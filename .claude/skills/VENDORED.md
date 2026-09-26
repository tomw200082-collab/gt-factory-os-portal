# Vendored third-party skills — portal

Copied in from public upstream repositories. `impeccable` (tranche 162,
2026-08-17) and `apple-design` (2026-08-25) came first; the ten interface-rules
skills below landed 2026-08-26 at Tom's direction.

These are **local tooling, not portal source**. They ship no runtime code, are
excluded from the build, and change nothing about the lane boundary in
`CLAUDE.md`: the portal still may not author backend contracts, schema, or
integrations, and every change still belongs to exactly one tranche.

The workspace-wide provenance ledger lives at
`gt-factory-os-production-brain/.claude/skills/VENDORED.md`. This file covers
the portal copies and the routing question they create.

| Upstream | Commit | License | Skills |
|---|---|---|---|
| [jakubkrehel/skills](https://github.com/jakubkrehel/skills), via [boraoztunc/skills](https://github.com/boraoztunc/skills) | `645553c` (2026-08-15) | MIT — `LICENSE-jakubkrehel`, `NOTICE-jakubkrehel.md` | `better-ui`, `better-typography`, `better-colors`, `better-accessibility`, `better-layout`, `better-writing`, `better-interface`, `interface-review` |
| [boraoztunc/skills](https://github.com/boraoztunc/skills) | `645553c` (2026-08-15) | MIT (README only — no root `LICENSE`) | `web-design-guidelines` |

## Which one to reach for

Thirteen skills in this directory can answer "review this UI". They are not
interchangeable. Pick by the question you are actually asking:

| Question | Skill |
|---|---|
| Is this **exact value** right? (radius, contrast ratio, target size, line height, breakpoint) | the `better-*` domain that owns it |
| Review the **whole screen**, every domain at once | `better-interface` — the orchestrator, routes to all six domains and returns one ranked verdict |
| Review a **change**, not a screen — uncommitted work, a branch, a PR | `interface-review` — reads the `-` side of hunks for regressions. User-invoked only |
| Does this **feel** right? Taste, polish, aesthetic direction | `apple-design`, `impeccable`, `frontend-design` |
| Generic best-practice sweep of UI code | `web-design-guidelines` |

The rule of thumb from the brain ledger holds: the `better-*` set is for **rules
with exact numbers**; `impeccable`, `apple-design` and `frontend-design` are for
**taste and philosophy**. They answer different questions and are meant to
coexist. `apple-design` remains the one that cites a written rule per finding —
reach for it when a review needs to be defensible, not just opinionated.

The six `better-*` domains declare their boundaries and hand off rather than
overlap: typography defers contrast to colors, accessibility defers remediation
to colors, UI defers grouping to layout.

## Notes before use

- **`better-layout` covers RTL directly** — logical properties, layout
  direction, safe areas. That is exactly the Hebrew + `dir="rtl"` surface list
  in `CLAUDE.md` (`/planning/procurement`, `/credit-tracking`,
  `/purchase-orders/placement-queue`, the `/apps` sales group, the
  Recipe-Health corridor, `/home` viewer role). Pair it with
  `apple-design`'s `references/hig/right-to-left.md`.
- **`better-writing` and the portal UX standard can disagree.** `better-writing`
  is generic product microcopy; `docs/portal-os/portal_ux_standard.md` is the
  Tom-approved standard for this portal, written by `ux-content-state-designer`,
  and it wins. Neither this skill nor any other here may edit that file.
- **`better-typography` and `better-colors` reference Tailwind v4 syntax in
  places** (`@theme`, `oklch` tokens). **This portal is on Tailwind `^3.4.14`.**
  Translate before applying, and do not let a finding push a v4 migration in
  through a review. The upstream `tailwind-v4` skill was **deliberately not
  vendored** for this reason.
- **`web-design-guidelines` declares no licence of its own** and names no
  upstream author. It is covered only by the re-publisher's README `MIT`, and
  that repo ships no root `LICENSE`. Weakest provenance in this table. Internal
  use only.
- **These skills report; they do not get to edit.** Findings still go through a
  tranche: scoped in the manifest, evidence path attached, `portal-pr-guard`
  green. A skill finding is not a licence to touch files outside the active
  tranche.
- **Anything user-visible still needs a UX handoff packet**, and Hebrew copy
  still needs a Tom-approved register entry. A `better-writing` suggestion does
  not substitute for either.

## 2026-09-26 — workspace ledger, Layer 1

- **Removed:** `canvas-design` (nothing referenced it, and it was 83 files and 5.4 MB of fonts) and `vercel-react-best-practices` (nothing used it).
- **Shortened descriptions:** nine descriptions were cut to 300 characters or less so the whole skill listing fits the per-session budget: `ui-ux-pro-max`, `impeccable`, `apple-design`, `better-typography`, `better-accessibility`, `better-colors`, `better-layout`, `better-ui`, `better-writing`. The skill bodies are unchanged.
- **Only copies now:** the portal's `apple-design` and `frontend-design` are the only copies in the workspace; the brain's identical copies were removed. Their provenance:
  - `apple-design` was cloned from `dickwu/apple-design-skill` at `d0bac1e`. Upstream ships no `LICENSE`, and the content is Apple's Human Interface Guidelines rewritten, so it is for internal design review only; do not redistribute it.
  - `frontend-design` was supplied by Tom on 2026-08-05. Its frontmatter points at a `LICENSE.txt` that never came with it.

## Updating

Re-clone upstream and copy `<name>/` over the local directory. No lockfile, no
auto-update. `.gitignore` excludes `.claude/skills/*` and re-includes each
vendored directory by name — **a new skill needs a new `!` line or it will be
silently ignored.**
