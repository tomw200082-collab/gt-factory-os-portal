// ---------------------------------------------------------------------------
// Tranche 138 — lean-nav. Proves the pruning is VISIBILITY-only:
//   (a) the pruned rows are absent from the role's sidebar,
//   (b) the pruned URLs still load directly (no 404 / role block) — access is
//       unchanged, only the nav entry moved,
//   (c) the command palette (⌘K) still finds the demoted diagnostic pages.
// Plus a per-role sidebar screenshot for the PR evidence pack.
//
// @mocked — dev-shim auth only, no backend. Runs under `--grep @mocked`.
// ---------------------------------------------------------------------------

import { expect, test, type Page } from "@playwright/test";
import { setFakeRole } from "./helpers";

test.describe.configure({ mode: "serial" });

/**
 * Is `label` a sidebar link for the current role? Typing into the sidebar
 * filter box force-expands every collapsible group that has a match, so a
 * present row surfaces regardless of its default-collapsed state — and an
 * absent (pruned) row yields 0 deterministically.
 */
function desktopSidebar(page: Page) {
  // The app mounts SideNav twice (desktop rail + mobile drawer). The drawer is
  // `md:hidden` (display:none at desktop widths), so `:visible` selects the
  // desktop rail unambiguously.
  return page.locator('nav[aria-label="Primary navigation"]:visible');
}

async function sidebarHasRow(page: Page, label: string): Promise<number> {
  const sidebar = desktopSidebar(page);
  const search = sidebar.getByTestId("sidenav-search");
  await search.fill(label);
  const count = await sidebar
    .getByRole("link", { name: new RegExp(`^${label}$`, "i") })
    .count();
  await search.fill("");
  return count;
}

async function expectLoadsNotBlocked(page: Page, url: string): Promise<void> {
  await page.goto(url);
  // Not redirected away and not shown the RoleGate block card.
  expect(page.url()).toContain(url);
  await expect(
    page.getByText(/Not available for your role|Sign in to continue/i),
  ).toHaveCount(0);
}

async function openPaletteAndFind(page: Page, query: string): Promise<number> {
  await page.getByRole("button", { name: /Search \(Command or Control \+ K\)/i }).click();
  const input = page.getByRole("textbox", { name: /Search pages/i });
  await input.fill(query);
  const count = await page.getByRole("button", { name: new RegExp(query, "i") }).count();
  await page.keyboard.press("Escape");
  return count;
}

test.describe("lean-nav — operator (Dennis/Maxim) rail is scoped down @mocked", () => {
  test("pruned rows are absent from the operator sidebar @mocked", async ({ page }) => {
    await setFakeRole(page, "operator");
    await page.goto("/dashboard");
    for (const label of [
      "Credit Tracking",
      "Movement Log",
      "Planning Overview",
      "Forecast",
      "Production Simulation",
      "Blockers",
    ]) {
      expect(await sidebarHasRow(page, label), `${label} should be pruned`).toBe(0);
    }
    // The operator's real daily rows survive.
    expect(await sidebarHasRow(page, "Goods Receipt")).toBeGreaterThan(0);
    expect(await sidebarHasRow(page, "Production Report")).toBeGreaterThan(0);
  });

  test("pruned URLs still load directly for operator — access unchanged @mocked", async ({ page }) => {
    await setFakeRole(page, "operator");
    for (const url of [
      "/credit-tracking",
      "/stock/movement-log",
      "/planning",
      "/planning/forecast",
    ]) {
      await expectLoadsNotBlocked(page, url);
    }
  });
});

test.describe("lean-nav — viewer (bookkeeper) keeps access to raised surfaces @mocked", () => {
  test("Planning Overview + Forecast are gone from the viewer rail but still load @mocked", async ({ page }) => {
    await setFakeRole(page, "viewer");
    await page.goto("/dashboard");
    expect(await sidebarHasRow(page, "Planning Overview")).toBe(0);
    expect(await sidebarHasRow(page, "Forecast")).toBe(0);
    // Route access is unchanged (both gate on planning:read, which viewer has).
    await expectLoadsNotBlocked(page, "/planning");
    await expectLoadsNotBlocked(page, "/planning/forecast");
  });

  test("viewer no longer sees the permanently-locked stock forms (D2) @mocked", async ({ page }) => {
    await setFakeRole(page, "viewer");
    await page.goto("/dashboard");
    for (const label of ["Goods Receipt", "Waste / Adjustment", "Physical Count", "My activity"]) {
      expect(await sidebarHasRow(page, label), `${label} hidden for viewer`).toBe(0);
    }
    // But the office/read rows it CAN use remain.
    expect(await sidebarHasRow(page, "Credit Tracking")).toBeGreaterThan(0);
    expect(await sidebarHasRow(page, "Inventory")).toBeGreaterThan(0);
  });
});

test.describe("lean-nav — demoted diagnostics stay ⌘K-reachable @mocked", () => {
  test("planner can reach the folded pages directly @mocked", async ({ page }) => {
    await setFakeRole(page, "planner");
    // Folded out of the sidebar, still live as deep links.
    await expectLoadsNotBlocked(page, "/planning/production-simulation");
    await expectLoadsNotBlocked(page, "/planning/blockers");
  });

  test("command palette still finds Production Simulation + Blockers @mocked", async ({ page }) => {
    await setFakeRole(page, "admin");
    await page.goto("/dashboard");
    expect(await openPaletteAndFind(page, "Production Simulation")).toBeGreaterThan(0);
    expect(await openPaletteAndFind(page, "Blockers")).toBeGreaterThan(0);
  });
});

test.describe("lean-nav — sidebar screenshots per role (PR evidence) @mocked", () => {
  for (const role of ["operator", "planner", "admin", "viewer"] as const) {
    test(`sidebar snapshot — ${role} @mocked`, async ({ page }) => {
      await setFakeRole(page, role);
      await page.goto("/dashboard");
      const nav = desktopSidebar(page);
      await expect(nav).toBeVisible();
      await nav.screenshot({ path: `test-results/lean-nav/sidebar-${role}.png` });
    });
  }
});
