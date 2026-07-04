import { expect, test } from "@playwright/test";
import { resetIdb, setFakeRole } from "./helpers";

// ---------------------------------------------------------------------------
// Inventory Flow (daily control tower) — smoke spec for /planning/inventory-flow.
//
// This page replaced the legacy /planning/weekly-outlook view. Before this
// spec it had only library-level unit coverage (planned-inflow helpers) and
// no route-level guard at all.
//
// Convention mirrors weekly-outlook-real.spec.ts / inventory-reconcile.spec.ts:
// the projection is a heavy, data-dependent SQL pass that may be unpopulated
// or unreachable in the dev/test environment, so each assertion downshifts to
// a "soft pass" that still proves the route compiled and rendered.
//
// What this spec PROVES even on the soft path:
//   - /planning/inventory-flow renders without crashing (heading present).
//   - The page settles into one of its declared terminal states (grid /
//     loading / error / empty) — never an infinite skeleton.
//   - The FG / Components tab switcher renders with a correctly-selected
//     active tab (guards InventoryFlowTabs design-token regression).
//   - The /planning landing surface links into the page.
// ---------------------------------------------------------------------------

test.describe("Inventory Flow page", () => {
  test("T01 planner loads page — heading visible", async ({ page }) => {
    await resetIdb(page);
    await setFakeRole(page, "planner");

    await page.goto("/planning/inventory-flow");

    await expect(
      page.getByRole("heading", { name: /Inventory Flow/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("T02 page resolves to one of its terminal states (no infinite skeleton)", async ({
    page,
  }) => {
    await resetIdb(page);
    await setFakeRole(page, "planner");

    await page.goto("/planning/inventory-flow");

    await expect(
      page.getByRole("heading", { name: /Inventory Flow/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Terminal states:
    //   (a) the desktop grid scroller renders
    //   (b) an empty state ("No items match" / "No projection available")
    //   (c) the error state ("Could not load Inventory Flow")
    //   (d) the unmapped-SKU gate banner
    await expect
      .poll(
        async () => {
          const hasGrid = await page
            .getByTestId("flow-grid-scroller")
            .isVisible()
            .catch(() => false);
          const hasMobile = await page
            .locator('[data-testid="mobile-planned-summary"], article')
            .first()
            .isVisible()
            .catch(() => false);
          const hasEmpty = await page
            .getByText(/No items match|No projection available/i)
            .isVisible()
            .catch(() => false);
          const hasError = await page
            .getByText(/Could not load Inventory Flow/i)
            .isVisible()
            .catch(() => false);
          const hasUnmapped = await page
            .getByText(/unmapped|unknown SKU/i)
            .isVisible()
            .catch(() => false);
          return hasGrid || hasMobile || hasEmpty || hasError || hasUnmapped;
        },
        { timeout: 20_000, intervals: [500] },
      )
      .toBe(true);
  });

  test("T03 FG/Components tab switcher renders with the FG tab selected", async ({
    page,
  }) => {
    await resetIdb(page);
    await setFakeRole(page, "planner");

    await page.goto("/planning/inventory-flow");

    const tablist = page.getByRole("tablist", { name: /Inventory flow view/i });
    await expect(tablist).toBeVisible({ timeout: 15_000 });

    const fgTab = page.getByRole("tab", { name: /Finished Goods/i });
    const componentsTab = page.getByRole("tab", { name: /Components/i });
    await expect(fgTab).toBeVisible();
    await expect(componentsTab).toBeVisible();

    // On the FG route the Finished Goods tab is the selected one.
    await expect(fgTab).toHaveAttribute("aria-selected", "true");
    await expect(componentsTab).toHaveAttribute("aria-selected", "false");
  });

  test("T04 admin can also view the page (operator + planner + admin read)", async ({
    page,
  }) => {
    await resetIdb(page);
    await setFakeRole(page, "admin");

    await page.goto("/planning/inventory-flow");

    await expect(
      page.getByRole("heading", { name: /Inventory Flow/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("T05 planning landing links to inventory-flow", async ({ page }) => {
    await resetIdb(page);
    await setFakeRole(page, "planner");

    await page.goto("/planning");

    await expect(
      page.getByRole("link", { name: /Inventory flow/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("T06 item-name column stays frozen during horizontal scroll", async ({
    page,
  }) => {
    await resetIdb(page);
    await setFakeRole(page, "planner");

    await page.goto("/planning/inventory-flow");

    await expect(
      page.getByRole("heading", { name: /Inventory Flow/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    const scroller = page.getByTestId("flow-grid-scroller");
    const hasGrid = await scroller
      .isVisible()
      .catch(() => false);
    if (!hasGrid) {
      // Desktop grid only renders with data on a wide viewport. Soft-pass
      // when the projection is empty/unreachable in this environment.
      test.info().annotations.push({
        type: "data-dependent",
        description:
          "No desktop flow grid present (empty/error/mobile). Sticky-column " +
          "scroll assertion skipped.",
      });
      return;
    }

    const rowheader = page.locator('[role="rowheader"]').first();
    await expect(rowheader).toBeVisible();

    // Capture the frozen column's left edge before scrolling.
    const beforeBox = await rowheader.boundingBox();
    expect(beforeBox).not.toBeNull();
    const beforeLeft = beforeBox!.x;

    // Scroll the grid well past the item-column width (ITEM_COL_W = 400px).
    // Before the fix, the names scrolled away beyond ~400px because the
    // sticky lived on an inner child confined to the 400px wrapper.
    await scroller.evaluate((el) => {
      el.scrollLeft = 700;
    });
    await page.waitForTimeout(200);

    // The rowheader must still be visible and pinned at (approximately) the
    // same left edge — i.e. it did NOT scroll away with the day columns.
    await expect(rowheader).toBeVisible();
    const afterBox = await rowheader.boundingBox();
    expect(afterBox).not.toBeNull();
    expect(Math.abs(afterBox!.x - beforeLeft)).toBeLessThan(4);

    // And the item name itself is still readable (non-empty text).
    const nameText = (await rowheader.innerText()).trim();
    expect(nameText.length).toBeGreaterThan(0);
  });

  test("T07 desktop grid exposes an ARIA grid with rows (DR-018 A11Y-002)", async ({
    page,
  }) => {
    await resetIdb(page);
    await setFakeRole(page, "planner");

    await page.goto("/planning/inventory-flow");

    await expect(
      page.getByRole("heading", { name: /Inventory Flow/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    const grid = page.getByRole("grid");
    const hasGrid = await grid.isVisible().catch(() => false);
    if (!hasGrid) {
      // Desktop grid only renders with data on a wide viewport — same
      // data-dependent soft-pass as T06.
      test.info().annotations.push({
        type: "data-dependent",
        description: "No desktop flow grid present (empty/error/mobile).",
      });
      return;
    }

    await expect(grid).toBeVisible();
    expect(await page.getByRole("row").count()).toBeGreaterThan(0);
  });

  test("T08 day-cell aria-labels never leak a raw tier enum (DR-018 A11Y-007)", async ({
    page,
  }) => {
    await resetIdb(page);
    await setFakeRole(page, "planner");

    await page.goto("/planning/inventory-flow");

    await expect(
      page.getByRole("heading", { name: /Inventory Flow/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    const cells = page.locator('[data-testid="day-cell"]');
    const count = await cells.count();
    if (count === 0) {
      test.info().annotations.push({
        type: "data-dependent",
        description: "No day cells present (empty/error/mobile).",
      });
      return;
    }

    const labels = await cells.evaluateAll((els) =>
      els.map((el) => el.getAttribute("aria-label") ?? ""),
    );
    for (const label of labels) {
      expect(label).not.toMatch(/critical_stockout|at_risk|non_working/);
    }
  });

  test("T09 day-cell popover opens on Enter (DR-018 ux-release-gate A11Y-001)", async ({
    page,
  }) => {
    await resetIdb(page);
    await setFakeRole(page, "planner");

    await page.goto("/planning/inventory-flow");

    await expect(
      page.getByRole("heading", { name: /Inventory Flow/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // A working-day cell has tabIndex=0; a non-working one has -1 and no
    // popover behind it (A11Y-008) — pick the first focusable one.
    const cell = page.locator('[data-testid="day-cell"][tabindex="0"]').first();
    const hasCell = await cell.isVisible().catch(() => false);
    if (!hasCell) {
      test.info().annotations.push({
        type: "data-dependent",
        description: "No focusable day cell present (empty/error/mobile).",
      });
      return;
    }

    // Regression guard: Radix Popover.Trigger asChild only merges onClick
    // onto this div, so Enter/Space previously did nothing — keyboard users
    // could Tab to a cell but never open its day-detail popover. Radix marks
    // the trigger's data-state "open" once the popover is showing.
    await cell.focus();
    await page.keyboard.press("Enter");
    await expect(cell).toHaveAttribute("data-state", "open", { timeout: 3_000 });
  });
});

test.describe("Planning overview — DR-018 FLOW-003", () => {
  test("pipeline block is retitled 'Engine diagnostic' with a corridor disclaimer", async ({
    page,
  }) => {
    await resetIdb(page);
    await setFakeRole(page, "planner");

    await page.goto("/planning");

    await expect(page.getByText("Engine diagnostic")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText(/not the order path/i),
    ).toBeVisible();
  });
});

test.describe("Production simulation — DR-018 COPY-004", () => {
  test("containment banner uses positive framing", async ({ page }) => {
    await resetIdb(page);
    await setFakeRole(page, "planner");

    await page.goto("/planning/production-simulation");

    await expect(
      page.getByText(/Use this to check material needs before committing/i),
    ).toBeVisible({ timeout: 15_000 });
  });
});
