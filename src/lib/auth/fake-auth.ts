"use client";

import type { Role } from "@/lib/contracts/enums";

const STORAGE_KEY = "gt.fakeauth.v1";

// Dev-shim feature flag. Must match the server-side flag
// (api/src/auth/session-extractor.ts ENABLE_DEV_SHIM_AUTH). When this is
// false (production), the fake-session code in this file is inert:
//   - getFakeSession() returns a viewer placeholder that the layout should not
//     treat as authoritative (real identity flows through Supabase session).
//   - setFakeRole() is a no-op.
//   - subscribeFakeSession() is a no-op with an inert unsubscribe.
//
// The fake-session machinery is retained (not deleted) because:
//   1. Local dev without Supabase still needs it.
//   2. Playwright real-HTTP suites in tests/e2e/*-real.spec.ts rely on
//      setFakeRole() to switch role context against a local API running with
//      ENABLE_DEV_SHIM_AUTH=true on the backend.
//   3. Emergency rollback from production auth to dev-shim is a flag flip, not
//      a code change.
const DEV_SHIM_ON =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH === "true";

export interface FakeSession {
  user_id: string;
  display_name: string;
  email: string;
  role: Role;
}

// user_id values are canonical UUIDs because the API's
// private_core.app_users.user_id is uuid-typed. Text pseudo-IDs
// ("u_op_01" etc.) were rejected by Postgres with 22P02. The UUIDs below
// match the test-seed in db/test-seed/portal_universe.sql so local
// Goods Receipt submits resolve FKs cleanly.
export const FAKE_USERS: Record<Role, FakeSession> = {
  operator: {
    user_id: "aaaaaaaa-0000-0000-0000-0000000000a1",
    display_name: "Avi (operator)",
    email: "operator@fake.gtfactory",
    role: "operator",
  },
  planner: {
    user_id: "aaaaaaaa-0000-0000-0000-0000000000a2",
    display_name: "Tom (planner)",
    email: "planner@fake.gtfactory",
    role: "planner",
  },
  admin: {
    user_id: "aaaaaaaa-0000-0000-0000-0000000000a3",
    display_name: "Alex (admin)",
    email: "admin@fake.gtfactory",
    role: "admin",
  },
  viewer: {
    user_id: "aaaaaaaa-0000-0000-0000-0000000000a4",
    display_name: "Guest (viewer)",
    email: "viewer@fake.gtfactory",
    role: "viewer",
  },
};

const listeners = new Set<(session: FakeSession) => void>();

function readStorage(): FakeSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FakeSession;
    if (!parsed.role || !(parsed.role in FAKE_USERS)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStorage(session: FakeSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function isFakeAuthEnabled(): boolean {
  return DEV_SHIM_ON;
}

export function getFakeSession(): FakeSession {
  // When the dev-shim is off, return a viewer placeholder. The real session
  // (Supabase) flows through SessionProvider's Supabase hook when cutover
  // wiring lands; pages currently reading getFakeSession() for display-only
  // purposes continue to render, but writes will 401 at the API since the
  // API-side dev-shim is also gated off.
  if (!DEV_SHIM_ON) {
    return FAKE_USERS.viewer;
  }
  const stored = readStorage();
  return stored ?? FAKE_USERS.planner;
}

export function setFakeRole(role: Role) {
  if (!DEV_SHIM_ON) {
    // No-op in production. Role identity is owned by the Supabase session +
    // api/private_core.app_users row.
    return;
  }
  const session = FAKE_USERS[role];
  writeStorage(session);
  listeners.forEach((l) => l(session));
}

export function subscribeFakeSession(fn: (session: FakeSession) => void) {
  if (!DEV_SHIM_ON) {
    return () => {};
  }
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
