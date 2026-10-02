// The sales report as a native screen: the five tabs, who may open it, and every state it can be in.
// @mocked: browser-stubbed APIs (tests/e2e/_fixtures/salesReport.ts), synthetic data only.

import { test, expect, type Page } from "@playwright/test";
import { setFakeRole } from "./helpers";
import { NOW_FRESH, NOW_STALE, stubSalesReport, type ReportStubOptions } from "./_fixtures/salesReport";

async function asRep(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem("gt.fakeauth.v1", JSON.stringify({ user_id: "rep-1", email: "rep@synthetic.invalid", display_name: "נציגה", role: "sales_rep" })),
  );
}

async function open(page: Page, opts: ReportStubOptions = {}, now = NOW_FRESH, width = 390) {
  await setFakeRole(page, "admin");
  await stubSalesReport(page, opts);
  await page.clock.setFixedTime(new Date(now));
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/sales/report");
}

const TABS = ["daily", "cust", "prod", "chain", "trend"] as const;

async function noSidewaysScroll(page: Page, label: string) {
  const d = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
  expect(d.scroll, `${label}: page scrolls sideways`).toBeLessThanOrEqual(d.width);
}

test.describe("sales report @mocked", () => {
  test("a manager sees the report in the navigation and opens all five tabs", async ({ page }) => {
    await setFakeRole(page, "admin");
    await stubSalesReport(page);
    await page.clock.setFixedTime(new Date(NOW_FRESH));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sales/today");
    // the fifth destination: the phone bar says "דוח"
    await expect(page.getByTestId("sales-tab-/sales/report")).toHaveText("דוח");
    // dispatchEvent, not click(): under `next dev` the dev-tools badge sits at the bottom-left, which is
    // exactly where the fifth item of a right-to-left bar is, and swallows the pointer
    await page.getByTestId("sales-tab-/sales/report").dispatchEvent("click");
    // The first entry compiles /sales/report under `next dev`; on the CI runner that took longer than
    // the default 5s (red twice in CI, green locally, URL never left /sales/today). Production serves a
    // prebuilt route. Same cause and wait as sales-orgs journey A.
    await expect(page).toHaveURL(/\/sales\/report$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1, name: "דוח מכירות" })).toBeVisible();
    await expect(page.getByTestId("report-tabs").getByRole("tab")).toHaveText(["יומי", "לקוחות", "מוצרים", "רשתות", "מגמה"]);
    // opens on the customers sheet, as the Artifact does
    await expect(page.getByTestId("report-tabbtn-cust")).toHaveAttribute("aria-selected", "true");
    for (const t of TABS) {
      await page.getByTestId(`report-tabbtn-${t}`).click();
      await expect(page.getByTestId(`report-tab-${t}`)).toBeVisible();
      await expect(page.getByTestId(`report-tabbtn-${t}`)).toHaveAttribute("aria-selected", "true");
    }
  });

  test("the header says how fresh the data is, in Israel time, and what it leaves out", async ({ page }) => {
    await open(page);
    await expect(page.getByTestId("report-fresh")).toHaveText("עודכן לפני 12 דק׳ · 09:15");
    await expect(page.getByTestId("report-header")).toContainText("ללא מע״מ · ללא מבוטלות");
    await expect(page.getByTestId("report-stale")).toHaveCount(0);
  });

  test("a sales rep has no navigation item and the page says it is not theirs", async ({ page }) => {
    const requests: string[] = [];
    await asRep(page);
    await stubSalesReport(page, { role: "rep", requests });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sales/today");
    await expect(page.getByTestId("sales-tab-/sales/today")).toBeVisible();
    await expect(page.getByTestId("sales-tab-/sales/report")).toHaveCount(0);
    await page.goto("/sales/report");
    await expect(page.getByTestId("report-manager-only")).toContainText("דוח המכירות מיועד למנהל המכירות");
    // a way out, not a dead end; and no claim about VAT or cancellations over a screen with no figures
    await expect(page.getByTestId("report-manager-only").getByRole("link", { name: "חזרה להיום" })).toHaveAttribute("href", "/sales/today");
    await expect(page.getByTestId("report-header")).not.toContainText("ללא מע״מ");
    // no data, and not so much as a request for it
    await expect(page.getByTestId("report-tabs")).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("₪");
    expect(requests).toEqual([]);
  });

  test("a stale report is shown in full under an amber band that says why", async ({ page }) => {
    await open(page, { mode: "stale_failed" }, NOW_STALE);
    const band = page.getByTestId("report-stale");
    await expect(band).toContainText("מוצגת הגרסה המאומתת האחרונה · נתונים עד 27/09 09:15");
    await expect(band).toContainText("העדכון האחרון לא עבר בדיקת התאמה מול Shopify");
    await expect(page.getByTestId("report-tabs")).toBeVisible();
    await expect(page.getByTestId("report-row").first()).toBeVisible();
    await expect(page.getByTestId("report-fresh")).toHaveCount(0);
  });

  test("any other failed build says only that it failed", async ({ page }) => {
    await open(page, { mode: "stale_failed_other" }, NOW_STALE);
    await expect(page.getByTestId("report-stale")).toContainText("העדכון האחרון נכשל");
    await expect(page.getByTestId("report-stale")).not.toContainText("Shopify");
  });

  test("a late refresh says it is late", async ({ page }) => {
    await open(page, { mode: "stale_late" }, NOW_STALE);
    await expect(page.getByTestId("report-stale")).toContainText("העדכון מתעכב");
  });

  test("a report that was never built says so, and is not a report of zeros", async ({ page }) => {
    await open(page, { mode: "never" });
    await expect(page.getByTestId("report-never")).toContainText("הדוח עוד לא נבנה");
    await expect(page.getByTestId("report-tabs")).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("₪");
  });

  test("a report never built, with a failed build behind it, says that too", async ({ page }) => {
    await open(page, { mode: "never_failed" });
    await expect(page.getByTestId("report-never-why")).toContainText("לא עברה בדיקת התאמה מול Shopify");
  });

  test("a hollow blob (every key, nothing in them) is an error, not a report of zeros", async ({ page }) => {
    await open(page, { mode: "hollow" });
    await expect(page.getByTestId("report-invalid")).toContainText("אם זה חוזר, פנה למנהל המערכת");
    await expect(page.getByTestId("report-tabs")).toHaveCount(0);
    // and no "updated N minutes ago" pill over it
    await expect(page.getByTestId("report-fresh")).toHaveCount(0);
  });

  test("a signed-out viewer is asked to sign in again, not to retry", async ({ page }) => {
    await open(page, { status: 401 });
    await expect(page.getByTestId("report-signed-out")).toContainText("ההתחברות פגה");
    await expect(page.getByRole("button", { name: "נסה שוב" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "טעינה מחדש" })).toBeVisible();
  });

  test("a refusal (403) reads as not yours, and is not retried", async ({ page }) => {
    const requests: string[] = [];
    await open(page, { status: 403, requests });
    await expect(page.getByTestId("report-manager-only")).toBeVisible();
    expect(requests).toHaveLength(1);
  });

  test("a refresh that fails after a good load says so, and that the page keeps trying", async ({ page }) => {
    await setFakeRole(page, "admin");
    await stubSalesReport(page, { failAfterFirst: true });
    await page.clock.install({ time: new Date(NOW_FRESH) });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sales/report");
    await expect(page.getByTestId("report-tabs")).toBeVisible();
    // five minutes later the page re-reads by itself, and the read breaks
    await page.clock.fastForward(5 * 60_000 + 2_000);
    const strip = page.getByTestId("report-refresh-failed");
    await expect(strip).toContainText("הרענון האחרון נכשל");
    await expect(strip).toContainText("הדף בודק שוב מעצמו כל 5 דקות");
    await expect(page.getByTestId("report-recheck")).toHaveText("בדוק שוב");
    // the last good numbers are still there
    await expect(page.getByTestId("report-tabs")).toBeVisible();
    await expect(page.getByTestId("report-row").first()).toBeVisible();
  });

  test("the build note about products outside the price list is one neutral line", async ({ page }) => {
    await open(page, { mode: "noted" });
    await expect(page.getByTestId("report-note-historic")).toHaveText("באוגוסט ₪12,345 ממכירות מוצרים שאינם במחירון (מסווגים לפי שם המוצר)");
  });

  test("a failed read is an error card with a retry, never a screen of zeros", async ({ page }) => {
    // the first read and its one retry fail; the viewer's own retry gets through
    await open(page, { failFirst: 2 });
    await expect(page.getByTestId("queue-error")).toContainText("דוח המכירות");
    await expect(page.locator("main")).not.toContainText("₪");
    await page.getByTestId("queue-error").getByRole("button", { name: "נסה שוב" }).click();
    await expect(page.getByTestId("report-tabs")).toBeVisible();
    await expect(page.getByTestId("queue-error")).toHaveCount(0);
  });

  test("a blob the screen cannot read is an error too", async ({ page }) => {
    await open(page, { mode: "malformed" });
    await expect(page.getByTestId("report-invalid")).toBeVisible();
    await expect(page.getByTestId("report-tabs")).toHaveCount(0);
  });

  test("while it loads, the page shows the skeleton of the report, not an empty chart", async ({ page }) => {
    await open(page, { delayMs: 1500 });
    await expect(page.getByTestId("report-loading")).toBeVisible();
    await expect(page.getByTestId("report-tabs")).toHaveCount(0);
    await expect(page.getByTestId("report-tabs")).toBeVisible({ timeout: 10_000 });
  });

  test("customers: a phone opens on the summary, a drill-down shows what is inside a row", async ({ page }) => {
    await open(page);
    await expect(page.getByTestId("report-summary-list")).toBeVisible();
    await expect(page.getByTestId("report-summary")).toContainText("סה״כ ₪");
    const first = page.getByTestId("report-row").first();
    await first.getByRole("button").click();
    await expect(first.getByRole("button")).toHaveAttribute("aria-expanded", "true");
    await expect(first.getByTestId("report-child").first()).toBeVisible();
    await first.getByRole("button").click();
    await expect(first.getByTestId("report-child")).toHaveCount(0);
  });

  test("customers: by month is a table with real buttons to sort and open", async ({ page }) => {
    await open(page);
    await page.getByTestId("report-view-months").click();
    const table = page.getByTestId("report-table");
    await expect(table).toBeVisible();
    // sorting by name flips the order and says so for assistive technology
    const nameHead = table.locator("thead th").first();
    await expect(nameHead).toHaveAttribute("aria-sort", "none");
    await nameHead.getByRole("button").click();
    await expect(nameHead).toHaveAttribute("aria-sort", "ascending");
    await nameHead.getByRole("button").click();
    await expect(nameHead).toHaveAttribute("aria-sort", "descending");
    const row = table.locator("tbody tr").first();
    await row.getByRole("button").click();
    await expect(row.getByRole("button")).toHaveAttribute("aria-expanded", "true");
    await expect(table.getByTestId("report-child").first()).toBeVisible();
    // the table scrolls inside its own card, never the page
    await noSidewaysScroll(page, "customers by month at 390");
  });

  test("a search says the total is filtered, and ignores the order and customer counts", async ({ page }) => {
    await open(page);
    const summary = page.getByTestId("report-summary");
    await expect(summary).toContainText("הזמנות");
    await page.getByTestId("report-search").fill("נונומימי");
    await expect(summary).toContainText("סה״כ מסונן");
    await expect(summary).not.toContainText("הזמנות");
    await expect(page.getByTestId("report-row").first()).toContainText("נונומימי");
    await page.getByTestId("report-search").fill("אין-כזה-בכלל");
    await expect(page.getByTestId("list-empty")).toContainText("אין שורות שמתאימות לחיפוש");
  });

  test("products: a SKU code finds its family", async ({ page }) => {
    await open(page);
    await page.getByTestId("report-tabbtn-prod").click();
    await page.getByTestId("report-search").fill("gt-hib-low-1l");
    await expect(page.getByTestId("report-row")).toHaveCount(1);
    await expect(page.getByTestId("report-row").first()).toContainText("FRESH");
  });

  test("chains: search filters the chains tree, and the heat toggle is not offered", async ({ page }) => {
    await open(page);
    await page.getByTestId("report-tabbtn-chain").click();
    await expect(page.getByTestId("chains-kpis").getByTestId("chain-kpi")).toHaveCount(5);
    await expect(page.getByTestId("report-heat")).toHaveCount(0);
    const before = await page.getByTestId("chain-row").count();
    expect(before).toBeGreaterThan(5);
    await page.getByTestId("report-search").fill("ביסקוטי");
    await expect(page.getByTestId("chain-row")).toHaveCount(1);
    await expect(page.getByTestId("chain-row")).toContainText("ביסקוטי");
    await expect(page.getByTestId("report-summary")).toContainText("מסונן");
    // a branch opens, and its quiet badge names the days
    await page.getByTestId("chain-row").getByRole("button").first().click();
    await expect(page.getByTestId("branch-row").first()).toContainText("שקט");
  });

  test("chains: the KPI strip names the big quiet chain", async ({ page }) => {
    await open(page);
    await page.getByTestId("report-tabbtn-chain").click();
    await expect(page.locator('[data-kpi="quiet"]')).toContainText("ביסקוטי");
    await expect(page.locator('[data-kpi="quiet"]')).toContainText("כל 3 הסניפים שקטים");
  });

  test("each tab offers only the controls that act on it", async ({ page }) => {
    await open(page);
    await page.getByTestId("report-tabbtn-trend").click();
    await expect(page.getByTestId("report-unit")).toBeVisible();
    await expect(page.getByTestId("report-period")).toHaveCount(0);
    await expect(page.getByTestId("report-search")).toHaveCount(0);
    await page.getByTestId("report-tabbtn-daily").click();
    await expect(page.getByTestId("report-range")).toBeVisible();
    await expect(page.getByTestId("report-period")).toHaveCount(0);
    await expect(page.getByTestId("report-unit")).toHaveCount(0);
    await page.getByTestId("report-tabbtn-cust").click();
    await expect(page.getByTestId("report-period")).toBeVisible();
    await expect(page.getByTestId("report-search")).toBeVisible();
    // the heat toggle belongs to the month table
    await expect(page.getByTestId("report-heat")).toHaveCount(0);
    await page.getByTestId("report-view-months").click();
    await expect(page.getByTestId("report-heat")).toBeVisible();
  });

  test("the period buttons come from the data, and the current year is the default", async ({ page }) => {
    await open(page);
    await expect(page.getByTestId("report-period").getByRole("button")).toHaveText(["2026", "2025", "2024", "12ח׳", "הכול"]);
    await expect(page.getByTestId("report-period-2026")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("report-period-all").click();
    await page.getByTestId("report-view-months").click();
    // 'all' has no prior year for every month, so there is no year-over-year column
    await expect(page.getByTestId("report-table").locator("thead th", { hasText: "מול אשתקד" })).toHaveCount(0);
    await page.getByTestId("report-period-12").click();
    await expect(page.getByTestId("report-table").locator("thead th", { hasText: "מול אשתקד" })).toHaveCount(1);
  });

  test("trend: four tiles, three charts and the year matrix", async ({ page }) => {
    await open(page);
    await page.getByTestId("report-tabbtn-trend").click();
    await expect(page.getByTestId("trend-tiles").getByTestId("report-tile")).toHaveCount(4);
    await expect(page.getByTestId("trend-tiles")).toContainText("קצב שנתי");
    await expect(page.getByTestId("monthly-chart")).toBeVisible();
    await expect(page.getByTestId("yoy-chart")).toBeVisible();
    await expect(page.getByTestId("year-matrix").getByTestId("matrix-row")).toHaveCount(3);
  });

  test("a chart tooltip opens on tap and closes on an outside tap or Escape", async ({ page }) => {
    await open(page);
    await page.getByTestId("report-tabbtn-trend").click();
    const chart = page.getByTestId("monthly-chart");
    await chart.scrollIntoViewIfNeeded();
    const box = (await chart.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.5);
    await expect(page.getByTestId("report-tip")).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(page.getByTestId("report-tip")).toHaveCount(0);
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5);
    await expect(page.getByTestId("report-tip")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("report-tip")).toHaveCount(0);
  });

  test("daily: tiles, the pace card, the chart range and the retro rows", async ({ page }) => {
    await open(page);
    await page.getByTestId("report-tabbtn-daily").click();
    await expect(page.getByTestId("daily-tiles").getByTestId("report-tile")).toHaveCount(4);
    await expect(page.getByTestId("daily-tiles")).toContainText("היום עד 09:15");
    // every change names what it is a change against
    const deltas = await page.getByTestId("daily-tiles").getByTestId("tile-delta").allInnerTexts();
    for (const base of ["מול רגיל", "מול אותה שעה", "מול 7 הימים הקודמים", "מול החודש שעבר"]) expect(deltas.join("|")).toContain(base);
    await expect(page.getByTestId("report-pace")).toContainText("צפי לסוף החודש");
    await expect(page.getByTestId("report-pace")).toContainText("הטלה, לא תחזית");
    await page.getByTestId("report-range-90").click();
    await expect(page.getByTestId("report-range-90")).toHaveAttribute("aria-pressed", "true");
    // the giant order cuts the 30-day axis and the chart says so
    await page.getByTestId("report-range-30").click();
    await expect(page.getByTestId("daily-clipped")).toBeVisible();
    await expect(page.getByTestId("retro-row")).toHaveCount(14);
  });

  test("the tab you were on is remembered on this device", async ({ page }) => {
    await open(page);
    await page.getByTestId("report-tabbtn-trend").click();
    await page.reload();
    await expect(page.getByTestId("report-tabbtn-trend")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("report-tab-trend")).toBeVisible();
  });

  test("the report works when the browser will not remember anything", async ({ page }) => {
    // a private window or blocked site data: the report's own key throws on every read and write
    await page.addInitScript(() => {
      const get = Storage.prototype.getItem;
      const set = Storage.prototype.setItem;
      Storage.prototype.getItem = function (k: string) {
        if (k === "gt.sales.report.tab") throw new Error("blocked");
        return get.call(this, k);
      };
      Storage.prototype.setItem = function (k: string, v: string) {
        if (k === "gt.sales.report.tab") throw new Error("blocked");
        return set.call(this, k, v);
      };
    });
    await open(page);
    await page.getByTestId("report-tabbtn-chain").click();
    await expect(page.getByTestId("report-tab-chain")).toBeVisible();
  });

  test("at 320px no tab scrolls the page sideways, and every control is a real target", async ({ page }) => {
    await open(page, {}, NOW_FRESH, 320);
    for (const t of TABS) {
      await page.getByTestId(`report-tabbtn-${t}`).click();
      await expect(page.getByTestId(`report-tab-${t}`)).toBeVisible();
      await noSidewaysScroll(page, `${t} at 320`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${t} at 320`).toBeLessThanOrEqual(320);
    }
    // the month tables on a phone, in their own scroller
    for (const t of ["cust", "prod", "chain"] as const) {
      await page.getByTestId(`report-tabbtn-${t}`).click();
      await page.getByTestId("report-view-months").click();
      await expect(page.getByTestId("report-table")).toBeVisible();
      await noSidewaysScroll(page, `${t} by month at 320`);
    }
    // a control is at least 44px tall
    await page.getByTestId("report-tabbtn-cust").click();
    for (const id of ["report-tabbtn-cust", "report-period-2026", "report-unit-rev", "report-view-summary", "report-search"]) {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(b.height, id).toBeGreaterThanOrEqual(43.5);
    }
  });

  test("desktop opens customers on the month table", async ({ page }) => {
    await open(page, {}, NOW_FRESH, 1280);
    await expect(page.getByTestId("sales-rail-/sales/report")).toHaveText("דוח מכירות");
    await expect(page.getByTestId("report-table")).toBeVisible();
    await expect(page.getByTestId("report-view-months")).toHaveAttribute("aria-pressed", "true");
    await noSidewaysScroll(page, "customers at 1280");
  });

  test("a sort the period cannot honour falls back to the default, and the phone says what it is sorted by", async ({ page }) => {
    await open(page, {}, NOW_FRESH, 1280);
    await page.getByTestId("report-period-all").click();
    const th = page.locator("th[aria-sort] button").filter({ hasText: "ספט׳ 24" }).first();
    await th.click();
    await page.getByTestId("report-period-2026").click();
    // that month is not in 2026: no orphaned sort, no header claiming one
    await expect(page.locator('th[aria-sort="ascending"], th[aria-sort="descending"]')).toHaveCount(1);
    await expect(page.locator("th[aria-sort]").filter({ hasText: "סה״כ" })).toHaveAttribute("aria-sort", "descending");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId("report-view-summary").click();
    await expect(page.getByTestId("report-sorted-by")).toHaveText("ממוין לפי סה״כ · יורד");
  });

  test("a sort is kept per tab across a tab switch", async ({ page }) => {
    await open(page, {}, NOW_FRESH, 1280);
    await page.locator("th[aria-sort] button").filter({ hasText: "לקוח" }).first().click();
    await page.getByTestId("report-tabbtn-prod").click();
    await page.getByTestId("report-tabbtn-cust").click();
    await expect(page.locator("th[aria-sort]").first()).toHaveAttribute("aria-sort", "ascending");
  });

  test("on a phone the tab bar stays under the app bar while scrolling, and a way back to the top appears", async ({ page }) => {
    await open(page);
    await expect(page.getByTestId("report-tabs")).toBeVisible();
    await expect(page.getByTestId("report-to-top")).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 2600));
    const top = await page.getByTestId("report-tabs").evaluate((e) => Math.round(e.getBoundingClientRect().top));
    expect(top).toBeGreaterThanOrEqual(56);
    expect(top).toBeLessThan(120);
    await expect(page.getByTestId("report-to-top")).toBeVisible();
    // switching tab from down there opens the new tab at its top
    await page.getByTestId("report-tabbtn-trend").click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(400);
    await page.evaluate(() => window.scrollTo(0, 2600));
    await page.getByTestId("report-tabbtn-cust").click();
    await page.evaluate(() => window.scrollTo(0, 2600));
    await page.getByTestId("report-to-top").click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("a phone's month table keeps its headers in view while its rows scroll", async ({ page }) => {
    await open(page);
    await page.getByTestId("report-view-months").click();
    const box = page.getByTestId("report-table");
    const h = await box.evaluate((e) => ({ client: e.clientHeight, scroll: e.scrollHeight }));
    expect(h.scroll).toBeGreaterThan(h.client); // it scrolls inside itself
    expect(h.client).toBeLessThan(844);
    await box.evaluate((e) => (e.scrollTop = 600));
    const head = await box.locator("thead th").first().evaluate((e) => Math.round(e.getBoundingClientRect().top - (e.closest("[data-testid=report-table]") as HTMLElement).getBoundingClientRect().top));
    expect(head).toBeLessThanOrEqual(1);
  });

  test("the partial month is keyed under the month table, in the chains table and in the summary line", async ({ page }) => {
    await open(page);
    await expect(page.getByTestId("report-summary")).toContainText("כולל ספטמבר חלקי (עד 27/09)");
    await page.getByTestId("report-view-months").click();
    await expect(page.getByTestId("partial-key")).toContainText("ספט׳ 26 חלקי (עד 27/09)");
    await page.getByTestId("report-tabbtn-chain").click();
    await expect(page.getByTestId("partial-key")).toContainText("חלקי");
    await expect(page.getByTestId("report-summary")).toContainText("כולל ספטמבר חלקי");
    await page.getByTestId("report-period-12").click();
    await expect(page.getByTestId("partial-key")).toHaveCount(0);
  });

  test("units are named where the figures are units: chains KPIs, summary and the trend chart title", async ({ page }) => {
    await open(page);
    await page.getByTestId("report-tabbtn-chain").click();
    await page.getByTestId("report-unit-units").click();
    await expect(page.locator('[data-kpi="turnover"]')).toContainText("יחידות ברשתות");
    await expect(page.locator('[data-kpi="turnover"]')).toContainText("יח׳");
    await expect(page.locator('[data-kpi="dormantRev"]')).toContainText("יחידות בסניפים הישנים");
    await expect(page.getByTestId("report-summary")).toContainText("יח׳");
    await page.getByTestId("report-tabbtn-trend").click();
    await expect(page.getByRole("heading", { name: /יחידות לחודש/ })).toBeVisible();
  });

  test("a figure is never broken across lines at 320px", async ({ page }) => {
    await open(page, {}, NOW_FRESH, 320);
    await page.getByTestId("report-tabbtn-chain").click();
    for (const k of await page.locator('[data-testid="kpi-value"]').all()) {
      const lines = await k.evaluate((e) => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)));
      expect(lines).toBe(1);
    }
  });

  test("the CSV button has one stable name, and what happened is announced separately", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await open(page);
    const btn = page.getByTestId("report-csv");
    await expect(btn).toHaveAccessibleName("העתקת CSV");
    await btn.click();
    await expect(page.getByTestId("report-csv-status")).toHaveText("הטבלה הועתקה");
    await expect(btn).toHaveAccessibleName("העתקת CSV");
  });

  test("a summary row's name is its button's name; its figures are the description", async ({ page }) => {
    await open(page);
    const btn = page.getByTestId("report-row").first().getByRole("button");
    const key = await page.getByTestId("report-row").first().getAttribute("data-key");
    await expect(btn).toHaveAccessibleName(key!);
    await expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(await btn.getAttribute("aria-label")).toBeNull();
    expect(await btn.getAttribute("aria-describedby")).toBeTruthy();
  });

  test("a chart tip closes when the range changes and when focus leaves the chart", async ({ page }) => {
    await open(page, {}, NOW_FRESH, 1280);
    await page.getByTestId("report-tabbtn-daily").click();
    const chart = page.getByTestId("daily-chart");
    await chart.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("report-tip")).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("report-tip")).toHaveCount(0);
    await chart.focus();
    await page.keyboard.press("End");
    await expect(page.getByTestId("report-tip")).toBeVisible();
    await page.getByTestId("report-range-90").dispatchEvent("click");
    await expect(page.getByTestId("report-tip")).toHaveCount(0);
  });

  test("Home and End move between tabs", async ({ page }) => {
    await open(page);
    await page.getByTestId("report-tabbtn-cust").focus();
    await page.keyboard.press("End");
    await expect(page.getByTestId("report-tabbtn-trend")).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Home");
    await expect(page.getByTestId("report-tabbtn-daily")).toHaveAttribute("aria-selected", "true");
  });

  test("the navigation rail does not move between the report and the other screens", async ({ page }) => {
    await open(page, {}, NOW_FRESH, 1440);
    const railOnReport = await page.getByTestId("sales-rail-/sales/today").boundingBox();
    await page.goto("/sales/today");
    const railOnToday = await page.getByTestId("sales-rail-/sales/today").boundingBox();
    expect(Math.round(railOnReport!.x)).toBe(Math.round(railOnToday!.x));
  });

  test("every report control is at least 44px: row buttons, sort heads, segments", async ({ page }) => {
    await open(page, {}, NOW_FRESH, 1280);
    for (const sel of ['[data-testid="report-row"] button', "th button", '[data-testid="report-period"] button', '[data-testid="report-csv"]', '[data-testid="report-heat"]']) {
      const b = (await page.locator(sel).first().boundingBox())!;
      expect(b.height, sel).toBeGreaterThanOrEqual(43.5);
    }
  });

  for (const width of [320, 390, 430]) {
    test(`no month figure is ever cut by the pinned column or the edge at ${width}px, on open or after a scroll`, async ({ page }) => {
      await open(page, {}, NOW_FRESH, width);
      await page.getByTestId("report-view-months").click();
      const check = async (label: string) => {
        const cut = await page.getByTestId("report-table").evaluate((box) => {
          const b = box.getBoundingClientRect();
          const pin = box.querySelector("th.s-rp-first")!.getBoundingClientRect();
          const bad: string[] = [];
          box.querySelectorAll("thead th:not(.s-rp-first)").forEach((th) => {
            const r = th.getBoundingClientRect();
            if (r.width === 0) return;
            // under the pinned column, or hanging off the far edge
            if (r.right > pin.left + 2 && r.left < pin.left - 2) bad.push(`${th.textContent} under the pinned column`);
            if (r.left < b.left - 2 && r.right > b.left + 2) bad.push(`${th.textContent} at the far edge`);
          });
          return bad;
        });
        expect(cut, label).toEqual([]);
      };
      await check("on open");
      await page.getByTestId("report-table").evaluate((e) => e.scrollBy({ left: 140 }));
      await page.waitForTimeout(500); // the snap settles
      await check("after a scroll");
    });
  }

  for (const [width, months] of [[320, 2], [390, 3], [430, 3]] as const) {
    test(`a phone's month view shows at least ${months} months and the total at ${width}px`, async ({ page }) => {
      await open(page, {}, NOW_FRESH, width);
      await page.getByTestId("report-view-months").click();
      const n = await page.getByTestId("report-table").evaluate((box) => {
        const b = box.getBoundingClientRect();
        const pin = box.querySelector("th.s-rp-first")!.getBoundingClientRect();
        return [...box.querySelectorAll("thead th:not(.s-rp-first)")].filter((th) => {
          const r = th.getBoundingClientRect();
          return r.width > 0 && r.left >= b.left - 1 && r.right <= pin.left + 1;
        }).length;
      });
      expect(n, "columns fully visible (months and total)").toBeGreaterThanOrEqual(months + 1);
      // a short figure travels with its full value
      const cell = page.getByTestId("report-row").first().getByTestId("cell-total");
      await expect(cell.locator(".sr-only")).toHaveText(/\d{1,3}(,\d{3})+/);
    });
  }

  test("a search with no match offers to clear it, and carries no zero total", async ({ page }) => {
    await open(page);
    await page.getByTestId("report-search").fill("אין-כזה-בכלל");
    await expect(page.getByTestId("report-summary")).toHaveCount(0);
    await page.getByTestId("report-clear-search").click();
    await expect(page.getByTestId("report-search")).toHaveValue("");
    await expect(page.getByTestId("report-row").first()).toBeVisible();
  });

  test("the year matrix opens on the latest month that has a figure", async ({ page }) => {
    await open(page);
    await page.getByTestId("report-tabbtn-trend").click();
    const ok = await page.getByTestId("year-matrix").evaluate((box) => {
      const b = box.getBoundingClientRect();
      const pin = box.querySelector("th.s-rp-first")!.getBoundingClientRect();
      const r = box.querySelector("[data-latest]")!.getBoundingClientRect();
      return r.left >= b.left - 1 && r.right <= pin.left + 1;
    });
    expect(ok).toBe(true);
  });

  test("the refresh-failed band keeps its action beside its words, in the failure tone", async ({ page }) => {
    await setFakeRole(page, "admin");
    await stubSalesReport(page, { failAfterFirst: true });
    await page.clock.install({ time: new Date(NOW_FRESH) });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/sales/report");
    await expect(page.getByTestId("report-tabs")).toBeVisible();
    await page.clock.fastForward(5 * 60_000 + 2_000);
    const strip = page.getByTestId("report-refresh-failed");
    await expect(strip).toContainText("נבדק לאחרונה");
    const gap = await strip.evaluate((e) => {
      const t = e.querySelector("p")!.getBoundingClientRect();
      const b = e.querySelector("button")!.getBoundingClientRect();
      return Math.abs(t.left - b.right);
    });
    expect(gap).toBeLessThan(700);
  });
});
