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

const ADMIN_DIR = join(__dirname, "..", "..", "..", "src", "app", "(admin)", "admin");
const PRODUCTS_NEW_PATH = join(ADMIN_DIR, "products", "new", "page.tsx");
const PRODUCTS_DETAIL_PATH = join(ADMIN_DIR, "products", "[item_id]", "page.tsx");

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

  // NOTE (tranche 036): the legacy anchors (itemSchema z.object, the
  // BOM_DISPLAY_ONLY panel, the create-mutation null-seed) used to live on the
  // items page. The item create-FORM has since migrated to /admin/products and
  // the items page is now a read-only list — so the doctrine is re-anchored to
  // the products surface in the describe block below, and the items-page guards
  // above continue to ensure no BOM form bindings leak back here.
});

// ---------------------------------------------------------------------------
// Re-anchored doctrine — current architecture.
//
// The create-product wizard (/admin/products/new) POSTs item basics only and
// builds the BOM through SEPARATE /api/boms endpoints (it never binds BOM refs
// as editable item fields). The product detail (/admin/products/[item_id])
// renders the linked BOM as a read-only link to /admin/boms, never an input.
// These replace the obsolete itemSchema / BOM_DISPLAY_ONLY / null-seed pins.
// ---------------------------------------------------------------------------
describe("admin/products — BOM stays out of the product form", () => {
  const productsNew = readFileSync(PRODUCTS_NEW_PATH, "utf8");
  const productsDetail = readFileSync(PRODUCTS_DETAIL_PATH, "utf8");

  it("the products wizard + detail sources exist and are non-empty", () => {
    expect(productsNew.length).toBeGreaterThan(100);
    expect(productsDetail.length).toBeGreaterThan(100);
  });

  it.each(BOM_FIELDS)(
    "the create-product wizard does not bind %s as an editable form field",
    (field) => {
      const registerRe = new RegExp(`register\\(\\s*['"\`]${field}['"\`]`);
      const setValueRe = new RegExp(`setValue\\(\\s*['"\`]${field}['"\`]`);
      const objAssignRe = new RegExp(
        `${field}\\s*:\\s*e\\.target\\.(?:value|checked)`,
      );
      if (registerRe.test(productsNew) || setValueRe.test(productsNew) || objAssignRe.test(productsNew)) {
        throw new Error(
          `Create-product wizard binds "${field}" — BOM wiring must stay out of the item form (it is created via /api/boms).`,
        );
      }
      expect(productsNew).not.toMatch(registerRe);
      expect(productsNew).not.toMatch(setValueRe);
      expect(productsNew).not.toMatch(objAssignRe);
    },
  );

  it("the product detail renders the linked BOM read-only (a link, not a form binding)", () => {
    expect(productsDetail).toContain("primary_bom_head_id");
    // Read-only navigation to the BOM editor, not an editable field.
    expect(productsDetail).toMatch(/\/admin\/boms\//);
    expect(productsDetail).not.toMatch(/register\(\s*['"`]primary_bom_head_id/);
    expect(productsDetail).not.toMatch(/primary_bom_head_id\s*:\s*e\.target\./);
  });
});
