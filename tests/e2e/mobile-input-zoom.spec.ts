import { expect, test } from "@playwright/test";
import { setFakeRole } from "./helpers";

// Mobile-only spec — runs under the mobile-safari Playwright project
// (playwright.config.ts). Verifies that input/textarea/select font-size
// computes to ≥16px on a touch viewport, which is what stops iOS from
// auto-zooming on focus.
//
// We test on /admin/items because:
//   1. Public routes (/login, /auth/click-to-signin, /) collapse to button-
//      only flows when NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH=true (the default
//      local env), so they surface no real <input> elements.
//   2. /admin/items requires admin role but renders a real <input className=
//      "input"> search field that exercises the .input component class — the
//      same class used by 70+ form surfaces across the portal.
//   3. setFakeRole(page, "admin") uses the same dev-shim auth helper the
//      rest of the e2e suite uses, so this spec inherits the suite's auth
//      contract instead of inventing a parallel one.

const ROUTE = "/admin/items";

test.describe("mobile WebKit — input font-size floor", () => {
  test("every visible input on an authenticated form route computes to ≥16px font-size", async ({ page }) => {
    await setFakeRole(page, "admin");
    await page.goto(ROUTE);

    // Wait for at least one input to be in the DOM and visible — defends
    // against the route still being mid-hydration.
    const firstInput = page.locator("input:visible").first();
    await expect(firstInput).toBeVisible({ timeout: 10_000 });

    const fontSizes = await page
      .locator("input:visible, textarea:visible, select:visible")
      .evaluateAll((els) =>
        els.map((el) => {
          const cs = window.getComputedStyle(el as HTMLElement);
          return {
            tag: el.tagName.toLowerCase(),
            type: (el as HTMLInputElement).type ?? null,
            fontSizePx: parseFloat(cs.fontSize),
          };
        })
      );

    expect(fontSizes.length, `expected at least one visible input on ${ROUTE}`).toBeGreaterThan(0);

    for (const f of fontSizes) {
      // Skip controls that are visual buttons, not text-entry — they
      // don't trigger iOS zoom and are excluded from the CSS rule.
      if (f.tag === "input" && (
        f.type === "checkbox" ||
        f.type === "radio" ||
        f.type === "submit" ||
        f.type === "button" ||
        f.type === "reset" ||
        f.type === "file" ||
        f.type === "range" ||
        f.type === "color"
      )) continue;

      expect(
        f.fontSizePx,
        `<${f.tag}${f.type ? ` type="${f.type}"` : ""}> computed font-size ${f.fontSizePx}px is below the 16px iOS-zoom floor — the @media (hover: none) and (pointer: coarse) rule in globals.css was not applied`
      ).toBeGreaterThanOrEqual(16);
    }
  });
});
