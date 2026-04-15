import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// T3 — Forbidden-values drift canary.
//
// Phase A brief §6 T3 regression anchor.
//
// Scans every .ts / .tsx file under src/ for string literals that were
// part of the pre-Phase-A stale-contracts world. Each forbidden pattern
// has a short explanation so a future reader knows WHY it is forbidden.
//
// Two safeguards against false positives:
//
//   1. Source text is stripped of `//`-line comments and `/* */`
//      block comments before scanning. That way the canary does not
//      flag documentation comments that legitimately mention removed
//      types (e.g. "the pre-Phase-A draft had `kind: ItemKind`").
//
//   2. A per-pattern exception list names files that legitimately
//      carry a matching word for a different reason. Currently only
//      the ForecastVersionDto in forecast.ts has `version_number:
//      number` as a legitimate operational-DTO field; BomVersionDto
//      on the BOM side has been reshaped to `version_label: text`.
// ---------------------------------------------------------------------------

interface ForbiddenPattern {
  id: string;
  pattern: RegExp;
  reason: string;
  /** Files (relative to project root) that legitimately contain a
   *  match for an unrelated reason. Use sparingly. */
  allowedIn?: string[];
}

const FORBIDDEN_PATTERNS: ForbiddenPattern[] = [
  {
    id: "supply_method_MAKE",
    pattern: /"MAKE"\s*as\s*const|supply_method:\s*"MAKE"|['"]MAKE['"]\s*,\s*['"]BOUGHT['"]/,
    reason:
      "'MAKE' is the pre-Phase-A supply_method; locked schema uses 'MANUFACTURED'.",
  },
  {
    id: "supply_method_BOUGHT_bare",
    // Match '"BOUGHT"' (closing quote followed immediately) to avoid
    // the string literal "BOUGHT_FINISHED". The closing-quote form is
    // what matters — pre-Phase-A had BOTH 'MAKE' and 'BOUGHT' as
    // bare enum values.
    pattern: /['"]BOUGHT['"]/,
    reason:
      "Bare 'BOUGHT' (not 'BOUGHT_FINISHED') is the pre-Phase-A supply_method; locked schema uses 'BOUGHT_FINISHED'.",
  },
  {
    id: "item_kinds",
    pattern: /ITEM_KINDS|\bItemKind\b/,
    reason:
      "ITEM_KINDS was a pre-Phase-A axis that conflated item / component / packaging / raw_material. The locked schema models items and components as separate tables; no unified kind enum.",
  },
  {
    id: "item_kind_values",
    pattern: /['"]finished_good['"]|['"]raw_material['"]/,
    reason:
      "'finished_good' and 'raw_material' are ItemKind values; see the item_kinds pattern above.",
  },
  {
    id: "bom_version_retired",
    // Phase A BomVersionStatus is DRAFT/ACTIVE/ARCHIVED. A naked
    // "retired" literal appearing as a typed constant is the pre-
    // Phase-A terminal state. The narrower guard avoids false
    // positives on the English word "retired" in prose (e.g.
    // "historical rows are retired") after comment stripping.
    pattern: /['"]retired['"]\s*as\s*const/,
    reason:
      "'retired' as const is the pre-Phase-A BOM version terminal state; locked schema uses 'ARCHIVED'.",
  },
  // Note: BomVersionDto's version_label vs version_number drift and
  // BomLineDto's quantity_per / scrap_factor drift are NOT scanned
  // by this canary. They are structural DTO changes, already pinned
  // by the T2 DTO-shape smoke test (dto-shape.test.ts) — if the
  // pre-Phase-A fields reappear on the DTO, the T2 sample-object
  // literals stop compiling. T3 stays focused on naked string drift.
  {
    id: "lowercase_uom_assignment",
    // Lowercase UOM literals assigned to an enum-typed field. Matches
    // `unit: "kg"`, `default_uom: "each"`, etc. — the exact shape
    // that would fail typecheck against the new UOMS uppercase set.
    pattern:
      /(?:unit|pack_unit|price_unit|default_uom|inventory_uom|purchase_uom|bom_uom|sales_uom|component_uom):\s*['"](?:kg|g|l|ml|each|case|box|bottle)['"]/,
    reason:
      "Lowercase UOM literals ('kg', 'l', 'each', etc.) are pre-Phase-A; locked schema uses 'KG', 'L', 'UNIT' etc.",
  },
];

// Files that legitimately contain material matching a forbidden
// pattern for reasons orthogonal to the Phase A reconciliation:
const DEFAULT_EXCEPTIONS = new Set<string>([
  // The canary itself — it contains the patterns as literals.
  "tests/unit/contracts/forbidden-values.test.ts",
]);

/**
 * Strip `//`-line comments and `/* *`-block comments from a TypeScript
 * source file so the canary doesn't flag documentation that
 * legitimately mentions removed types by name. The stripper is
 * deliberately simple: it does not handle strings containing `//`
 * or `/* `. In the current codebase that is fine — no affected
 * string literal carries those tokens.
 */
function stripComments(src: string): string {
  // Remove block comments first so line-comment stripping does not
  // eat // inside a block.
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, "");
  return noBlock.replace(/(^|[^:/])\/\/[^\n]*/g, "$1");
}

function listSourceFiles(root: string): string[] {
  const out: string[] = [];
  function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (
          name === "node_modules" ||
          name === ".next" ||
          name.startsWith(".")
        ) {
          continue;
        }
        walk(full);
      } else if (
        st.isFile() &&
        (name.endsWith(".ts") || name.endsWith(".tsx"))
      ) {
        out.push(full);
      }
    }
  }
  walk(root);
  return out;
}

describe("contracts/forbidden-values — drift canary", () => {
  const projectRoot = join(__dirname, "..", "..", "..");
  const srcRoot = join(projectRoot, "src");
  const files = listSourceFiles(srcRoot);

  it("src/ tree exists and contains files to scan", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const { id, pattern, reason, allowedIn } of FORBIDDEN_PATTERNS) {
    const exceptions = new Set<string>(DEFAULT_EXCEPTIONS);
    for (const f of allowedIn ?? []) exceptions.add(f);

    it(`${id}: /${pattern.source}/`, () => {
      const hits: string[] = [];
      for (const file of files) {
        const rel = relative(projectRoot, file).split(sep).join("/");
        if (exceptions.has(rel)) continue;
        const stripped = stripComments(readFileSync(file, "utf8"));
        if (pattern.test(stripped)) {
          hits.push(rel);
        }
      }
      if (hits.length > 0) {
        throw new Error(
          `Forbidden pattern reappeared (post-comment-strip) in ${hits.length} file(s): ${hits.join(
            ", ",
          )}\n  Reason: ${reason}`,
        );
      }
      expect(hits).toEqual([]);
    });
  }
});
