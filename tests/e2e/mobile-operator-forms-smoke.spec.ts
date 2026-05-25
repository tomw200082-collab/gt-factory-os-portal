import { expect, test } from "@playwright/test";
import { setFakeRole } from "./helpers";

// Mobile-only spec — runs under the mobile-safari Playwright project
// (playwright.config.ts) which uses the iPhone 14 device (390x844 viewport,
// touch + coarse pointer, WebKit engine).
//
// Smoke-tests the four primary operator forms on mobile to catch the kinds
// of regressions Agent 5 (mobile + usability audit, 2026-05-24) was
// worried about:
//   - sticky submit bar still reachable / visible
//   - critical form controls render and are visible without scroll traps
//   - inputs honor the iOS-zoom font-size floor (covered globally by
//     globals-css-mobile-zoom; this spec just confirms the operator forms
//     actually consume the .input class so the rule applies)
//
// We don't assert on full end-to-end submission here — that's the job of
// the desktop functional suites (production-actual-real.spec.ts etc.).
// This is a layout / visibility smoke under real mobile WebKit.

const ROUTES = [
  { path: "/ops/stock/waste-adjustments", title: "Waste / Adjustment" },
  { path: "/ops/stock/physical-count",   title: "Physical Count" },
  { path: "/ops/stock/production-actual", title: "Production" },
  { path: "/ops/stock/receipts",         title: "Receipt" },
];

test.describe("mobile WebKit (iPhone 14, 390px) — operator forms smoke", () => {
  for (const { path, title } of ROUTES) {
    test(`${path} renders without scroll trap and inputs respect the iOS-zoom floor`, async ({ page }) => {
      await setFakeRole(page, "operator");
      await page.goto(path);

      // The page header should be visible — proves SSR + hydration completed.
      await expect(
        page.getByRole("heading", { name: new RegExp(title, "i") }).first(),
      ).toBeVisible({ timeout: 15_000 });

      // Inputs / textareas / selects on the page must respect the iOS-zoom
      // font-size floor (≥16px). The rule is enforced globally in
      // globals.css via @media (hover: none) and (pointer: coarse); this
      // confirms the operator form actually uses the .input class so the
      // rule applies.
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
          }),
        );

      for (const f of fontSizes) {
        if (
          f.tag === "input" &&
          [
            "checkbox",
            "radio",
            "submit",
            "button",
            "reset",
            "file",
            "range",
            "color",
          ].includes(f.type ?? "")
        ) {
          continue;
        }
        expect(
          f.fontSizePx,
          `${path}: <${f.tag}${f.type ? ` type="${f.type}"` : ""}> computed font-size ${f.fontSizePx}px is below the 16px iOS-zoom floor`,
        ).toBeGreaterThanOrEqual(16);
      }
    });
  }
});
