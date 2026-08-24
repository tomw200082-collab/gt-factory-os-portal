// Records the GT Sales walkthrough — the deliverable a stranger can watch.
//
// WHY THIS IS A SCRIPT AND NOT A SCREEN RECORDING
//
// A hand-recorded demo cannot be re-recorded after a fix without re-recording
// everything, and it silently depends on whatever happened to be on screen that
// day. This drives a real browser against the real portal with a real session,
// in a fixed order, with the caption strip stating what each moment proves. Fix
// something, run it again, get the same video with the fix in it.
//
// EVERY SHOT IS LOAD-BEARING
//
// There are no `if (present) …` guards here. A renamed data-testid must stop
// the run, loudly, with the name it could not find — a walkthrough that proves
// the product works must not have "quietly shorter video" as its failure mode.
//
//   DEMO_STORAGE_STATE=./demo-out/state.json   (written by sign-in.mjs)
//   DEMO_BASE_URL=...                          (optional)
//   DEMO_OUT=./demo-out                        (optional)
//   PW_CHROME_PATH=...                         (sandboxes only)
//
//   node scripts/demo-walkthrough/record.mjs
//
// The numbered shot list this follows — and what each shot claims — is in
// SCRIPT.md. Keep the two in step.

import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { OUT_DIR, PORTAL_URL, STATE_PATH, VIEWPORT, launchOptions } from "./config.mjs";

if (!existsSync(STATE_PATH)) {
  console.error(
    `no session at ${STATE_PATH}. Run scripts/demo-walkthrough/sign-in.mjs first.`,
  );
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({
  storageState: STATE_PATH,
  viewport: VIEWPORT,
  locale: "he-IL",
  timezoneId: "Asia/Jerusalem",
  recordVideo: { dir: OUT_DIR, size: VIEWPORT },
});
const page = await context.newPage();
const video = page.video();

/** The caption strip. The video has to explain itself with the sound off. */
async function caption(n, title, claim) {
  await page.evaluate(
    ({ n, title, claim }) => {
      let el = document.getElementById("__gt_caption__");
      if (!el) {
        el = document.createElement("div");
        el.id = "__gt_caption__";
        el.setAttribute("dir", "rtl");
        el.style.cssText = [
          "position:fixed",
          "inset-inline:0",
          "bottom:0",
          "z-index:2147483647",
          "background:rgba(11,17,24,.92)",
          "color:#fff",
          "padding:10px 18px",
          "font:600 15px/1.45 -apple-system,Segoe UI,Rubik,Arial,sans-serif",
          "pointer-events:none",
        ].join(";");
        document.body.appendChild(el);
      }
      el.innerHTML =
        `<span style="opacity:.55;margin-inline-end:8px">${n}</span>${title}` +
        (claim
          ? `<div style="font-weight:400;font-size:13px;opacity:.72;margin-top:2px">${claim}</div>`
          : "");
    },
    { n, title, claim },
  );
}

const beat = (ms = 2200) => page.waitForTimeout(ms);

/**
 * Go to a screen and wait for the thing the shot is about — never for
 * `networkidle`, which on this app only settles after hydration, the TanStack
 * queries AND the Next.js link prefetches, long past the point the content is
 * painted. Waiting on the subject is both faster and honest: if it never
 * appears, the run fails here rather than recording an empty screen.
 */
async function open(route, testId) {
  await page.goto(`${PORTAL_URL}${route}`, { waitUntil: "domcontentloaded" });
  await page.getByTestId(testId).first().waitFor({ state: "visible", timeout: 30_000 });
}

// ── 1. The queue ──────────────────────────────────────────────────────────
await open("/sales/today", "today-section-conversion");
await caption("1", "התור של היום", "מה צריך לקרות היום, ולמה דווקא אלה");
await beat(3200);

// The rule that produced the number — the first thing a stranger asks about.
const capRule = page.getByTestId("today-daily-cap-rule");
await capRule.waitFor({ state: "visible" });
await capRule.scrollIntoViewIfNeeded();
await caption("1a", "המספר מסביר את עצמו", "מכסה יומית אחת לכל התור, כתובה על המסך");
await beat();

// ── 2. A conversion, with the order that proves it ────────────────────────
await page.getByTestId("today-section-conversion").scrollIntoViewIfNeeded();
await caption("2", "הומרו", "ליד שנסגר — עם מספר ההזמנה שמוכיח אותו");
await beat(3000);

// ── 3. Open a lead ────────────────────────────────────────────────────────
await caption("3", "פותחים ליד", "כל מה שצריך כדי להתקשר, במסך אחד");
await page.locator('[data-testid^="today-card-"]').first().click();

// ── 4. The timeline ───────────────────────────────────────────────────────
const timeline = page.getByTestId("event-timeline");
await timeline.waitFor({ state: "visible", timeout: 30_000 });
await timeline.scrollIntoViewIfNeeded();
await caption("4", "ההיסטוריה", "כל אירוע נשמר — מי, מתי, ועל סמך מה");
await beat(3200);
await page.keyboard.press("Escape");
await timeline.waitFor({ state: "hidden", timeout: 15_000 });

// ── 5. The leads list ─────────────────────────────────────────────────────
await open("/sales/leads", "leads-search");
await caption("5", "כל הלידים", "התור הוא חיתוך; כאן נמצא הכול");
await beat(3000);

// ── 6. The uncontactable chip — a deliberate, explained exclusion ─────────
await caption(
  "6",
  "חסרי דרך יצירת קשר",
  "39 לידים אמיתיים בלי טלפון ובלי מייל — מוחרגים מהתור בכוונה, לא נמחקים",
);
await page.getByTestId("leads-chip-uncontactable").first().click();
await beat(3200);

// ── 7. An empty state, on purpose ─────────────────────────────────────────
const search = page.getByTestId("leads-search").first();
await caption("7", "מצב ריק", "חיפוש בלי תוצאות נראה כמו תשובה, לא כמו תקלה");
await search.fill("זזזזזז");
await beat(3000);
await search.fill("");

// ── 8. Businesses ─────────────────────────────────────────────────────────
await open("/sales/orgs", "orgs-search");
await caption("8", "עסקים", "ליד שייך לעסק — וזה מה שמזהה לקוח חוזר");
await beat(3000);

// ── 9. Attention ──────────────────────────────────────────────────────────
await open("/sales/attention", "attention-body");
await caption("9", "מצב", "מה חורג, ומה דורש מבט היום");
await beat(3000);

// ── 10. Settings — the numbers are owned, not hard-coded ──────────────────
await open("/sales/settings", "queue-cap");
await caption("10", "הגדרות", "המכסה היומית וה-SLA נקבעים כאן — לא בקוד");
await beat(3200);

// ── 11. An error state, on purpose ────────────────────────────────────────
// Hiding the failure path is what makes a demo brittle. This one is induced, so
// it is the same every take.
await context.route("**/api/sales/**", (r) => r.abort("failed"));
await page.goto(`${PORTAL_URL}/sales/today`, { waitUntil: "domcontentloaded" });
await caption("11", "מצב שגיאה", "כשהשרת לא עונה, המסך אומר את זה — ולא מציג מספר שקרי");
await beat(3600);
await context.unroute("**/api/sales/**");

await context.close();
await browser.close();

// Playwright names the file after the page guid and only finalises it on close;
// asking the Video object for its path is exact. Guessing it from a directory
// listing renamed the PREVIOUS take onto itself on every run after the first.
const out = path.join(OUT_DIR, "gt-sales-walkthrough.webm");
await rename(await video.path(), out);
console.log(`recorded: ${out}`);
