// Mints a Playwright storageState for the dedicated demo user, once.
//
// The portal's production login is a Supabase magic link — there is no password
// form on screen. Supabase's auth API still accepts a password grant, so a demo
// user created in Supabase Studio (Authentication → Users → Add user, with
// "Auto Confirm") can be signed in headlessly without touching anyone's inbox.
//
// The session is the same shape the browser would have after a magic link: the
// SSR client reads it from the `sb-<ref>-auth-token` cookie.
//
//   DEMO_EMAIL=demo@gteveryday.com
//   DEMO_PASSWORD=...
//   SUPABASE_URL=https://rvadsozabmxkkrktwgnv.supabase.co   (default)
//   SUPABASE_ANON_KEY=...            (the publishable key; it is public)
//   DEMO_STORAGE_STATE=./demo-out/state.json                (default)
//
//   node scripts/demo-walkthrough/sign-in.mjs
//
// The demo user also needs an `admin` row in private_core.app_users, or the
// portal will authenticate it and then refuse /sales — that row is written by a
// numbered migration, not by hand.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const URL_BASE = process.env.SUPABASE_URL ?? "https://rvadsozabmxkkrktwgnv.supabase.co";
const ANON = process.env.SUPABASE_ANON_KEY;
const EMAIL = process.env.DEMO_EMAIL;
const PASSWORD = process.env.DEMO_PASSWORD;
const OUT = process.env.DEMO_STORAGE_STATE ?? path.resolve("demo-out/state.json");
const PORTAL = process.env.DEMO_BASE_URL ?? "https://gt-factory-os-portal.vercel.app";

if (!ANON || !EMAIL || !PASSWORD) {
  console.error("SUPABASE_ANON_KEY, DEMO_EMAIL and DEMO_PASSWORD are all required.");
  process.exit(1);
}

const projectRef = new URL(URL_BASE).hostname.split(".")[0];

const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});

if (!res.ok) {
  console.error(`sign-in failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}

const session = await res.json();

// @supabase/ssr stores the whole session as a base64url-prefixed JSON cookie.
const cookieValue =
  "base64-" + Buffer.from(JSON.stringify(session), "utf8").toString("base64url");

const domain = new URL(PORTAL).hostname;

const state = {
  cookies: [
    {
      name: `sb-${projectRef}-auth-token`,
      value: cookieValue,
      domain,
      path: "/",
      expires: Math.floor(Date.now() / 1000) + 60 * 60 * 8,
      httpOnly: false,
      secure: true,
      sameSite: "Lax",
    },
  ],
  origins: [],
};

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(state, null, 2), "utf8");
console.log(`storageState written: ${OUT}`);
