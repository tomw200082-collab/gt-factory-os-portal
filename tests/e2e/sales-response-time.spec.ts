import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { setFakeRole } from "./helpers";

// @mocked — tranche 204 (D-043): response time in working hours.
//   today:     בזמן / עומד לעבור / עבר with the working time left; overdue, then due soon,
//              first inside the section
//   drawer:    the same badge
//   settings:  "זמני תגובה" — days, hours, hot/normal targets, validated, its own save
//   attention: each rep's last 7 days
//
// Screenshots (320, 390 and 1280, light and dark) are taken when P2_SHOTS names a
// directory; they are evidence for review, not assertions. All data is synthetic.

const QUEUE = { daily_cap: 15, order: "newest_first" as const };
const STATS = {
  week_new_leads: 3, working_now: 1, week_converted: 0, queue_today: 3, overdue_count: 1,
  unassigned_open_count: 0, never_contacted_count: 3, uncontactable_count: 0,
};
const RT = { days: [0, 1, 2, 3, 4], start: "09:00", end: "17:00", hot_hours: 2, normal_hours: 8 };
const SETTINGS = {
  sla_hours: 24,
  response_time: RT,
  whatsapp_templates: { new_lead: "", reminder: "", returning_customer: "" },
  assignees: [
    { name: "דנה", email: "dana@synthetic.invalid", active: true },
    { name: "יואב", email: "yoav@synthetic.invalid", active: true },
  ],
  lost_reasons: ["אין תקציב", "אחר"],
  queue: QUEUE,
  last_changes: [{ key: "response_time", actor: "Avi", at: new Date(Date.now() - 2 * 3600e3).toISOString() }],
};

const hour = 3600e3;
const lead = (over: Record<string, unknown> = {}) => ({
  id: "L1", org_id: "O1", org_name: "קפה לדוגמה", contact_name: "נועה", phone_e164: "+972500000001",
  email: null, source: "whatsapp", campaign_name: null, ad_name: null, platform: null, is_organic: true,
  status: "new", lost_reason: null, assignee: "dana@synthetic.invalid", next_touch_at: null, first_touch_at: null,
  possible_duplicate_of: null, converted_order_ref: null, converted_amount: null,
  created_at: new Date(Date.now() - hour).toISOString(), is_existing_customer: false, shopify_customer_id: null,
  shopify_snapshot: null, shopify_snapshot_at: null, age_days: 0,
  sla_deadline_at: new Date(Date.now() + 5 * hour).toISOString(), sla_state: "on_time", next_touch_overdue: false,
  uncontactable: false, sla_class: "normal", sla_minutes_left: 300, conversation: null,
  ...over,
});
// The server order on purpose puts the calm one first; the screen must not rely on it.
const LEADS = [
  lead(),
  lead({ id: "L2", org_name: "בר לדוגמה", contact_name: "עמית", phone_e164: "+972500000002",
    sla_state: "overdue", sla_minutes_left: -120, created_at: new Date(Date.now() - 30 * hour).toISOString(), age_days: 1 }),
  lead({ id: "L3", org_name: "מאפייה לדוגמה", contact_name: "שירה", phone_e164: "+972500000003",
    sla_state: "due_soon", sla_class: "hot", sla_minutes_left: 25 }),
];
const todayRow = (l: ReturnType<typeof lead>) => ({
  lead_id: l.id, item_type: "new_lead", org_id: l.org_id, org_name: l.org_name, contact_name: l.contact_name,
  phone_e164: l.phone_e164, email: null, campaign_name: null, platform: null, status: "new", assignee: l.assignee,
  next_touch_at: null, first_touch_at: null, created_at: l.created_at, is_existing_customer: false,
  shopify_snapshot: null, shopify_snapshot_at: null, converted_order_ref: null, converted_amount: null,
  converted_at: null, sla_deadline_at: l.sla_deadline_at, sla_state: l.sla_state, age_days: l.age_days,
  uncontactable: false, sla_class: l.sla_class, sla_minutes_left: l.sla_minutes_left, conversation: null,
});
const WEEK = [
  { assignee: "dana@synthetic.invalid", total: 6, on_time: 3, due_soon: 1, overdue: 2, met: 3, decided: 5, met_pct: 60 },
  { assignee: "yoav@synthetic.invalid", total: 2, on_time: 2, due_soon: 0, overdue: 0, met: 0, decided: 0, met_pct: null },
];

interface Sent { method: string; body: unknown }

async function stub(page: Page): Promise<Sent[]> {
  const sent: Sent[] = [];
  await page.route("**/api/sales/settings**", (r) => {
    if (r.request().method() === "PUT") {
      sent.push({ method: "PUT", body: r.request().postDataJSON() });
      return r.fulfill({ json: { updated: ["response_time"] } });
    }
    return r.fulfill({ json: SETTINGS });
  });
  await page.route("**/api/sales/journey**", (r) => r.fulfill({ status: 404, json: { error: "not stubbed" } }));
  await page.route("**/api/sales/today**", (r) => r.fulfill({ json: { rows: LEADS.map(todayRow), queue: QUEUE } }));
  await page.route("**/api/sales/tasks**", (r) => r.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/orgs**", (r) => r.fulfill({ json: { rows: [], queue: QUEUE } }));
  await page.route("**/api/sales/week-stats**", (r) => r.fulfill({ json: { stats: STATS } }));
  await page.route("**/api/sales/leads**", (r) => r.fulfill({ json: { rows: LEADS } }));
  await page.route("**/api/sales/leads/*/events", (r) => r.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/attention**", (r) => r.fulfill({ json: { rows: [], response_week: WEEK } }));
  await page.route("**/api/sales/activity**", (r) => r.fulfill({ json: { rows: [] } }));
  return sent;
}

/** axe WCAG 2.x A/AA on the page; every violation listed by rule and target. */
async function axeClean(page: Page, where: string) {
  // a card mid-fade (s-enter, staggered) reads as low contrast: let the animations finish
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
    .map((a) => a.finished.catch(() => undefined))));
  await page.waitForTimeout(150);
  const src = fs.readFileSync(path.join(process.cwd(), "node_modules/axe-core/axe.min.js"), "utf8");
  await page.evaluate(src);
  const violations = await page.evaluate(async () => {
    const r = await (window as unknown as { axe: { run: (c: Document, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[] }> }> }> } })
      .axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } });
    return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
  });
  expect(violations, where).toEqual([]);
}
async function axeBoth(page: Page, where: string) {
  await axeClean(page, `${where} light`);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await axeClean(page, `${where} dark`);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
}

const SHOTS = process.env.P2_SHOTS;
/** target: an element's test id, or null for the viewport. */
async function shoot(page: Page, name: string, target: string | null) {
  if (!SHOTS) return;
  for (const width of [320, 390, 1280]) {
    for (const scheme of ["light", "dark"] as const) {
      await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 });
      await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), scheme === "dark");
      await page.waitForTimeout(200);
      const file = `${SHOTS}/${name}-${width}-${scheme}.png`;
      if (target) await page.getByTestId(target).screenshot({ path: file, animations: "disabled" });
      else await page.screenshot({ path: file, animations: "disabled" });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${name} ${width} ${scheme} scrolls sideways`).toBeLessThanOrEqual(0);
    }
  }
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.setViewportSize({ width: 1280, height: 900 });
}

test.beforeEach(async ({ page }) => {
  await setFakeRole(page, "admin");
});

test("Today shows the three states with the working time left, overdue then due soon first @mocked", async ({ page }) => {
  await stub(page);
  await page.goto("/sales/today");
  await expect(page.getByTestId("today-card-L1")).toBeVisible({ timeout: 30_000 });

  const ids = await page.locator('[data-testid^="today-card-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  expect(ids).toEqual(["today-card-L2", "today-card-L3", "today-card-L1"]);
  await expect(page.getByTestId("today-card-L2").getByTestId("sla-badge")).toHaveText("עבר");
  await expect(page.getByTestId("today-card-L3").getByTestId("sla-badge")).toHaveText("עומד לעבור · עוד 25 דקות עבודה");
  await expect(page.getByTestId("today-card-L1").getByTestId("sla-badge")).toHaveText("בזמן · עוד 5 שעות עבודה");
  await axeBoth(page, "today");
  await shoot(page, "today", null);
});

test("the drawer carries the same badge @mocked", async ({ page }) => {
  await stub(page);
  await page.goto("/sales/leads?lead=L3");
  const drawer = page.getByTestId("lead-drawer");
  await expect(drawer).toBeVisible({ timeout: 30_000 });
  await expect(drawer.getByTestId("sla-badge")).toHaveText("עומד לעבור · עוד 25 דקות עבודה");
  await expect(drawer.getByTestId("sla-badge")).toHaveAttribute("data-state", "due_soon");
  await axeBoth(page, "drawer");
  await shoot(page, "drawer", "lead-drawer");
});

test("leads list cards carry the badge @mocked", async ({ page }) => {
  await stub(page);
  await page.goto("/sales/leads");
  // the table (wide) and the cards (phone) both render; only one is visible at a width
  await expect(page.locator(':text("בר לדוגמה"):visible').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid="sla-badge"]:visible', { hasText: "עבר" }).first()).toBeVisible();
  await expect(page.locator('[data-testid="sla-badge"]:visible', { hasText: "בזמן · עוד 5 שעות עבודה" }).first()).toBeVisible();
  await expect(page.locator('[data-testid="sla-badge"]:visible', { hasText: "עומד לעבור · עוד 25 דקות עבודה" }).first()).toBeVisible();
  await shoot(page, "leads", null);
});

test("settings edit the working days, hours and both targets, validated, with their own save @mocked", async ({ page }) => {
  const sent = await stub(page);
  await page.goto("/sales/settings");
  const section = page.getByTestId("settings-response-time");
  await expect(section).toBeVisible({ timeout: 30_000 });
  await expect(section).toContainText("זמני תגובה");
  await expect(section).toContainText("שונה ע״י Avi לפני שעתיים");
  // the old 24-hour field is gone
  await expect(page.getByTestId("settings-sla-hours")).toHaveCount(0);
  await expect(page.getByTestId("rt-save")).toBeDisabled();
  await axeBoth(page, "settings");

  // invalid: an end before the start, and a hot target slower than normal
  await page.getByTestId("rt-end").fill("08:00");
  await expect(page.getByTestId("rt-hours-error")).toHaveText("שעת הסיום צריכה להיות אחרי שעת ההתחלה");
  await page.getByTestId("rt-end").fill("17:00");
  await page.getByTestId("rt-hot").fill("9");
  await expect(page.getByTestId("rt-hot-error")).toHaveText("היעד לליד חם לא יכול להיות ארוך מהיעד לליד רגיל");
  await expect(page.getByTestId("rt-save")).toBeDisabled();

  // valid: Friday on, hot 1.5 hours
  await page.getByTestId("rt-hot").fill("1.5");
  await page.getByRole("button", { name: "שישי" }).click();
  await expect(page.getByTestId("rt-day-5")).toHaveAttribute("aria-pressed", "true");
  await shoot(page, "settings-response-time", "settings-response-time");
  await page.getByTestId("rt-save").click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0].body).toEqual({ response_time: { days: [0, 1, 2, 3, 4, 5], start: "09:00", end: "17:00", hot_hours: 1.5, normal_hours: 8 } });
  await expect(page.getByTestId("rt-saved")).toHaveText("נשמר ✓");
});

test("attention shows each rep's last 7 days @mocked", async ({ page }) => {
  await stub(page);
  await page.goto("/sales/attention");
  const week = page.getByTestId("rt-week");
  await expect(week).toBeVisible({ timeout: 30_000 });
  await expect(week).toContainText("זמני תגובה · 7 ימים אחרונים");
  const dana = page.getByTestId("rt-week-dana@synthetic.invalid");
  await expect(dana).toContainText("דנה");
  await expect(dana.getByTestId("rt-week-met")).toHaveText("60% · 3 מתוך 5");
  await expect(page.getByTestId("rt-week-yoav@synthetic.invalid").getByTestId("rt-week-met")).toHaveText("עוד אין");
  await axeBoth(page, "attention");
  await shoot(page, "attention-week", "rt-week");
});
