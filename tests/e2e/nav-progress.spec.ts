// ---------------------------------------------------------------------------
// Tranche 206 — navigation inside one world shows a thin progress bar, not the
// full-screen GT overlay, and never makes the app inert. Only a move across
// worlds (factory <-> sales) keeps the overlay.
//
// @mocked — dev-shim auth only, no backend. Runs under `--grep @mocked`.
// ---------------------------------------------------------------------------

import { expect, test, type Page } from "@playwright/test";
import { setFakeRole } from "./helpers";

test.describe.configure({ mode: "serial" });

/** Count the overlay and the bar over a window, polling the DOM in the page. */
async function watchSurfaces(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __seen: { overlay: boolean; bar: boolean; inert: boolean; busy: boolean } };
    w.__seen = { overlay: false, bar: false, inert: false, busy: false };
    const tick = () => {
      if (document.querySelector(".gt-loader[data-gt-loader-nav]")) w.__seen.overlay = true;
      if (document.querySelector("[data-gt-navbar]")) w.__seen.bar = true;
      if (document.querySelector("[inert]")) w.__seen.inert = true;
      if (document.querySelector("main")?.getAttribute("aria-busy") === "true") w.__seen.busy = true;
    };
    new MutationObserver(tick).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
    });
    setInterval(tick, 16);
  });
}

const seen = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __seen: { overlay: boolean; bar: boolean; inert: boolean; busy: boolean } })
        .__seen,
  );

test.describe("navigation loader contract @mocked", () => {
  test("a factory to factory link: bar, no overlay, nothing inert @mocked", async ({ page }) => {
    await setFakeRole(page, "admin");
    await page.goto("/home");
    await expect(page.locator("main#main-content")).toBeVisible();
    // Slow the destination's data so the navigation stays pending for a while.
    await page.route("**/*_rsc=*", async (route) => {
      await new Promise((r) => setTimeout(r, 900));
      await route.continue();
    });
    await watchSurfaces(page);
    const link = page.locator('nav[aria-label="Primary navigation"]:visible a[href^="/"]').first();
    const href = await link.getAttribute("href");
    test.skip(!href, "no sidebar link");
    await page
      .locator(`a[href="${href}"]:visible`)
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`${href}`));
    await expect(page.locator("main")).not.toHaveAttribute("aria-busy", "true");
    await expect(page.locator("[data-gt-navbar]")).toHaveCount(0);
    const s = await seen(page);
    expect(s.overlay, "the GT overlay must not mount inside one world").toBe(false);
    expect(s.inert, "the app must never be inert inside one world").toBe(false);
    expect(s.busy, "<main> is aria-busy while the navigation is pending").toBe(true);
    expect(s.bar, "the top bar shows when the commit takes longer than 120 ms").toBe(true);
  });

  test("a link across worlds keeps the GT overlay @mocked", async ({ page }) => {
    await setFakeRole(page, "admin");
    await page.goto("/home");
    await expect(page.locator("main#main-content")).toBeVisible();
    // Swallow the real navigation so the overlay's state can be read.
    await page.evaluate(() => {
      document.addEventListener("click", (e) => e.preventDefault());
      const a = document.createElement("a");
      a.id = "to-sales";
      a.href = "/sales/today";
      a.textContent = "sales";
      a.style.cssText = "position:fixed;bottom:8px;left:8px;z-index:50";
      document.body.appendChild(a);
    });
    await page.locator("#to-sales").click();
    const overlay = page.locator('.gt-loader[data-gt-loader-nav][data-variant="sales"]');
    await expect(overlay).toBeAttached();
    await expect(page.locator("[data-gt-navbar]")).toHaveCount(0);
  });
});
