#!/usr/bin/env node

// ---------------------------------------------------------------------------
// check-no-persona-in-urls.mjs
//
// CI guard added by Tranche A of portal-full-production-refactor (plan §C.1).
//
// Purpose: enforce that Next.js route-group parentheses
//   (admin), (operator), (planner), (ops), (planning), (inbox), (po),
//   (shared), (auth)
// NEVER appear inside user-facing URL strings. Route groups are a filesystem
// organization primitive only; they must not leak into href attributes,
// router.push calls, redirect targets, or doc URL strings.
//
// Behavior:
//   - Walks src/app/** and src/components/** .ts/.tsx files.
//   - Flags any string literal (single-quote, double-quote, or backtick)
//     that contains "(<persona>)/" where persona is one of the groups.
//   - Ignores .test.ts/.test.tsx and .spec.ts/.spec.tsx to keep fixture
//     assertions flexible if needed.
//   - Exit code 0 on clean; exit code 1 with diagnostic lines on hit.
//
// Note: this script deliberately uses a simple per-line regex rather than a
// full TS AST walk. The grep is broad (any string containing the token) —
// if a future edge case needs to whitelist a specific false positive, add
// an `// eslint-disable-next-line` or add it to IGNORE_PATHS below.
// ---------------------------------------------------------------------------

import { readdir, readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");

const SCAN_ROOTS = [
  join(ROOT, "src", "app"),
  join(ROOT, "src", "components"),
];

const FILE_EXTENSIONS = new Set([".ts", ".tsx"]);

const SKIP_DIRECTORIES = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
]);

const IGNORE_PATHS = new Set([
  // Reserved for future whitelist entries. Empty for now.
]);

const PERSONA_GROUPS = [
  "admin",
  "operator",
  "planner",
  "ops",
  "planning",
  "inbox",
  "po",
  "shared",
  "auth",
];

// Match route-group tokens of the form "(<persona>)/" embedded in a
// string literal (single-quote, double-quote, or backtick) or template
// expression. We look for the literal "(persona)/" — if we only saw
// "(persona)" we'd false-positive on destructuring and type casts.
const STRING_RE = /(['"`])([^'"`]*?\((admin|operator|planner|ops|planning|inbox|po|shared|auth)\)\/[^'"`]*?)\1/g;

// Additionally match bare `href="(persona)/"` just in case the string
// uses backslashes or other weirdness we didn't anticipate. Belt-and-
// suspenders — same failure mode.
const BARE_RE = new RegExp(
  `\\((${PERSONA_GROUPS.join("|")})\\)/`,
  "g",
);

/** @param {string} dir */
async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      yield* walk(join(dir, entry.name));
      continue;
    }
    if (!entry.isFile()) continue;
    const path = join(dir, entry.name);
    const ext = path.slice(path.lastIndexOf("."));
    if (!FILE_EXTENSIONS.has(ext)) continue;
    // Skip test + spec files
    if (
      path.endsWith(".test.ts") ||
      path.endsWith(".test.tsx") ||
      path.endsWith(".spec.ts") ||
      path.endsWith(".spec.tsx")
    )
      continue;
    if (IGNORE_PATHS.has(path)) continue;
    yield path;
  }
}

/** @param {string} path */
async function scanFile(path) {
  const text = await readFile(path, "utf8");
  const lines = text.split(/\r?\n/);
  /** @type {Array<{ path: string; line: number; text: string; }>} */
  const hits = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip lines that are pure line-comments (// …). Route-group tokens
    // are allowed in comments (e.g. referencing file paths in prose).
    const trimmed = line.trimStart();
    if (trimmed.startsWith("//")) continue;
    // Skip block-comment-ish lines (not perfect but good enough for noise).
    if (trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;

    STRING_RE.lastIndex = 0;
    BARE_RE.lastIndex = 0;
    if (STRING_RE.test(line) || BARE_RE.test(line)) {
      hits.push({ path, line: i + 1, text: line.trim() });
    }
  }
  return hits;
}

async function main() {
  /** @type {Array<{ path: string; line: number; text: string; }>} */
  const allHits = [];
  for (const root of SCAN_ROOTS) {
    for await (const path of walk(root)) {
      const hits = await scanFile(path);
      allHits.push(...hits);
    }
  }

  if (allHits.length === 0) {
    console.log("[check-no-persona-in-urls] OK — zero route-group leaks.");
    process.exit(0);
  }

  console.error(
    `[check-no-persona-in-urls] FAIL — found ${allHits.length} route-group leak(s) in URL strings:\n`,
  );
  for (const h of allHits) {
    // Print path relative to repo root for readability.
    const rel = h.path.startsWith(ROOT + sep)
      ? h.path.slice(ROOT.length + 1)
      : h.path;
    console.error(`  ${rel}:${h.line}  ${h.text}`);
  }
  console.error(
    "\nRoute-group parentheses are a filesystem organization primitive only. " +
      "They must never appear in href=, router.push(), or redirect targets. " +
      "If a link needs to reach a page inside a route group, use the domain-first URL " +
      "(e.g. /stock/receipts not /(ops)/stock/receipts).",
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("[check-no-persona-in-urls] internal error:", err);
  process.exit(2);
});
