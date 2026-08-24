// One place for the three things both walkthrough scripts need.
//
// They used to each carry their own copy of the portal URL and its default.
// That is a quiet way to lose an afternoon: `sign-in.mjs` stamps the session
// cookie for the host IT thinks you mean, `record.mjs` navigates to the host IT
// thinks you mean, and when the two drift the recording simply runs signed-out
// with no error anywhere.

import path from "node:path";

/** The portal being recorded. One name, one default, both scripts. */
export const PORTAL_URL = (
  process.env.DEMO_BASE_URL ?? "https://gt-factory-os-portal.vercel.app"
).replace(/\/+$/, "");

/** Where the session and the video land. */
export const OUT_DIR = process.env.DEMO_OUT ?? path.resolve("demo-out");
export const STATE_PATH = process.env.DEMO_STORAGE_STATE ?? path.join(OUT_DIR, "state.json");

/**
 * Same escape hatch playwright.config.ts carries: sandboxes that pre-provision a
 * browser binary but cannot download Playwright's pinned build. Unset on a
 * normal machine, where Playwright uses its own download.
 */
export const launchOptions = process.env.PW_CHROME_PATH
  ? { executablePath: process.env.PW_CHROME_PATH }
  : {};

/** One fixed viewport for every take, so two recordings are comparable. */
export const VIEWPORT = { width: 1180, height: 820 };
