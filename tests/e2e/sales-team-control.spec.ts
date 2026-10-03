import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { setFakeRole } from "./helpers";

// @mocked — tranche 205 (D-045): team and rules, and the control room for Tom only.
//   settings:  "צוות וכללים" — signers by account, the menu file per line (state, warning,
//              edit), the queue and lost reasons with their own saves, a history per area
//   control:   Tom's session sees the entry and the tiles; for another admin there is no entry,
//              and /sales/control is the same 404 (status, title, text) as an unknown route
//
// Screenshots (320, 390 and 1280, light and dark) are taken when P3_SHOTS names a directory.
// All data is synthetic.

const hour = 3600e3;
const ago = (h: number) => new Date(Date.now() - h * hour).toISOString();
const SETTINGS = {
  sla_hours: 24,
  response_time: { days: [0, 1, 2, 3, 4], start: "09:00", end: "17:00", hot_hours: 2, normal_hours: 8 },
  whatsapp_templates: { new_lead: "", reminder: "", returning_customer: "" },
  assignees: [
    { name: "דנה", email: "dana@synthetic.invalid", active: true },
    { name: "יואב", email: "yoav@synthetic.invalid", active: true },
    { name: "רוני", email: "roni@synthetic.invalid", active: true },
  ],
  signers: [
    { email: "dana@synthetic.invalid", name: "דנה", signer: "דנה", source: "account" },
    { email: "yoav@synthetic.invalid", name: "יואב", signer: "יואב", source: "legacy" },
    { email: "roni@synthetic.invalid", name: "רוני", signer: null, source: null },
  ],
  lost_reasons: ["אין תקציב", "אחר"],
  queue: { daily_cap: 15, order: "newest_first" },
  last_changes: [
    { key: "lead_journey_signers_by_email", actor: "Avi", at: ago(2) },
    { key: "queue", actor: "Tom", at: ago(26) },
  ],
};
const MENUS = [
  { key: "matcha", line: "מאצ׳ה", label: "תפריט המאצ׳ה", filename: "Matcha.pdf", pdf_url: "https://cdn.shopify.com/s/files/synthetic/Matcha.pdf", state: "ok", reason: null, checked_at: ago(0.1) },
  { key: "ube", line: "אובה", label: "תפריט האובה", filename: "Ube.pdf", pdf_url: "https://cdn.shopify.com/s/files/synthetic/Ube.pdf", state: "missing", reason: "http_404", checked_at: ago(0.1) },
  { key: "chai", line: "צ׳אי מסאלה", label: "תפריט הצ׳אי מסאלה", filename: "Chai.pdf", pdf_url: "https://cdn.shopify.com/s/files/synthetic/Chai.pdf", state: "ok", reason: null, checked_at: ago(0.1) },
  { key: "tea", line: "תמציות תה", label: "תפריט תמציות התה", filename: "Tea.pdf", pdf_url: "https://cdn.shopify.com/s/files/synthetic/Tea.pdf", state: "ok", reason: null, checked_at: ago(0.1) },
  { key: "opening", line: "בניית תפריט משקאות עשיר ורווחי לעסק", label: "תפריט הפתיחה", filename: null, pdf_url: null, state: "missing", reason: "no_file", checked_at: null },
];
const HISTORY = [
  { id: "h2", actor: "Avi", at: ago(2), old_value: { "dana@synthetic.invalid": "דני" }, new_value: { "dana@synthetic.invalid": "דנה" } },
  { id: "h1", actor: "Tom", at: ago(50), old_value: {}, new_value: { "dana@synthetic.invalid": "דני" } },
];
const ROOM = {
  generated_at: new Date().toISOString(),
  tiles: [
    { id: "intake", state: "green", last_success_at: ago(0.4), action: "ok",
      facts: { mode: "make", last_lead_at: ago(3), leads_24h: 4, last_pulse_at: ago(0.4), rejects_24h: 0, unalerted_48h: 0 } },
    { id: "whatsapp", state: "amber", last_success_at: ago(1), action: "wa_failed",
      facts: { mode: "test", test_phone_count: 1, window_days: 7, sent: 2, delivered: 9, read: 14, failed: 1, dry_run: 6, opt_outs_total: 2, opt_outs_7d: 0, template_approval: null } },
    { id: "wake", state: "amber", last_success_at: ago(0.2), action: "wake_no_signer",
      facts: { last_run: { started_at: ago(0.2), finished_at: ago(0.2), forced: false, considered: 3, sent: 0, dry_run: 1, failed: 0, skipped: { no_signer: 1, not_due: 1 }, error: null },
        runs_24h: 96, sent_24h: 2, skipped_24h: { no_signer: 4, not_due: 80 } } },
    { id: "mirror", state: "green", last_success_at: ago(5), action: "ok", facts: { last_status: "pass", last_kind: "reconcile", open_exceptions: 0 } },
    { id: "report", state: "red", last_success_at: ago(5), action: "report_stale", facts: { last_status: "unchanged", last_kind: "delta", last_full_ok_at: ago(9) } },
    { id: "radar", state: "green", last_success_at: ago(4), action: "ok", facts: { flagged_last_run: 7, orgs_last_run: 140 } },
    { id: "settings", state: "green", last_success_at: ago(2), action: "ok",
      facts: { recent: [{ key: "lead_journey_signers_by_email", actor: "Avi", at: ago(2) }, { key: "queue", actor: "Tom", at: ago(26) }] } },
  ],
  technical: {
    test_phones: ["972500000001"],
    intake_mode: { mode: "make", reason: "synthetic reason", changed_at: ago(24 * 40), pulse_expected: "hourly" },
  },
};

interface Sent { url: string; body: unknown }
async function stub(page: Page, control: "tom" | "404" = "tom"): Promise<Sent[]> {
  const sent: Sent[] = [];
  await page.route("**/api/sales/control/access", (r) => r.fulfill({ json: { can_control: control === "tom" } }));
  await page.route("**/api/sales/settings/history**", (r) => r.fulfill({ json: { key: "lead_journey_signers_by_email", changes: HISTORY } }));
  await page.route(/\/api\/sales\/settings(\?.*)?$/, (r) => {
    if (r.request().method() === "PUT") {
      sent.push({ url: r.request().url(), body: r.request().postDataJSON() });
      return r.fulfill({ json: { updated: ["x"] } });
    }
    return r.fulfill({ json: SETTINGS });
  });
  await page.route("**/api/sales/menus**", (r) => r.fulfill({ json: { menus: MENUS } }));
  await page.route("**/api/sales/journey**", (r) => r.fulfill({ status: 404, json: { error: "not stubbed" } }));
  await page.route("**/api/sales/control/test-phones", (r) => {
    sent.push({ url: r.request().url(), body: r.request().postDataJSON() });
    return r.fulfill({ json: { test_phones: (r.request().postDataJSON() as { phones: string[] }).phones } });
  });
  await page.route(/\/api\/sales\/control$/, (r) =>
    control === "tom" ? r.fulfill({ json: ROOM }) : r.fulfill({ status: 404, json: { error: "Not Found" } }));
  await page.route("**/api/sales/today**", (r) => r.fulfill({ json: { rows: [], queue: SETTINGS.queue } }));
  await page.route("**/api/sales/tasks**", (r) => r.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/week-stats**", (r) => r.fulfill({ json: { stats: {} } }));
  await page.route("**/api/sales/leads**", (r) => r.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/orgs**", (r) => r.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/attention**", (r) => r.fulfill({ json: { rows: [] } }));
  await page.route("**/api/sales/activity**", (r) => r.fulfill({ json: { rows: [] } }));
  return sent;
}

// The dev-shim session lives in localStorage; the control route's server layout reads the shim's
// email from the gt.devshim.email cookie (honoured only with the shim on, never in production).
async function asTom(page: Page) {
  await page.addInitScript((value: string) => window.localStorage.setItem("gt.fakeauth.v1", value),
    JSON.stringify({ user_id: "u_tom_01", display_name: "Tom", email: "tom@gteveryday.com", role: "admin" }));
  await page.context().addCookies([{ name: "gt.devshim.email", value: encodeURIComponent("tom@gteveryday.com"), url: "http://127.0.0.1:3737" }]);
}
async function asOtherAdmin(page: Page) {
  await setFakeRole(page, "admin");
  await page.context().addCookies([{ name: "gt.devshim.email", value: encodeURIComponent("admin@fake.gtfactory"), url: "http://127.0.0.1:3737" }]);
}

async function axeClean(page: Page, where: string) {
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

const SHOTS = process.env.P3_SHOTS;
async function shoot(page: Page, name: string, target: string | null) {
  if (!SHOTS) return;
  for (const width of [320, 390, 1280]) {
    for (const scheme of ["light", "dark"] as const) {
      await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 });
      await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), scheme === "dark");
      await page.waitForTimeout(200);
      const file = `${SHOTS}/${name}-${width}-${scheme}.png`;
      if (target) await page.getByTestId(target).screenshot({ path: file, animations: "disabled" });
      else await page.screenshot({ path: file, animations: "disabled", fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${name} ${width} ${scheme} scrolls sideways`).toBeLessThanOrEqual(0);
    }
  }
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.setViewportSize({ width: 1280, height: 900 });
}

test("team and rules: signers by account, the menu file per line, own saves and history @mocked", async ({ page }) => {
  await setFakeRole(page, "admin");
  const sent = await stub(page);
  await page.goto("/sales/settings");
  const team = page.getByTestId("settings-team");
  await expect(team).toBeVisible({ timeout: 30_000 });
  await expect(team).toContainText("צוות וכללים");

  // signers: the legacy one is said, the missing one warned about
  await expect(page.getByTestId("signer-note-yoav@synthetic.invalid")).toHaveText("נקרא כרגע לפי שם התצוגה. שמרו כדי לקשר אותו לחשבון.");
  await expect(page.getByTestId("signer-note-roni@synthetic.invalid")).toContainText("לא יוצאות");
  await expect(page.getByTestId("settings-signers")).toContainText("שונה ע״י Avi לפני שעתיים");

  // menus: state, why, and the general-reply warning
  await expect(page.getByTestId("menu-state-matcha")).toContainText("תקין");
  await expect(page.getByTestId("menu-state-opening")).toContainText("חסר קובץ");
  await expect(page.getByTestId("menus-warn")).toHaveText("בלי קובץ, הליד מקבל את התשובה הכללית במקום התפריט.");

  // history opens on demand
  await page.getByTestId("history-toggle-lead_journey_signers_by_email").click();
  await expect(page.getByTestId("history-list-lead_journey_signers_by_email")).toContainText("שונה: דנה");
  await axeBoth(page, "settings team");
  await shoot(page, "settings-team", "settings-team");

  // signers save: only what changed, by email
  await page.getByTestId("signer-input-roni@synthetic.invalid").fill("רוני");
  await page.getByTestId("signers-save").click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0].body).toEqual({ lead_journey_signers_by_email: { "yoav@synthetic.invalid": "יואב", "roni@synthetic.invalid": "רוני" } });

  // a menu line: a bad link is refused in place, a good one saved for that line only
  await page.getByTestId("menu-opening-edit").click();
  await page.getByTestId("menu-opening-filename").fill("Opening.pdf");
  await page.getByTestId("menu-opening-pdf_url").fill("https://example.com/o.pdf");
  await page.getByTestId("menu-opening-save").click();
  await expect(page.getByTestId("menu-opening-pdf_url")).toBeFocused();
  await expect(page.getByTestId("menu-editor-opening")).toContainText("הקישור צריך להתחיל ב־https://cdn.shopify.com/");
  await axeBoth(page, "settings menu editor with an error");
  await shoot(page, "settings-menu-editor", "settings-menus");
  await page.getByTestId("menu-opening-pdf_url").fill("https://cdn.shopify.com/s/files/synthetic/Opening.pdf");
  await page.getByTestId("menu-opening-save").click();
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1].body).toEqual({ lead_menus: { opening: { label: "תפריט הפתיחה", filename: "Opening.pdf", pdf_url: "https://cdn.shopify.com/s/files/synthetic/Opening.pdf" } } });

  // the queue saves itself only
  await page.getByTestId("queue-cap").fill("12");
  await page.getByTestId("queue-save").click();
  await expect.poll(() => sent.length).toBe(3);
  expect(sent[2].body).toEqual({ queue: { daily_cap: 12, order: "newest_first" } });
});

test("control room: Tom sees the entry and the tiles, edits the test phones; intake mode is read-only @mocked", async ({ page }) => {
  await asTom(page);
  const sent = await stub(page, "tom");
  await page.goto("/sales/today");
  await expect(page.getByTestId("sales-rail-control")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("sales-rail-control").click();
  await expect(page).toHaveURL(/\/sales\/control$/, { timeout: 30_000 });
  await expect(page.getByTestId("control-tiles")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("tile-report-state")).toContainText("תקלה");
  await expect(page.getByTestId("tile-wake-action")).toHaveText("הודעות לא יצאו כי חסר שם חתימה. השלימו אותו בהגדרות.");
  await expect(page.getByTestId("tile-whatsapp")).toContainText("אישור התבניות ב־Meta: לא נשמר");
  await expect(page.getByTestId("control-intake-mode")).toContainText("לקריאה בלבד");
  await axeBoth(page, "control room");
  await shoot(page, "control", null);

  await page.getByTestId("test-phone-new").fill("052-000 0002");
  await page.getByTestId("test-phone-add").click();
  await page.getByTestId("test-phones-save").click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0].body).toEqual({ phones: ["972500000001", "972520000002"] });

  // the phone header carries the entry too
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("sales-control-icon")).toBeVisible();
});

test("control room: another admin sees no entry, and /sales/control is the same 404 as an unknown route @mocked", async ({ page }) => {
  await asOtherAdmin(page);
  await stub(page, "404");
  await page.goto("/sales/today");
  await expect(page.getByTestId("sales-rail-/sales/today")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("sales-rail-control")).toHaveCount(0);
  await expect(page.getByText("חדר בקרה")).toHaveCount(0);

  // a real unknown route, for comparison
  const unknown = await page.goto("/sales/nope");
  await expect(page.getByTestId("not-found")).toBeVisible({ timeout: 30_000 });
  const unknownTitle = await page.title();
  const unknownText = (await page.getByTestId("not-found").innerText()).trim();

  const control = await page.goto("/sales/control");
  await expect(page.getByTestId("not-found")).toBeVisible({ timeout: 30_000 });
  expect(control?.status()).toBe(404);
  expect(control?.status()).toBe(unknown?.status());
  expect(await page.title()).toBe(unknownTitle);
  expect((await page.getByTestId("not-found").innerText()).trim()).toBe(unknownText);
  await expect(page.getByTestId("control-tiles")).toHaveCount(0);
  await expect(page.getByText("טלפונים לבדיקה")).toHaveCount(0);
  await expect(page.locator('[data-app="sales"]')).toHaveCount(0);
  await axeBoth(page, "control not found");
  await shoot(page, "control-not-found", null);
});
