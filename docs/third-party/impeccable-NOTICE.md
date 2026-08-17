# Third-party notice — impeccable

- Package: `impeccable` v3.6.0 (npm)
- License: Apache-2.0
- Vendored: 2026-08-17 into `.claude/skills/impeccable/` via
  `npx --yes impeccable@3.6.0 install -y --providers=claude --scope=project`
- Role: development-time design tooling only. Not a runtime dependency; nothing from it
  ships in the portal bundle.
- Upstream: https://www.npmjs.com/package/impeccable

The vendored copy is committed deliberately (tranche 162, masterprompt 2026-08-17 §3.4)
so every session runs the same pinned version. `.gitignore` excludes the *contents* of
`.claude/skills/` and re-includes this one directory — git cannot re-include a path whose
parent directory is itself excluded.

The installer's `PostToolUse` / `Stop` hooks were merged into the committed
`.claude/settings.json`; the generated `.claude/settings.local.json` was removed so the
portal keeps a single hook manifest.
