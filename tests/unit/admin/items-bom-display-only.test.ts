import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// T4 — BOM display-only doctrine anchor.
//
// Phase A brief §6 T4 regression anchor.
//
// Pins the critical C3 / Phase A constraint:
//
//   Items admin screen (src/app/(admin)/admin/items/page.tsx) MUST NOT
//   expose editable controls for BOM wiring. The three fields
//   primary_bom_head_id, base_bom_head_id, and base_fill_qty_per_unit
//   render as display-only text inside a read-only SectionCard
//   sub-panel. BOM editing lives in admin/boms/page.tsx (a separate
//   surface built against the 3-table locked schema) — Master
//   Maintenance must not quietly become a BOM editor.
//
// If this test fails, someone has either:
//   (a) Added a form register() / onChange on one of the three fields
//       (making them editable), or
//   (b) Removed the bom-wiring-readonly testid sub-panel (making the
//       wiring invisible to operators), or
//   (c) Added a zod field in itemSchema that introduces one of the
//       three field names into the form, which would compile as
//       editable once bound to an input.
//
// The fix is NOT to update this test. The fix is to remove the
// editable control or restore the display-only shape.
//
// Source scan is deliberately string-based so the test catches even
// the loosest reintroduction. A stricter AST version would be nicer
// but would miss cases like dynamically-constructed register() keys.
// ---------------------------------------------------------------------------

const ITEMS_PAGE_PATH = join(
  __dirname,
  "..",
  "..",
  "..",
  "src",
  "app",
  "(admin)",
  "admin",
  "items",
  "page.tsx",
);

const BOM_FIELDS = [
  "primary_bom_head_id",
  "base_bom_head_id",
  "base_fill_qty_per_unit",
] as const;

describe("admin/items — BOM display-only doctrine anchor", () => {
  const source = readFileSync(ITEMS_PAGE_PATH, "utf8");

  it("the items page file exists and is non-empty", () => {
    expect(source.length).toBeGreaterThan(100);
  });

  it.each(BOM_FIELDS)(
    "BOM field %s has no register() binding",
    (field) => {
      const re = new RegExp(`register\\(\\s*['"\`]${field}['"\`]`);
      if (re.test(source)) {
        throw new Error(
          `Items page has register("${field}") — BOM fields must remain display-only. ` +
            `Remove the form binding. BOM wiring lives in admin/boms/page.tsx.`,
        );
      }
      expect(source).not.toMatch(re);
    },
  );

  it.each(BOM_FIELDS)(
    "BOM field %s has no onChange handler",
    (field) => {
      // Look for any onChange that writes to this field. Typical shapes:
      //   form.setValue("primary_bom_head_id", ...)
      //   setField({ primary_bom_head_id: ... })
      //   { primary_bom_head_id: e.target.value }
      const setValueRe = new RegExp(
        `setValue\\(\\s*['"\`]${field}['"\`]`,
      );
      const objAssignRe = new RegExp(
        `${field}\\s*:\\s*e\\.target\\.(?:value|checked)`,
      );
      if (setValueRe.test(source) || objAssignRe.test(source)) {
        throw new Error(
          `Items page writes to "${field}" — BOM fields must remain display-only.`,
        );
      }
      expect(source).not.toMatch(setValueRe);
      expect(source).not.toMatch(objAssignRe);
    },
  );

  it.each(BOM_FIELDS)(
    "BOM field %s is not declared inside the itemSchema z.object",
    (field) => {
      // itemSchema is the zod schema for the items form. Adding one of
      // the BOM field names here would make it a form field and turn
      // the items screen into a BOM editor. This test slices the
      // schema declaration region and checks it explicitly.
      const start = source.indexOf("const itemSchema = z.object({");
      expect(start).toBeGreaterThan(-1);
      // Find the matching closing brace at depth 0.
      let depth = 0;
      let end = start;
      for (let i = start; i < source.length; i++) {
        const ch = source[i];
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      const schemaBlock = source.slice(start, end + 1);
      if (schemaBlock.includes(`${field}:`)) {
        throw new Error(
          `itemSchema declares "${field}" as a form field — BOM fields must stay out of the form schema.`,
        );
      }
      expect(schemaBlock).not.toContain(`${field}:`);
    },
  );

  it("the display-only sub-panel with data-testid='bom-wiring-readonly' is present", () => {
    // Pin the sub-panel that renders the three BOM fields as
    // read-only text. The comment marker BOM_DISPLAY_ONLY and the
    // data-testid must both survive any refactor; either one alone
    // would be fragile.
    expect(source).toContain("BOM_DISPLAY_ONLY");
    expect(source).toContain('data-testid="bom-wiring-readonly"');
  });

  it("the create mutation seeds all three BOM fields to null on new rows", () => {
    // New items must not introduce BOM refs from the items screen.
    // Tran chosen here is 'primary_bom_head_id: null'. If someone
    // removes that line, this test fails and the reviewer must
    // either add it back or explain why the policy changed.
    expect(source).toMatch(/primary_bom_head_id\s*:\s*null/);
    expect(source).toMatch(/base_bom_head_id\s*:\s*null/);
    expect(source).toMatch(/base_fill_qty_per_unit\s*:\s*null/);
  });
});
