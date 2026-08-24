// The same storageState as sign-in.mjs, minted without a browser.
//
// WHEN TO USE THIS INSTEAD
//
// `sign-in.mjs` is the honest default: it drives the portal's own password form,
// so it exercises the login a human uses. It needs a browser that can reach
// Supabase.
//
// Some sandboxes give the agent outbound HTTPS but not the browser — the
// container this was written in resets every Chromium connection to the public
// internet while `fetch` goes through an egress proxy fine. There, the portal is
// served locally (`next dev`) and the browser only ever talks to 127.0.0.1, so
// the one thing missing is the session cookie. This mints it.
//
// It does NOT hand-encode that cookie. `@supabase/ssr` owns the format —
// including the chunking a large session triggers — so the library is asked to
// write the cookies and we simply collect what it wrote.
//
//   DEMO_EMAIL=demo@gteveryday.com
//   DEMO_PASSWORD=...
//   DEMO_BASE_URL=http://127.0.0.1:3737        (the host the cookie is for)
//   NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
//   DEMO_OUT=./demo-out
//
//   node --use-env-proxy scripts/demo-walkthrough/sign-in-headless.mjs
//
// The demo user still needs its `admin` row in private_core.app_users
// (migration 0331), or the portal authenticates it and then refuses /sales.

import { createServerClient } from "@supabase/ssr";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PORTAL_URL, STATE_PATH } from "./config.mjs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL = process.env.DEMO_EMAIL;
const PASSWORD = process.env.DEMO_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_ANON || !EMAIL || !PASSWORD) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, DEMO_EMAIL and DEMO_PASSWORD are all required.",
  );
  process.exit(1);
}

// Collected by the adapter below, in whatever shape @supabase/ssr decides.
let written = [];

const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON, {
  cookies: {
    getAll: () => [],
    setAll: (cookies) => {
      written = cookies;
    },
  },
});

const { data, error } = await supabase.auth.signInWithPassword({
  email: EMAIL,
  password: PASSWORD,
});

if (error || !data?.session) {
  console.error(`sign-in failed: ${error?.message ?? "no session returned"}`);
  process.exit(1);
}

// setSession is what makes the library serialise the session into cookies.
await supabase.auth.setSession({
  access_token: data.session.access_token,
  refresh_token: data.session.refresh_token,
});

if (written.length === 0) {
  console.error("@supabase/ssr wrote no cookies — the adapter contract has moved.");
  process.exit(1);
}

const host = new URL(PORTAL_URL);
const state = {
  cookies: written.map((c) => ({
    name: c.name,
    value: c.value,
    domain: host.hostname,
    path: "/",
    expires: Math.floor(Date.now() / 1000) + 60 * 60 * 8,
    httpOnly: false,
    secure: host.protocol === "https:",
    sameSite: "Lax",
  })),
  origins: [],
};

await mkdir(path.dirname(STATE_PATH), { recursive: true });
await writeFile(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
console.log(`storageState written: ${STATE_PATH} (${written.length} cookie(s), host ${host.hostname})`);
