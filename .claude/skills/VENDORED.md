# Vendored third-party skills — portal

Skill directories under `.claude/skills/` copied in from outside this repo.
They are **not** portal OS artifacts. Nothing here is authority: the portal's
design authority remains `docs/portal_ux_standard.md`, the
`visual-system-designer` agent, and the invariants in `CLAUDE.md`. A skill that
disagrees with the UX standard loses.

## Ledger

| Upstream | License | Skills | Added |
|---|---|---|---|
| [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) | MIT | `redesign-existing-projects`, `full-output-enforcement` | 2026-08-09 |
| Anthropic | Apache-2.0 (`LICENSE.txt` shipped) | `canvas-design` | pre-existing |
| Anthropic (supplied by Tom) | unresolved — see note | `frontend-design` | pre-existing |
| `uipro` CLI (`uipro init --ai claude`) | not recorded | `ui-ux-pro-max` | pre-existing |

`frontend-design` is byte-identical to
`gt-factory-os-production-brain/.claude/skills/frontend-design/`; the dangling
licence reference is documented in that repo's `VENDORED.md`. `ui-ux-pro-max`
predates this ledger; its installer is named in the `.gitignore` comment at
line 24, but its licence was never recorded — **UNRESOLVED**, left open rather
than guessed.

## `.gitignore` note

Root `.gitignore` previously ignored `.claude/skills/`, on the stated grounds
that skill artefacts were "local tooling, not portal source — don't ship them".
That rule had stopped matching reality: `canvas-design`, `frontend-design`, and
`ui-ux-pro-max` were all tracked, so the skills were already being shipped. Its
only live effect was that new skills went missing from git in silence unless
force-added, and a `git clean -X` would have deleted every untracked one without
warning.

The rule was removed (Tom, 2026-08-09). `design-system/` stays ignored — that
one really is regenerated `uipro` output.

## Why only 2 of the 13 taste-skill skills

The full 13-skill pack lives in
`gt-factory-os-production-brain/.claude/skills/`, which is where non-portal
visual work happens (marketing, brand, decks, catalogs, landing pages). Only
these two were mirrored here:

- **`redesign-existing-projects`** — audit-first, framework-agnostic, explicitly
  "without breaking functionality". The portal is entirely existing code; this
  is the only skill in the pack built for that situation.
- **`full-output-enforcement`** — an anti-truncation rule, not a design skill.
  It carries no aesthetic opinion, so it cannot collide with the UX standard.

Deliberately **not** mirrored here:

| Skill | Why not |
|---|---|
| `design-taste-frontend`, `design-taste-frontend-v1` | Self-scoped: "Landing pages, portfolios, and redesigns. Not dashboards, not data tables, not multi-step product UI." That describes this portal exactly. |
| `high-end-visual-design`, `minimalist-ui`, `industrial-brutalist-ui` | Three contradictory aesthetic mandates over type scale, palette, and motion. `docs/portal_ux_standard.md` and `visual-system-designer` already own that decision, and `portal-production-executor` is barred from editing `portal_ux_standard.md`, `tailwind.config.ts`, and `globals.css` — which is precisely where these push. |
| `gpt-taste` | Written for GPT/Codex; mandates GSAP, which the portal does not use. |
| `stitch-design-taste` | Targets Google Stitch, not a tool in this workspace. |
| `image-to-code` | Written for Codex; image-first landing-page pipeline. |
| `imagegen-frontend-web`, `imagegen-frontend-mobile`, `brandkit` | Image generation only, no code output. Marketing work → brain. |

If a portal aesthetic change is actually wanted, that is a
`visual-system-designer` decision plus a tranche — not a vendored skill applied
ad hoc.

## Constraints on use

- Both skills are **subordinate to `docs/portal_ux_standard.md`**. On any
  conflict, the standard wins and the skill is dropped.
- Neither may be used to justify edits to `docs/portal_ux_standard.md`,
  `tailwind.config.ts`, or `globals.css`.
- Neither accounts for RTL or Hebrew. The Hebrew surfaces enumerated in
  `CLAUDE.md` are outside what these skills understand.
- Normal portal rules still apply: one tranche per change, evidence path on every
  "done" claim.

## Updating

Re-clone upstream and copy over the local directory. There is no lockfile or
auto-update.

Do **not** use `npx skills add` — it installs to the container's global
`~/.claude/skills`, which is ephemeral and lost on session restart.

`taste-skill` upstream directory names do not match the `name:` in their
frontmatter, and this workspace requires directory == skill name:

| upstream `skills/` dir | local dir |
|---|---|
| `redesign-skill` | `redesign-existing-projects` |
| `output-skill` | `full-output-enforcement` |

## License

`taste-skill` is MIT, Copyright (c) 2026 Leonxlnx. MIT permits this
redistribution provided the copyright and permission notice are retained; the
full text is in the upstream repository's `LICENSE`.
