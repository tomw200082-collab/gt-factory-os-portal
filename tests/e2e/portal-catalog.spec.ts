// ---------------------------------------------------------------------------
// Tranche 180 — /planning/portal-catalog, what customers can order in the
// customer portal.
//
// Tagged @mocked: stubs the four /api/portal/catalog/* proxies at the browser
// (page.route) over a small stateful catalogue, so the screen runs with no
// backend. Covered: one row per catalogue SKU; a planner's flip posts the whole
// row; Save posts the date, a preset message and the chosen alternative; "Same
// for 500 ml" writes the other size; a passed date is marked; an operator sees
// every control disabled and the waiting count only; a planner opens the
// waiting customers, the WhatsApp link carries the approved text, and Mark
// notified posts and the count drops.
// ---------------------------------------------------------------------------

import { expect, test, type Page } from "@playwright/test";
import { setFakeRole } from "./helpers";

type Row = Record<string, unknown> & { sku: string; key: string; available: boolean; waiting: number };

const base = (over: Partial<Row> & { sku: string; key: string }): Row => ({
  category: "tea",
  title: null,
  variant_title: null,
  on_hand: null,
  available: true,
  back_on: null,
  back_on_passed: false,
  return_note: null,
  alternative_sku: null,
  note: null,
  changed_by: null,
  changed_at: null,
  unavailable_since: null,
  waiting: 0,
  history: [],
  ...over,
});

const catalogue = (): Row[] => [
  base({ key: "detox:1l", sku: "GT-LUI-LOW-1L", title: "DETOX", variant_title: "1000ml", on_hand: 67 }),
  base({ key: "detox:05", sku: "GT-LUI-LOW-0.5L", title: "DETOX", variant_title: "500ml", on_hand: -116 }),
  base({
    key: "calm:1l", sku: "GT-CHA-LOW-1L", title: "CALM", variant_title: "1000ml", on_hand: 425, available: false,
    back_on: "2026-09-01", back_on_passed: true, changed_by: "doreen@example.com", changed_at: "2026-08-30T08:00:00Z",
    unavailable_since: "2026-08-30T08:00:00Z", waiting: 2,
    history: [{ available: false, back_on: "2026-09-01", return_note: null, alternative_sku: null, note: null, changed_by: "doreen@example.com", changed_at: "2026-08-30T08:00:00Z" }],
  }),
  base({ key: "calm:05", sku: "GT-CHA-LOW-0.5L", title: "CALM", variant_title: "500ml" }),
  base({ key: "bowl:1", sku: "AP-BWL-MAT", category: "acc", title: "קערת מאצ׳ה" }),
];

const REQUESTS = [
  { id: "7b1e4a2c-0d3f-4e5a-9b6c-1d2e3f4a5b01", display_name: "קפה לדוגמה", branch: "תל אביב", wa_phone: "972500000001", requested_at: "2026-09-25T09:00:00Z" },
  { id: "7b1e4a2c-0d3f-4e5a-9b6c-1d2e3f4a5b02", display_name: "Bar Lev", branch: "Haifa", wa_phone: "972500000002", requested_at: "2026-09-25T10:00:00Z" },
];

const LIST = /\/api\/portal\/catalog$/;
const CHANGE = /\/api\/portal\/catalog\/[^/?]+$/;
const WAITING = /\/api\/portal\/catalog\/[^/?]+\/requests$/;
const NOTIFIED = /\/api\/portal\/catalog\/[^/?]+\/requests\/[^/?]+\/notified$/;

/** The catalogue as the API would hold it; every POST changes it as the API would. */
async function open(page: Page, role: "planner" | "operator" | "admin" | "viewer") {
  const rows = catalogue();
  const requests = [...REQUESTS];
  const posts: Array<{ sku: string; body: Record<string, unknown> }> = [];
  const notified: string[] = [];
  await setFakeRole(page, role);
  await page.route(LIST, (route) => route.fulfill({ json: { rows } }));
  await page.route(CHANGE, (route) => {
    const sku = decodeURIComponent(new URL(route.request().url()).pathname.split("/").pop()!);
    const body = route.request().postDataJSON() as Record<string, unknown>;
    posts.push({ sku, body });
    const r = rows.find((x) => x.sku === sku)!;
    Object.assign(r, body, { changed_by: "planner@fake.gtfactory", changed_at: new Date(Date.now() + posts.length).toISOString() });
    return route.fulfill({ json: { ok: true } });
  });
  await page.route(WAITING, (route) => route.fulfill({ json: { rows: requests } }));
  await page.route(NOTIFIED, (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-2)!;
    notified.push(id);
    requests.splice(requests.findIndex((q) => q.id === id), 1);
    rows.find((x) => x.sku === "GT-CHA-LOW-1L")!.waiting -= 1;
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/planning/portal-catalog");
  await expect(page.getByTestId("catalog-row-GT-LUI-LOW-1L")).toBeVisible();
  return { rows, posts, notified };
}

test.describe("@mocked portal catalogue", () => {
  test("one row per catalogue SKU, grouped, with on hand as a hint", async ({ page }) => {
    await open(page, "planner");
    await expect(page.locator('[data-testid^="catalog-row-"]')).toHaveCount(catalogue().length);
    const detox05 = page.getByTestId("catalog-row-GT-LUI-LOW-0.5L");
    await expect(detox05).toContainText("DETOX 500ml");
    await expect(detox05).toContainText("On hand -116");
    await expect(page.getByTestId("catalog-row-AP-BWL-MAT")).toContainText("קערת מאצ׳ה");
    await expect(page.getByText("Accessories", { exact: true })).toBeVisible();
  });

  test("a planner's flip posts the whole row at once, and Save posts the date, a preset message and the alternative", async ({ page }) => {
    const { posts } = await open(page, "planner");
    await page.getByTestId("catalog-switch-GT-LUI-LOW-1L").click();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0]).toEqual({
      sku: "GT-LUI-LOW-1L",
      body: { available: false, back_on: null, return_note: null, alternative_sku: null, note: null },
    });
    await expect(page.getByTestId("catalog-switch-GT-LUI-LOW-1L")).toHaveAttribute("aria-checked", "false");
    await expect(page.getByTestId("catalog-row-GT-LUI-LOW-1L")).toContainText("Not available now");

    await page.getByTestId("catalog-back-on-GT-LUI-LOW-1L").fill("2026-10-02");
    await page.getByTestId("catalog-preset-GT-LUI-LOW-1L-1").click();
    await expect(page.getByTestId("catalog-note-GT-LUI-LOW-1L")).toHaveValue("בייצור, חוזר בקרוב");
    await page.getByTestId("catalog-alt-GT-LUI-LOW-1L").selectOption("GT-LUI-LOW-0.5L");
    await page.getByTestId("catalog-save-GT-LUI-LOW-1L").click();
    await expect.poll(() => posts.length).toBe(2);
    expect(posts[1].body).toEqual({
      available: false, back_on: "2026-10-02", return_note: "בייצור, חוזר בקרוב", alternative_sku: "GT-LUI-LOW-0.5L", note: null,
    });
    // saved: the form starts from what the server holds, so Save is idle again
    await expect(page.getByTestId("catalog-save-GT-LUI-LOW-1L")).toBeDisabled();
  });

  test("Same for 500 ml writes the other size, never pointing it at itself", async ({ page }) => {
    const { posts } = await open(page, "planner");
    await page.getByTestId("catalog-switch-GT-LUI-LOW-1L").click();
    await expect.poll(() => posts.length).toBe(1);
    await page.getByTestId("catalog-alt-GT-LUI-LOW-1L").selectOption("GT-LUI-LOW-0.5L");
    await page.getByTestId("catalog-save-GT-LUI-LOW-1L").click();
    await expect.poll(() => posts.length).toBe(2);
    await page.getByTestId("catalog-both-GT-LUI-LOW-1L").click();
    await expect.poll(() => posts.length).toBe(3);
    expect(posts[2]).toEqual({
      sku: "GT-LUI-LOW-0.5L",
      body: { available: false, back_on: null, return_note: null, alternative_sku: null, note: null },
    });
    await expect(page.getByTestId("catalog-switch-GT-LUI-LOW-0.5L")).toHaveAttribute("aria-checked", "false");
  });

  test("a date that has passed is marked, and customers no longer see it", async ({ page }) => {
    await open(page, "planner");
    await expect(page.getByTestId("catalog-passed-GT-CHA-LOW-1L")).toContainText("Expected date passed");
    await expect(page.getByTestId("catalog-row-GT-CHA-LOW-1L")).toContainText("Changed by doreen@example.com");
  });

  test("an operator sees every control disabled and the waiting count only", async ({ page }) => {
    const { posts } = await open(page, "operator");
    await expect(page.getByTestId("catalog-switch-GT-LUI-LOW-1L")).toBeDisabled();
    await expect(page.getByTestId("catalog-switch-GT-CHA-LOW-1L")).toBeDisabled();
    await expect(page.getByTestId("catalog-back-on-GT-CHA-LOW-1L")).toBeDisabled();
    await expect(page.getByTestId("catalog-note-GT-CHA-LOW-1L")).toBeDisabled();
    await expect(page.getByTestId("catalog-alt-GT-CHA-LOW-1L")).toBeDisabled();
    await expect(page.getByTestId("catalog-both-GT-CHA-LOW-1L")).toBeDisabled();
    const waiting = page.getByTestId("catalog-waiting-GT-CHA-LOW-1L");
    await expect(waiting).toHaveText("Waiting: 2");
    await expect(page.locator("details summary", { hasText: "Waiting" })).toHaveCount(0);
    expect(posts).toEqual([]);
  });

  test("a planner opens the waiting customers: the WhatsApp text is the approved one, and Mark notified drops the count", async ({ page }) => {
    const { notified } = await open(page, "planner");
    await page.getByTestId("catalog-waiting-GT-CHA-LOW-1L").click();
    const first = page.getByTestId(`catalog-request-${REQUESTS[0].id}`);
    await expect(first).toContainText("קפה לדוגמה");
    await expect(first).toContainText("תל אביב");
    await expect(first).toContainText("972500000001");
    const href = await page.getByTestId(`catalog-wa-${REQUESTS[0].id}`).getAttribute("href");
    expect(href?.startsWith("https://wa.me/972500000001?text=")).toBe(true);
    expect(decodeURIComponent(href!.split("?text=")[1])).toBe("היי 🙂 CALM 1000ml חזר למלאי ואפשר להזמין שוב בפורטל.");
    await expect(page.getByTestId(`catalog-wa-${REQUESTS[0].id}`)).toHaveAttribute("target", "_blank");

    await page.getByTestId(`catalog-notified-${REQUESTS[0].id}`).click();
    await expect.poll(() => notified).toEqual([REQUESTS[0].id]);
    await expect(page.getByTestId("catalog-waiting-GT-CHA-LOW-1L")).toHaveText("Waiting: 1");
    await expect(page.getByTestId(`catalog-request-${REQUESTS[0].id}`)).toHaveCount(0);
  });
});
