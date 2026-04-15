import { expect, test, type Page } from "@playwright/test";
import { resetIdb, setFakeRole } from "./helpers";

// ---------------------------------------------------------------------------
// Wave 5b — admin routes smoke (G6 evidence).
//
// Phase A brief §5 Gate 6: "Admin pages render without runtime errors
// against the new fixtures." Gate 3 closed with G6 reported as soft
// (static prerender only). Wave 5b closes G6 with actual Playwright
// coverage — real Chromium, real navigation, real React hydration
// against the reconciled fixtures and repositories.
//
// Scope of this spec is deliberately minimal:
//
//   - Navigate to each /admin/* route.
//   - Assert the page loads without a runtime crash.
//   - Assert the expected H1 heading text is visible.
//   - Capture any console error / pageerror during the session and
//     fail the test if any appear. This catches hydration mismatches
//     and async render crashes that don't surface as missing elements.
//   - Assert at least one row of fixture-sourced data is visible (or
//     the appropriate empty-state marker), proving the repository
//     layer was reachable and returned real data through the DTO
//     reshape.
//
// No CRUD flows here. No primary-flip exercise. No create/edit/
// archive. Those are already covered by the Vitest-side T4 / T5
// regression anchors. Wave 5b is strictly "the six admin routes
// render green in a real browser after the Wave 1-4 reshape".
// ---------------------------------------------------------------------------

interface ConsoleCapture {
  errors: string[];
  pageErrors: string[];
}

function attachConsoleCapture(page: Page): ConsoleCapture {
  const capture: ConsoleCapture = { errors: [], pageErrors: [] };
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      capture.errors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    capture.pageErrors.push(err.message);
  });
  return capture;
}

function assertNoRuntimeErrors(capture: ConsoleCapture): void {
  if (capture.pageErrors.length > 0) {
    throw new Error(
      `Page threw ${capture.pageErrors.length} runtime error(s):\n  ` +
        capture.pageErrors.join("\n  "),
    );
  }
  // Filter console.error noise that is expected (e.g. React dev-mode
  // warnings about missing favicon, next/font preload warnings in
  // dev). We are interested in hydration / render crashes, which
  // show up as substrings below.
  const fatal = capture.errors.filter((msg) =>
    /hydrat|Cannot read|undefined is not a function|Error:/.test(msg),
  );
  if (fatal.length > 0) {
    throw new Error(
      `Page logged ${fatal.length} fatal console.error line(s):\n  ` +
        fatal.join("\n  "),
    );
  }
}

test.describe("Wave 5b — admin routes render (G6)", () => {
  test.beforeEach(async ({ page }) => {
    await resetIdb(page);
    await setFakeRole(page, "admin");
  });

  test("/admin/items — renders Items heading + seeded row", async ({
    page,
  }) => {
    const capture = attachConsoleCapture(page);
    await page.goto("/admin/items");

    await expect(
      page.getByRole("heading", { level: 1, name: "Items" }),
    ).toBeVisible();

    // At least one seeded item is visible — proves the repo layer
    // reached the reshaped ItemDto shape without crashing.
    await expect(page.getByText("Mojito cocktail 450ml")).toBeVisible();

    assertNoRuntimeErrors(capture);
  });

  test("/admin/components — renders Components heading + seeded row", async ({
    page,
  }) => {
    const capture = attachConsoleCapture(page);
    await page.goto("/admin/components");

    await expect(
      page.getByRole("heading", { level: 1, name: "Components" }),
    ).toBeVisible();

    // At least one fixture component name.
    await expect(page.getByText("White rum 37.5%")).toBeVisible();

    assertNoRuntimeErrors(capture);
  });

  test("/admin/suppliers — renders Suppliers heading + seeded row", async ({
    page,
  }) => {
    const capture = attachConsoleCapture(page);
    await page.goto("/admin/suppliers");

    await expect(
      page.getByRole("heading", { level: 1, name: "Suppliers" }),
    ).toBeVisible();

    // Hebrew supplier name from the fixture (supplier_name_official).
    await expect(page.getByText("פריגת הדרים")).toBeVisible();

    assertNoRuntimeErrors(capture);
  });

  test("/admin/supplier-items — renders heading + polymorphic target cell", async ({
    page,
  }) => {
    const capture = attachConsoleCapture(page);
    await page.goto("/admin/supplier-items");

    // Heading includes a special character; match by substring.
    await expect(
      page.getByRole("heading", { level: 1, name: /Supplier.*target/ }),
    ).toBeVisible();

    // Polymorphic target display — at least one fixture row is
    // expected to show up with its component_id in the first
    // column. "RAW-RUM-WHITE" is used in the SEED_SUPPLIER_ITEMS
    // fixture on the primary Shikarei row.
    await expect(page.getByText("RAW-RUM-WHITE").first()).toBeVisible();

    assertNoRuntimeErrors(capture);
  });

  test("/admin/planning-policy — renders heading + seeded K/V row", async ({
    page,
  }) => {
    const capture = attachConsoleCapture(page);
    await page.goto("/admin/planning-policy");

    await expect(
      page.getByRole("heading", { level: 1, name: "Planning policy" }),
    ).toBeVisible();

    // A fixture key — proves the narrow KeyValueIdbRepo path is wired.
    await expect(
      page.getByText("adjustment.auto_post.small_threshold"),
    ).toBeVisible();

    assertNoRuntimeErrors(capture);
  });

  test("/admin/boms — renders heading + fixture head + 3-table list fetch", async ({
    page,
  }) => {
    const capture = attachConsoleCapture(page);
    await page.goto("/admin/boms");

    await expect(
      page.getByRole("heading", { level: 1, name: "Bills of materials" }),
    ).toBeVisible();

    // A fixture BOM head ID. Proves listHeads() works against the
    // three-store (boms / bom_versions / bom_lines) model.
    await expect(page.getByText("BOM-BASE-MOJ-REG")).toBeVisible();

    assertNoRuntimeErrors(capture);
  });
});
