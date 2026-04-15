"use client";

import type { Role } from "@/lib/contracts/enums";

const STORAGE_KEY = "gt.fakeauth.v1";

export interface FakeSession {
  user_id: string;
  display_name: string;
  email: string;
  role: Role;
}

export const FAKE_USERS: Record<Role, FakeSession> = {
  operator: {
    user_id: "u_op_01",
    display_name: "Avi (operator)",
    email: "operator@fake.gtfactory",
    role: "operator",
  },
  planner: {
    user_id: "u_pl_01",
    display_name: "Tom (planner)",
    email: "planner@fake.gtfactory",
    role: "planner",
  },
  admin: {
    user_id: "u_ad_01",
    display_name: "Alex (admin)",
    email: "admin@fake.gtfactory",
    role: "admin",
  },
  viewer: {
    user_id: "u_vw_01",
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

export function getFakeSession(): FakeSession {
  const stored = readStorage();
  return stored ?? FAKE_USERS.planner;
}

export function setFakeRole(role: Role) {
  const session = FAKE_USERS[role];
  writeStorage(session);
  listeners.forEach((l) => l(session));
}

export function subscribeFakeSession(fn: (session: FakeSession) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
