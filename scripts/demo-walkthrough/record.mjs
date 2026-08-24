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
// AUTH
//
// Needs a saved storageState for a dedicated demo user (admin role in
// private_core.app_users). Never a fake session: the portal's cleaned files
// must stay clean, and a video of a fake session proves nothing about the real
// one.
//
//   DEMO_STORAGE_STATE=/path/to/state.json  (required)
//   DEMO_BASE_URL=https://gt-factory-os-portal.vercel.app  (default)
//   DEMO_OUT=./demo-out  (default)
//   PW_CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
//     (only when the pinned Playwright build is not downloaded, as in the
//      remote container)
//
//   node scripts/demo-walkthrough/record.mjs
//
// The numbered shot list this follows — and what each shot claims — is in
// scripts/demo-walkthrough/SCRIPT.md. Keep the two in step.

import { chromium } from "@playwright/test";
import { mkdir, readdir, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const BASE = process.env.DEMO_BASE_URL ?? "https://gt-factory-os-portal.vercel.app";
const STATE = process.env.DEMO_STORAGE_STATE;
const OUT = process.env.DEMO_OUT ?? path.resolve("demo-out");
const CHROME = process.env.PW_CHROME_PATH;

// One fixed viewport for every take, so two recordings are comparable.
const VIEWPORT = { width: 1180, height: 820 };

if (!STATE || !existsSync(STATE)) {
  console.error(
    "DEMO_STORAGE_STATE must point at a saved Playwright storageState for the demo user.\n" +
      "Create it once with scripts/demo-walkthrough/sign-in.mjs.",
  );
  process.exit(1);
}

/** The caption strip. The video has to explain itself with the sound off. */
async function caption(page, n, title, claim) {
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
        `<span style="opacity:.55;margin-inline-end:8px">${n}</span>` +
        `${title}` +
        (claim
          ? `<div style="font-weight:400;font-size:13px;opacity:.72;margin-top:2px">${claim}</div>`
          : "");
    },
    { n, title, claim },
  );
}

const beat = (page, ms = 2200) => page.waitForTimeout(ms);

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const context = await browser.newContext({
    storageState: STATE,
    viewport: VIEWPORT,
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    recordVideo: { dir: OUT, size: VIEWPORT },
    // The sales surface is RTL by its own layout; forcing the browser's
    // direction as well would not match what a user actually sees.
  });
  const page = await context.newPage();

  // ── 1. The queue ────────────────────────────────────────────────────────
  await page.goto(`${BASE}/sales/today`, { waitUntil: "networkidle" });
  await caption(page, "1", "התור של היום", "מה צריך לקרות היום, ולמה דווקא אלה");
  await beat(page, 3200);

  // The rule that produced the number — the thing a stranger asks about first.
  const capRule = page.getByTestId("today-daily-cap-rule").first();
  if (await capRule.count()) {
    await capRule.scrollIntoViewIfNeeded();
    await caption(page, "1a", "המספר מסביר את עצמו", "מכסה יומית אחת לכל התור, כתובה על המסך");
    await beat(page);
  }

  // ── 2. A conversion, with its order ─────────────────────────────────────
  const conversions = page.getByTestId("today-section-conversion");
  if (await conversions.count()) {
    await conversions.scrollIntoViewIfNeeded();
    await caption(page, "2", "הומרו", "ליד שנסגר — עם מספר ההזמנה שמוכיח אותו");
    await beat(page, 3000);
  }

  // ── 3. Open a lead ──────────────────────────────────────────────────────
  const firstCard = page.locator('[data-testid^="today-card-"]').first();
  if (await firstCard.count()) {
    await caption(page, "3", "פותחים ליד", "כל מה שצריך כדי להתקשר, במסך אחד");
    await firstCard.click();
    await beat(page, 3000);

    // ── 4. The timeline ───────────────────────────────────────────────────
    const timeline = page.getByTestId("event-timeline");
    if (await timeline.count()) {
      await timeline.scrollIntoViewIfNeeded();
      await caption(page, "4", "ההיסטוריה", "כל אירוע נשמר — מי, מתי, ועל סמך מה");
      await beat(page, 3200);
    }
    await page.keyboard.press("Escape");
    await beat(page, 1200);
  }

  // ── 5. The leads list and its filters ───────────────────────────────────
  await page.goto(`${BASE}/sales/leads`, { waitUntil: "networkidle" });
  await caption(page, "5", "כל הלידים", "התור הוא חיתוך; כאן נמצא הכול");
  await beat(page, 3000);

  // ── 6. The uncontactable chip — a deliberate, explained exclusion ────────
  const chip = page.getByTestId("leads-chip-uncontactable").first();
  if (await chip.count()) {
    await caption(page, "6", "חסרי דרך יצירת קשר", "39 לידים אמיתיים בלי טלפון ובלי מייל — מוחרגים מהתור בכוונה, לא נמחקים");
    await chip.click();
    await beat(page, 3200);
  }

  // ── 7. An empty state, on purpose ───────────────────────────────────────
  const search = page.getByTestId("leads-search").first();
  if (await search.count()) {
    await caption(page, "7", "מצב ריק", "חיפוש בלי תוצאות נראה כמו תשובה, לא כמו תקלה");
    await search.fill("זזזזזז");
    await beat(page, 3000);
    await search.fill("");
    await beat(page, 800);
  }

  // ── 8. Businesses ───────────────────────────────────────────────────────
  await page.goto(`${BASE}/sales/orgs`, { waitUntil: "networkidle" });
  await caption(page, "8", "עסקים", "ליד שייך לעסק — וזה מה שמזהה לקוח חוזר");
  await beat(page, 3000);

  // ── 9. Attention ────────────────────────────────────────────────────────
  await page.goto(`${BASE}/sales/attention`, { waitUntil: "networkidle" });
  await caption(page, "9", "מצב", "מה חורג, ומה דורש מבט היום");
  await beat(page, 3000);

  // ── 10. Settings — the numbers are owned, not hard-coded ────────────────
  await page.goto(`${BASE}/sales/settings`, { waitUntil: "networkidle" });
  await caption(page, "10", "הגדרות", "המכסה היומית וה-SLA נקבעים כאן — לא בקוד");
  await beat(page, 3200);

  // ── 11. An error state, on purpose ──────────────────────────────────────
  // Hiding the failure path is what makes a demo brittle. This one is induced,
  // so it is the same every take.
  await context.route("**/api/sales/**", (r) => r.abort("failed"));
  await page.goto(`${BASE}/sales/today`, { waitUntil: "domcontentloaded" });
  await caption(page, "11", "מצב שגיאה", "כשהשרת לא עונה, המסך אומר את זה — ולא מציג מספר שקרי");
  await beat(page, 3600);
  await context.unroute("**/api/sales/**");

  await context.close();
  await browser.close();

  // Playwright names the file after the page guid; give it a stable name.
  const files = (await readdir(OUT)).filter((f) => f.endsWith(".webm"));
  if (files.length > 0) {
    const newest = files.sort().at(-1);
    await rename(path.join(OUT, newest), path.join(OUT, "gt-sales-walkthrough.webm"));
    console.log(`recorded: ${path.join(OUT, "gt-sales-walkthrough.webm")}`);
  } else {
    console.error("no video produced");
    process.exit(1);
  }
}

await main();
