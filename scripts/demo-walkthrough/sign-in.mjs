// Mints a Playwright storageState for the dedicated demo user, once.
//
// It signs in through the portal's OWN login page — the password form behind
// "כניסה עם סיסמה" (`login-switch-to-password`) — and then asks Playwright to
// serialise the session.
//
// An earlier version of this file hand-encoded the `sb-<ref>-auth-token` cookie
// itself. That was wrong twice over: the portal does have a password form (so
// there was nothing to work around), and the encoding it copied is
// `@supabase/ssr` internals — a session past ~3180 bytes gets split across
// `…auth-token.0` / `.1`, which the hand-rolled version never produced. The
// symptom would have read as "the demo user lost access to /sales" rather than
// "the cookie format moved". The library owns that format; let it.
//
//   DEMO_EMAIL=demo@gteveryday.com
//   DEMO_PASSWORD=...
//   DEMO_BASE_URL=https://gt-factory-os-portal.vercel.app   (optional)
//   DEMO_OUT=./demo-out                                     (optional)
//   PW_CHROME_PATH=...                                      (sandboxes only)
//
//   node scripts/demo-walkthrough/sign-in.mjs
//
// The demo user also needs an `admin` row in private_core.app_users, or the
// portal authenticates it and then refuses /sales. That row is written by
// migration 0331, not by hand.

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { OUT_DIR, PORTAL_URL, STATE_PATH, VIEWPORT, launchOptions } from "./config.mjs";

const EMAIL = process.env.DEMO_EMAIL;
const PASSWORD = process.env.DEMO_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("DEMO_EMAIL and DEMO_PASSWORD are required.");
  process.exit(1);
}

await mkdir(path.dirname(STATE_PATH), { recursive: true });

const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ viewport: VIEWPORT, locale: "he-IL" });
const page = await context.newPage();

await page.goto(`${PORTAL_URL}/login?redirectTo=%2Fsales%2Ftoday`, {
  waitUntil: "domcontentloaded",
});

await page.getByTestId("login-switch-to-password").click();
await page.getByTestId("login-email-input").fill(EMAIL);
await page.getByTestId("login-password-input").fill(PASSWORD);
await page.getByTestId("login-password-submit").click();

// The page hard-navigates on success so the server middleware sees the new
// cookies. Landing anywhere other than /login is the proof it worked; waiting
// on the URL rather than on a timer is what makes a wrong password fail loudly.
await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });

// Authenticated is not authorised. /sales is admin-gated on
// private_core.app_users, so check the destination actually renders rather than
// discovering it during the take.
await page.goto(`${PORTAL_URL}/sales/today`, { waitUntil: "domcontentloaded" });
if (new URL(page.url()).pathname.startsWith("/login")) {
  console.error(
    `signed in as ${EMAIL} but /sales/today bounced back to the login page.\n` +
      "That is the admin role missing, not the password: apply migration 0331.",
  );
  await browser.close();
  process.exit(1);
}

await context.storageState({ path: STATE_PATH });
await browser.close();

console.log(`storageState written: ${STATE_PATH}`);
console.log(`out dir: ${OUT_DIR}`);
