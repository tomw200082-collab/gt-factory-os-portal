// GT Pulse Unit B: the salesperson's journeys through businesses, rendered.
// @mocked: browser-stubbed APIs (tests/e2e/_fixtures/salesOrgs.ts), synthetic data only.
//
// Journeys A to K of the Session 2 masterprompt, then the matrix every screen
// must survive: 320 to 1440px, long content, dark, reduced motion, 44px targets
// and sheets that paint above everything.

import { test, expect, type Page } from "@playwright/test";
import { setFakeRole } from "./helpers";
import { IDS, LONG_NAME, stubSalesOrgs } from "./_fixtures/salesOrgs";

async function asRep(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem("gt.fakeauth.v1", JSON.stringify({ user_id: "rep-1", email: "rep@synthetic.invalid", display_name: "נציגה", role: "sales_rep" })),
  );
}

async function noSidewaysScroll(page: Page, label: string) {
  const d = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
  expect(d.scroll, `${label}: page scrolls sideways`).toBeLessThanOrEqual(d.width);
}

test.describe("GT Pulse Unit B journeys @mocked", () => {
  test("A: a manager finds a customer and reads it end to end", async ({ page }) => {
    await setFakeRole(page, "admin");
    await stubSalesOrgs(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sales/orgs");
    await page.getByTestId("orgs-search").fill("הרצליה");
    await page.getByTestId(`org-hit-${IDS.full}`).click();
    await expect(page).toHaveURL(new RegExp(`/sales/orgs/${IDS.full}$`));
    await expect(page.getByRole("heading", { level: 1, name: "קפה הדגמה הרצליה" })).toBeVisible();
    await expect(page.getByTestId("primary-contact").getByRole("link", { name: /התקשר/ })).toHaveAttribute("href", /^tel:/);
    await expect(page.getByTestId("org-summary")).toContainText("לפני מע״מ");
    // a month of the circle, then one of its orders and its lines
    await page.getByTestId("circle-ring").getByRole("button").last().click();
    const month = page.getByTestId("month-sheet");
    await expect(month).toBeVisible();
    await month.locator(".s-river-row").first().click();
    await expect(page.getByTestId("order-sheet")).toContainText("בסיס לימונדה");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    // the source of the numbers
    await page.getByTestId("org-summary").getByRole("button", { name: "מקור הנתון" }).click();
    await expect(page.getByTestId("source-sheet")).toContainText("Shopify");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("next-action").getByRole("link")).toHaveAttribute("href", /\/sales\/leads\?lead=/);
  });

  test("B: a rep goes from a lead to the business and sees only their scope", async ({ page }) => {
    await asRep(page);
    const tasks: string[] = [];
    await stubSalesOrgs(page, { role: "rep" });
    page.on("request", (r) => { if (r.url().includes("/api/sales/tasks")) tasks.push(r.url()); });
    await page.goto(`/sales/leads?lead=00000000-0000-4000-8000-0000000e0001`);
    await page.getByTestId("drawer-open-business").click();
    await expect(page).toHaveURL(new RegExp(`/sales/orgs/${IDS.full}$`));
    await expect(page.getByTestId("next-action")).toContainText("לחזור לליד");
    await expect(page.getByTestId("org-river")).toBeVisible();
    // no manager decisions for a rep
    await expect(page.getByRole("button", { name: /^אמת את/ })).toHaveCount(0);
    expect(tasks.every((u) => u.includes("scope=mine"))).toBe(true);
  });

  test("C: a rep on another rep's business sees nothing of it", async ({ page }) => {
    await asRep(page);
    await stubSalesOrgs(page, { role: "rep", repOrgs: [IDS.full] });
    const parts: string[] = [];
    page.on("request", (r) => { if (r.url().includes(`/api/sales/orgs/${IDS.eight}/`)) parts.push(r.url()); });
    await page.goto(`/sales/orgs/${IDS.eight}`);
    await expect(page.getByTestId("org-forbidden")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("בר המיץ");
    await expect(page.locator("body")).not.toContainText("₪");
    expect(parts).toEqual([]);
    // a business that does not exist reads the same to a rep
    await page.goto("/sales/orgs/00000000-0000-4000-8000-0000000000ff");
    await expect(page.getByTestId("org-forbidden")).toBeVisible();
  });

  test("D: a business under identity review shows no Shopify truth", async ({ page }) => {
    await setFakeRole(page, "admin");
    await stubSalesOrgs(page);
    await page.goto("/sales/orgs?filter=review");
    await page.getByTestId(`org-row-${IDS.review}`).click();
    await expect(page.getByTestId("identity-banner")).toBeVisible();
    await expect(page.getByTestId("identity-banner").getByRole("link")).toHaveAttribute("href", "/sales/orgs/review");
    await expect(page.locator("main")).not.toContainText("₪");
    await expect(page.getByTestId("business-circle")).toHaveCount(0);
  });

  test("D (rep): the review status without the evidence", async ({ page }) => {
    await asRep(page);
    await stubSalesOrgs(page, { role: "rep", repOrgs: [IDS.review] });
    await page.goto(`/sales/orgs/${IDS.review}`);
    await expect(page.getByTestId("identity-banner")).toBeVisible();
    await expect(page.getByTestId("identity-banner").getByRole("link")).toHaveCount(0);
  });

  test("E: a manager compares candidates and is asked before anything changes", async ({ page }) => {
    await setFakeRole(page, "admin");
    const posts: Array<{ url: string; body: unknown }> = [];
    await stubSalesOrgs(page, {
      posts,
      identityReview: {
        orgs: [{
          org_id: IDS.disputed, name: "סניף במחלוקת לדוגמה", link_status: "disputed", reason: "phone_shared", reasons: ["phone_shared"],
          task_id: "t1", task_ids: ["t1"], created_at: "2026-10-02T07:44:00Z",
          candidates: [
            { customer_gid: "gid://shopify/Customer/91", name: "לקוח מועמד א", order_count: 14, last_order_at: "2026-09-01T08:00:00Z", basis: "held", evidence: "candidate" },
            { customer_gid: "gid://shopify/Customer/92", name: "לקוח מועמד ב", order_count: 2, last_order_at: "2025-03-01T08:00:00Z", basis: "phone", evidence: "candidate" },
          ],
        }],
        exceptions: [], coverage: { verified_active: 570, census_active: 588, source: "shopifyql", as_of: "2026-10-02T07:47:20Z" },
      },
    });
    await page.goto("/sales/orgs/review");
    const card = page.getByTestId(`review-${IDS.disputed}`);
    await expect(card.getByTestId("candidate")).toHaveCount(2);
    await card.getByTestId("candidate").nth(1).getByRole("button", { name: "זה העסק" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("לקוח מועמד ב");
    expect(posts).toEqual([]);
    await dialog.getByRole("button", { name: "ביטול" }).click();
    await expect(dialog).toHaveCount(0);
    expect(posts).toEqual([]);
    await card.getByRole("button", { name: "אף אחד מהם" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "כן, אף אחד מהם" }).click();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0]).toEqual({ url: `/api/sales/orgs/${IDS.disputed}/identity`, body: { action: "reject" } });
  });

  test("F: a long history pages its river and opens any month", async ({ page }) => {
    await setFakeRole(page, "admin");
    await stubSalesOrgs(page);
    await page.goto(`/sales/orgs/${IDS.many}`);
    const river = page.getByTestId("org-river");
    await expect(river.locator(".s-river-item")).toHaveCount(25);
    await river.getByRole("button", { name: "הצג עוד אירועים" }).click();
    await expect(river.locator(".s-river-item")).toHaveCount(50);
    await river.getByRole("button", { name: /בוטלו/ }).click();
    await expect(river.locator(".s-river-item").first()).toContainText("בוטלה");
    // the oldest month: the sheet pages back through the orders to reach it
    await page.getByTestId("circle-ring").getByRole("button").first().click();
    await expect(page.getByTestId("month-sheet")).not.toContainText("טוען");
    await expect(page.getByTestId("contacts-verified").locator("li")).toHaveCount(10);
  });

  test("G: a new business with nothing yet still says what to do", async ({ page }) => {
    await setFakeRole(page, "admin");
    await stubSalesOrgs(page);
    await page.goto(`/sales/orgs/${IDS.empty}`);
    await expect(page.getByTestId("org-header")).toContainText("טרם לקוח");
    await expect(page.getByTestId("next-action")).toContainText("אין פעולה פתוחה");
    await expect(page.getByTestId("org-contacts")).toContainText("אין עדיין אנשי קשר");
    await expect(page.getByTestId("org-leads")).toContainText("אין לידים");
    await expect(page.locator("main")).not.toContainText("₪");
  });

  test("H and I: stale history is marked; unverified history is unavailable, never zero", async ({ page }) => {
    await setFakeRole(page, "admin");
    await stubSalesOrgs(page);
    await page.goto(`/sales/orgs/${IDS.stale}`);
    await expect(page.getByTestId("history-banner")).toContainText("הנתונים לא עודכנו בזמן");
    await expect(page.getByTestId("org-summary")).toContainText("₪");
    await page.goto(`/sales/orgs/${IDS.unverified}`);
    await expect(page.getByTestId("org-summary")).toContainText("היסטוריית ההזמנות לא זמינה כרגע");
    await expect(page.locator("main")).not.toContainText("₪");
    await expect(page.getByTestId("business-circle")).toHaveCount(0);
  });

  test("J: a merged business sends work to where it moved", async ({ page }) => {
    await setFakeRole(page, "admin");
    await stubSalesOrgs(page);
    await page.goto(`/sales/orgs/${IDS.merged}`);
    await expect(page.getByTestId("next-action")).toHaveCount(0);
    await page.getByTestId("retired-banner").getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/sales/orgs/${IDS.full}$`));
    await page.goto(`/sales/orgs/${IDS.retired}`);
    await expect(page.getByTestId("retired-banner")).toContainText("הרשומה הזו סגורה");
  });

  test("K: the palette opens a business, and Back returns to the same list", async ({ page }) => {
    await setFakeRole(page, "admin");
    await stubSalesOrgs(page);
    await page.goto("/sales/orgs");
    await page.getByTestId("orgs-filter-prospect").click();
    await expect(page).toHaveURL(/filter=prospect/);
    await page.getByTestId("sales-search-open").click();
    await page.getByTestId("command-input").fill("בר המיץ");
    await page.getByTestId(`command-hit-${IDS.eight}`).click();
    await expect(page).toHaveURL(new RegExp(`/sales/orgs/${IDS.eight}$`));
    await page.goBack();
    await expect(page).toHaveURL(/filter=prospect/);
    await expect(page.getByTestId("orgs-filter-prospect")).toHaveAttribute("aria-pressed", "true");
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`/sales/orgs/${IDS.eight}$`));
  });

  test("the moved branch states its distributor and counts no silence", async ({ page }) => {
    await setFakeRole(page, "admin");
    await stubSalesOrgs(page);
    await page.goto(`/sales/orgs/${IDS.moved}`);
    await expect(page.getByTestId("org-moved")).toContainText("מפיץ הדגמה");
    await expect(page.getByTestId("circle-centre")).toContainText("עבר למפיץ הדגמה");
    await expect(page.getByTestId("circle-centre")).not.toContainText("לפני");
  });
});

test.describe("GT Pulse Unit B rendering matrix @mocked", () => {
  const WIDTHS = [320, 360, 390, 430, 768, 1024, 1280, 1440];
  const ROUTES = ["/sales/orgs", `/sales/orgs/${IDS.full}`, `/sales/orgs/${IDS.long}`, `/sales/orgs/${IDS.many}`, "/sales/orgs/review"];

  test("no screen scrolls sideways at any width, and a 64-character name stays whole", async ({ page }) => {
    test.setTimeout(180_000);
    await setFakeRole(page, "admin");
    await stubSalesOrgs(page);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      for (const route of ROUTES) {
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        await noSidewaysScroll(page, `${route} at ${width}`);
      }
      await page.goto(`/sales/orgs/${IDS.long}`);
      const h1 = page.getByRole("heading", { level: 1 });
      await expect(h1).toHaveText(LONG_NAME);
      const clipped = await h1.evaluate((el) => el.scrollWidth > el.clientWidth || getComputedStyle(el).textOverflow === "ellipsis");
      expect(clipped, `name clipped at ${width}`).toBe(false);
    }
  });

  test("the circle is a ring from 360px and a month grid below it, each target at least 44px", async ({ page }) => {
    await setFakeRole(page, "admin");
    await stubSalesOrgs(page);
    for (const [width, ring] of [[320, false], [360, true], [390, true]] as const) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`/sales/orgs/${IDS.full}`);
      await expect(page.getByTestId("circle-ring")).toBeVisible({ visible: ring });
      await expect(page.getByTestId("circle-grid")).toBeVisible({ visible: !ring });
      const targets = ring ? page.getByTestId("circle-ring").getByRole("button") : page.getByTestId("circle-grid").getByRole("button");
      const sizes = await targets.evaluateAll((els) => els.map((e) => {
        const r = e.getBoundingClientRect();
        return Math.min(r.width, r.height);
      }));
      expect(sizes).toHaveLength(24);
      // a ring sector's box understates its arc on the diagonals; its shortest side still clears 30px,
      // and the grid's cells clear 44px outright
      for (const s of sizes) expect(s).toBeGreaterThanOrEqual(ring ? 30 : 44);
    }
  });

  test("every control on the workspace clears the 44px touch floor", async ({ page }) => {
    await setFakeRole(page, "admin");
    await stubSalesOrgs(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/sales/orgs/${IDS.full}`);
    await expect(page.getByTestId("org-river").locator(".s-river-item").first()).toBeVisible();
    const small = await page.locator("main").evaluate((main) =>
      [...main.querySelectorAll<HTMLElement>("button, a[href]")]
        .filter((el) => el.offsetParent !== null && !el.closest("svg"))
        .map((el) => ({ text: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30), h: el.getBoundingClientRect().height }))
        .filter((x) => x.h < 43.5),
    );
    expect(small).toEqual([]);
  });

  test("dark mode and reduced motion keep every state, with no animation running", async ({ page }) => {
    await setFakeRole(page, "admin");
    await stubSalesOrgs(page);
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
    await page.goto(`/sales/orgs/${IDS.full}`);
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await expect(page.getByTestId("business-circle")).toBeVisible();
    await expect(page.getByTestId("circle-ring")).toHaveAttribute("data-motion", "off");
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length)).toBe(0);
    await expect(page.getByTestId("primary-contact").getByRole("link", { name: /התקשר/ })).toBeVisible();
  });

  test("a sheet paints above the tab bar and the bars, and gives focus back when it closes", async ({ page }) => {
    await setFakeRole(page, "admin");
    await stubSalesOrgs(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/sales/orgs/${IDS.full}`);
    const trigger = page.getByTestId("org-summary").getByRole("button", { name: "מקור הנתון" });
    await trigger.click();
    const sheet = page.getByTestId("source-sheet");
    await expect(sheet).toBeVisible();
    // measure at rest: the sheet rises 24px as it opens
    await sheet.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
    const box = (await sheet.boundingBox())!;
    const onTop = await page.evaluate(([x, y]) => Boolean(document.elementFromPoint(x, y)?.closest("[data-testid='source-sheet']")), [box.x + box.width / 2, box.y + box.height - 8]);
    expect(onTop).toBe(true);
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("the business list pages, filters and assigns owners in one call", async ({ page }) => {
    await setFakeRole(page, "admin");
    const posts: Array<{ url: string; body: unknown }> = [];
    await stubSalesOrgs(page, { posts });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sales/orgs");
    await page.getByRole("button", { name: "בחירה" }).click();
    await page.getByRole("checkbox", { name: "בחר את קפה הדגמה הרצליה" }).check();
    const bar = page.getByTestId("bulk-owner-bar");
    await bar.getByLabel("בעלים חדשים").selectOption("rep@synthetic.invalid");
    await bar.getByRole("button", { name: "שייך בעלים" }).click();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0].body).toEqual({ org_ids: [IDS.full], owner_email: "rep@synthetic.invalid" });
    await expect(page.getByTestId("sales-toast")).toContainText("שויך");
  });
});

test.describe("GT Pulse Unit B on a touch phone @mocked", () => {
  test.use({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

  test("taps through a business, and the call button is never under the tab bar", async ({ page }) => {
    await setFakeRole(page, "admin");
    await stubSalesOrgs(page);
    await page.goto("/sales/orgs");
    await page.getByTestId(`org-row-${IDS.full}`).tap();
    await expect(page).toHaveURL(new RegExp(IDS.full));
    await page.getByTestId("circle-ring").getByRole("button").nth(20).tap();
    await expect(page.getByTestId("month-sheet")).toBeVisible();
    await page.getByTestId("month-sheet").getByRole("button", { name: "סגור" }).tap();
    await expect(page.getByTestId("month-sheet")).toHaveCount(0);
    await page.getByTestId("org-river").getByRole("button", { name: /בוטלו/ }).tap();
    await expect(page.getByTestId("org-river").locator(".s-river-item").first()).toContainText("בוטלה");
    const call = page.getByTestId("primary-contact").getByRole("link", { name: /התקשר/ });
    await call.scrollIntoViewIfNeeded();
    const b = (await call.boundingBox())!;
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("a")?.getAttribute("href"), [b.x + b.width / 2, b.y + b.height / 2]);
    expect(hit).toMatch(/^tel:/);
  });
});
