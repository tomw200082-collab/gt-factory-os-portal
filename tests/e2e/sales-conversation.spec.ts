import { test, expect, type Page } from "@playwright/test";
import { setFakeRole } from "./helpers";

// @mocked — tranche 203 (D-042, D-044): the lead conversation.
//   settings: the automatic sequence read-only, and the quick messages saved one by one
//   drawer:   what the line sent automatically, and the WhatsApp button opening the
//             suggested message signed by the sender; disabled for a lead who opted out
//   today:    the same button on the card
//
// Screenshots (settings section and drawer, 390 and 1280, light and dark) are taken when
// P1_SHOTS names a directory; they are evidence for review, not assertions.

const QUEUE = { daily_cap: 15, order: "newest_first" as const };
const STATS = {
  week_new_leads: 0, working_now: 0, week_converted: 0, queue_today: 2, overdue_count: 0,
  unassigned_open_count: 2, never_contacted_count: 2, uncontactable_count: 0,
};

const QUICK = {
  returning_customer: "היי {{name}}, איזה כיף לשמוע ממך שוב!\n{{rep}}, GT Everyday",
  tapped_order_no_order: "היי {{name}}, ראיתי שרציתם להזמין, מעולה!\n{{rep}}, GT Everyday",
  asked_more: "היי {{name}}, ראיתי שביקשתם לשמוע עוד, איזה כיף!\nמתי נוח לך לשיחה קצרה? אספר על המשקאות ונמצא יחד מה הכי מתאים ל־{{business}}.\n{{rep}}, GT Everyday",
  no_answer: "היי {{name}}, ניסיתי להשיג אותך בטלפון ולא הצלחתי.\n{{rep}}, GT Everyday",
  menu_no_reply: "היי {{name}}, מה שלומך?\nרציתי לוודא שקיבלתם את {{menu}}.\n{{rep}}, GT Everyday",
  no_auto: "היי {{name}}, תודה שפניתם ל־GT Everyday!\n{{rep}}, GT Everyday",
};

const SETTINGS = {
  sla_hours: 24,
  whatsapp_templates: { new_lead: "היי {{name}}, כאן תום", reminder: "ה", returning_customer: "ל" },
  assignees: [{ name: "Avi", email: "avi@gt.co.il", active: true }],
  lost_reasons: ["אין תקציב", "אחר"],
  queue: QUEUE,
  last_changes: [],
  whatsapp_quick_messages: QUICK,
  quick_message_changes: { no_answer: { actor: "Avi", at: new Date(Date.now() - 2 * 3600e3).toISOString() } },
  quick_message_signer: "אבי",
};

const JOURNEY = {
  mode: { state: "test", outreach_gate_open: false, test_phone_count: 1, phone_number_id_set: true, send_token_set: true },
  steps: [
    { id: "first_menu", trigger: { kind: "first_message", when: "menu" },
      text: "היי, כיף שפניתם ל־GT Everyday!\nהנה {{menu}} שלנו: משקאות שהאורחים שלכם יצלמו, והצוות שלכם ילמד להכין כבר ביום הראשון.\nויש עוד הרבה מאיפה שזה בא (:\nאיך תרצו להמשיך?",
      footer: "מדי פעם נשלח לכם עדכונים על המוצרים. לא מתאים? כתבו \"הסר\"",
      buttons: [
        { kind: "reply", id: "lj.order", title: "אני רוצה להזמין" },
        { kind: "reply", id: "lj.more", title: "רוצה לשמוע עוד" },
        { kind: "reply", id: "lj.not_now", title: "תודה, לא כרגע" },
      ], effects: [] },
    { id: "more_info", trigger: { kind: "button", button_id: "lj.more" },
      text: "בשמחה! נתקשר אליכם בהקדם לשיחה קצרה.", footer: null,
      buttons: [{ kind: "link", title: "שאלות ותשובות" }], effects: ["owner_alerted"] },
    { id: "not_now", trigger: { kind: "button", button_id: "lj.not_now" },
      text: "מבינים לגמרי, ותודה רבה שהתעניינתם ב־GT Everyday.", footer: null, buttons: [], effects: ["lost_not_now", "opted_out"] },
    { id: "wake_2", trigger: { kind: "wake", step: 2, slots: "morning", on: "follow_up_date", template: "gt_lead_wake_2" },
      text: "בוקר טוב {{name}}!\nאתקשר אליך היום להמשך השיחה שלנו.\n{{rep}}, GT Everyday", footer: "להסרה מהעדכונים אפשר להשיב \"הסר\"",
      buttons: [{ kind: "link", title: "שאלות ותשובות" }], effects: [] },
  ],
  wake_rules: {
    timezone: "Asia/Jerusalem", days: "sun_thu",
    slots: { morning: { from: "10:00", to: "11:30" }, afternoon: { from: "15:00", to: "17:00" } },
    first_after_hours: 2, min_hours_between: 48, quiet_after_staff_hours: 24, retry_after_hours: 24, max_messages: 4,
  },
};

const conversation = (over: Record<string, unknown> = {}) => ({
  suggested_situation: "asked_more",
  opted_out: false,
  menu_key: "matcha",
  menu_label: "תפריט המאצ׳ה",
  auto: [
    { kind: "first_menu", step: "w1", at: "2026-10-02T07:40:00Z", menu: "matcha", delivered_at: "2026-10-02T07:41:00Z", read_at: "2026-10-02T07:42:00Z", failed: false },
    { kind: "more_info", step: "w2", at: "2026-10-02T07:46:00Z", menu: null, delivered_at: "2026-10-02T07:46:30Z", read_at: null, failed: false },
  ],
  taps: [{ button_id: "lj.more", at: "2026-10-02T07:45:00Z", title: "רוצה לשמוע עוד" }],
  ...over,
});

const lead = (over: Record<string, unknown> = {}) => ({
  id: "L1", org_id: "O1", org_name: "קפה נחת", contact_name: "דנה כהן", phone_e164: "+972521234567",
  email: null, source: "whatsapp", campaign_name: null, ad_name: null, platform: null, is_organic: true,
  status: "new", lost_reason: null, assignee: null, next_touch_at: null, first_touch_at: null,
  possible_duplicate_of: null, converted_order_ref: null, converted_amount: null,
  created_at: "2026-10-02T07:39:00Z", is_existing_customer: false, shopify_customer_id: null,
  shopify_snapshot: null, shopify_snapshot_at: null, age_days: 1,
  sla_deadline_at: "2026-10-03T07:39:00Z", sla_state: "within", next_touch_overdue: false, uncontactable: false,
  conversation: conversation(),
  ...over,
});

const ROWS = [
  lead(),
  lead({ id: "L2", org_name: "בר שקט", contact_name: "יוסי", phone_e164: "+972529999999",
    conversation: conversation({ opted_out: true, suggested_situation: "opted_out", taps: [{ button_id: "lj.not_now", at: "2026-10-02T08:00:00Z", title: "תודה, לא כרגע" }] }) }),
];

const todayRow = (l: ReturnType<typeof lead>) => ({
  lead_id: l.id, item_type: "new_lead", org_id: l.org_id, org_name: l.org_name, contact_name: l.contact_name,
  phone_e164: l.phone_e164, email: null, campaign_name: null, platform: null, status: "new", assignee: null,
  next_touch_at: null, first_touch_at: null, created_at: new Date(Date.now() - 2 * 3600e3).toISOString(),
  is_existing_customer: false, shopify_snapshot: null, shopify_snapshot_at: null, converted_order_ref: null,
  converted_amount: null, converted_at: null, sla_deadline_at: new Date(Date.now() + 20 * 3600e3).toISOString(),
  sla_state: "within", age_days: 0, uncontactable: false, conversation: l.conversation,
});

interface Sent { url: string; method: string; body: unknown }

async function stub(page: Page): Promise<Sent[]> {
  const sent: Sent[] = [];
  await page.route("**/api/sales/settings**", (r) => {
    if (r.request().method() === "PUT") {
      sent.push({ url: r.request().url(), method: "PUT", body: r.request().postDataJSON() });
      return r.fulfill({ json: { updated: ["whatsapp_quick_messages"] } });
    }
    return r.fulfill({ json: SETTINGS });
  });
  await page.route("**/api/sales/journey**", (r) => r.fulfill({ json: JOURNEY }));
  await page.route("**/api/sales/today**", (r) => r.fulfill({ json: { rows: ROWS.map(todayRow), queue: QUEUE } }));
  await page.route("**/api/sales/tasks**", (r) => r.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/orgs**", (r) => r.fulfill({ json: { rows: [], queue: QUEUE } }));
  await page.route("**/api/sales/week-stats**", (r) => r.fulfill({ json: { stats: STATS } }));
  await page.route("**/api/sales/leads**", (r) => r.fulfill({ json: { rows: ROWS } }));
  await page.route("**/api/sales/leads/*/events", (r) => r.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/leads/*/outreach", (r) => {
    sent.push({ url: r.request().url(), method: "POST", body: r.request().postDataJSON() });
    return r.fulfill({ json: { lead_id: "L1", event_id: "E9" } });
  });
  return sent;
}

const waText = (href: string | null) => decodeURIComponent(new URL(href ?? "").searchParams.get("text") ?? "");
const SHOTS = process.env.P1_SHOTS;

async function shoot(page: Page, name: string, target: string) {
  if (!SHOTS) return;
  for (const width of [390, 1280]) {
    for (const scheme of ["light", "dark"] as const) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), scheme === "dark");
      await page.waitForTimeout(150);
      await page.getByTestId(target).screenshot({ path: `${SHOTS}/${name}-${width}-${scheme}.png`, animations: "disabled" });
      // no sideways scroll on the page
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

test("settings show the automatic sequence read-only, and save a quick message on its own @mocked", async ({ page }) => {
  const sent = await stub(page);
  await page.goto("/sales/settings");

  const journey = page.getByTestId("settings-journey");
  await expect(journey).toBeVisible();
  await expect(page.getByTestId("journey-mode")).toHaveText("מצב בדיקה: ההודעות יוצאות רק לטלפון בדיקה אחד.");
  await expect(page.getByTestId("journey-step-first_menu")).toContainText("אני רוצה להזמין");
  await expect(page.getByTestId("journey-when-more_info")).toContainText("רוצה לשמוע עוד");
  await expect(page.getByTestId("journey-when-wake_2")).toContainText("10:00–11:30");
  await expect(journey.locator("textarea, input")).toHaveCount(0);
  await expect(journey).toContainText("שינוי בנוסח עובר דרך תום");

  // the old three templates are gone from settings
  await expect(page.getByTestId("settings-template-new_lead")).toHaveCount(0);

  const quick = page.getByTestId("settings-quick");
  await expect(quick).toBeVisible();
  await expect(page.getByTestId("quick-no_answer")).toContainText("שונה ע״י Avi לפני שעתיים");
  await expect(page.getByTestId("quick-preview-asked_more")).toContainText("אבי, GT Everyday");
  await expect(page.getByTestId("quick-preview-asked_more")).not.toContainText("{{");

  // a chip goes in where the cursor is
  const ta = page.getByTestId("quick-text-no_answer");
  await ta.click();
  await ta.press("Control+End");
  await page.getByTestId("quick-no_answer").getByTestId("quick-chip-business").click();
  await expect(ta).toHaveValue(/GT Everyday\{\{business\}\}$/);
  await page.getByTestId("quick-save-no_answer").click();
  await expect.poll(() => sent.filter((s) => s.method === "PUT").length).toBe(1);
  expect(sent[0].body).toEqual({ whatsapp_quick_messages: { no_answer: `${QUICK.no_answer}{{business}}` } });
  await expect(page.getByTestId("quick-no_answer")).toContainText("נשמר ✓");

  // an empty message cannot be saved
  await page.getByTestId("quick-text-no_auto").fill("   ");
  await expect(page.getByTestId("quick-save-no_auto")).toBeDisabled();
  await expect(page.getByTestId("quick-error-no_auto")).toHaveText("ההודעה ריקה.");

  await page.getByTestId("quick-text-no_auto").fill(QUICK.no_auto);
  await shoot(page, "settings-journey", "settings-journey");
  await shoot(page, "settings-quick", "settings-quick");
});

test("the drawer shows what was sent automatically and opens the suggested message, signed by the sender @mocked", async ({ page }) => {
  const sent = await stub(page);
  await page.goto("/sales/leads?lead=L1");
  const drawer = page.getByTestId("lead-drawer");
  await expect(drawer).toBeVisible();

  await expect(page.getByTestId("auto-sent-line")).toHaveText(/^נשלח אוטומטית: הודעת «נחזור אליכם» · נמסר .*\d\d:\d\d · לחץ «רוצה לשמוע עוד»$/);
  await page.getByTestId("auto-sent-toggle").click();
  await expect(page.getByTestId("auto-sent-list").getByRole("listitem")).toHaveCount(3);
  await expect(page.getByTestId("auto-sent-list")).toContainText("תפריט המאצ׳ה");

  const wa = page.getByTestId("drawer-whatsapp");
  await expect(wa).toHaveAttribute("data-situation", "asked_more");
  const text = waText(await wa.getAttribute("href"));
  expect(text).toContain("היי דנה, ראיתי שביקשתם לשמוע עוד");
  expect(text).toContain("ל־קפה נחת");
  expect(text).toContain("אבי, GT Everyday");
  expect(text).not.toContain("תום");

  await page.getByTestId("drawer-whatsapp-other").click();
  await page.getByTestId("drawer-whatsapp-situation-menu_no_reply").click();
  await expect(wa).toHaveAttribute("data-situation", "menu_no_reply");
  expect(waText(await wa.getAttribute("href"))).toContain("תפריט המאצ׳ה");

  await shoot(page, "drawer", "lead-drawer");

  // tapping it arms the outreach exactly as before (the popup is the rep's WhatsApp)
  const popup = page.waitForEvent("popup").catch(() => null);
  await page.context().route("https://wa.me/**", (r) => r.fulfill({ body: "ok" }));
  await wa.click();
  await popup;
  await expect.poll(() => sent.filter((s) => s.url.includes("/outreach")).map((s) => s.body)).toEqual([{ channel: "whatsapp" }]);
});

test("a lead who wrote «הסר» cannot be messaged from the button; the call stays @mocked", async ({ page }) => {
  const sent = await stub(page);
  await page.goto("/sales/leads?lead=L2");
  const wa = page.getByTestId("drawer-whatsapp");
  await expect(wa).toBeDisabled();
  await expect(wa).toHaveText("הליד ביקש לא לקבל הודעות («הסר»)");
  await expect(page.getByTestId("drawer-call")).toHaveAttribute("href", "tel:+972529999999");
  await wa.click({ force: true });
  expect(sent.filter((s) => s.url.includes("/outreach"))).toHaveLength(0);
  await shoot(page, "drawer-opted-out", "lead-drawer");
});

test("the Today card opens the suggested message, and is disabled for an opted-out lead @mocked", async ({ page }) => {
  await stub(page);
  await page.goto("/sales/today");
  const card = page.getByTestId("today-card-L1");
  await expect(card).toBeVisible();
  expect(waText(await page.getByTestId("today-whatsapp-L1").getAttribute("href"))).toContain("אבי, GT Everyday");
  await expect(page.getByTestId("today-whatsapp-L2")).toBeDisabled();
  await expect(page.getByTestId("today-card-L2")).toContainText("הליד ביקש לא לקבל הודעות («הסר»)");
});
