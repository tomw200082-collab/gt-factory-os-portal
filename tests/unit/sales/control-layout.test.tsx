// UX gate P1-1 (tranche 205): /sales/control answers the portal's own 404 to anyone but Tom,
// from a server layout, before the page renders. The backend stays the guard.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const state = vi.hoisted(() => ({ cookie: null as string | null, user: null as string | null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "gt.devshim.email" && state.cookie ? { value: state.cookie } : undefined) }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user ? { email: state.user } : null } }) } }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

import ControlLayout, { generateMetadata } from "@/app/(sales)/sales/control/layout";

const env = { ...process.env };
beforeEach(() => { state.cookie = null; state.user = null; });
afterEach(() => { process.env = { ...env }; });

describe("the control route's server layout", () => {
  it("signed in as another admin (Supabase session): 404 and no title of its own", async () => {
    process.env.NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH = "false";
    state.user = "admin@gteveryday.com";
    await expect(ControlLayout({ children: "x" })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await generateMetadata()).toEqual({});
  });

  it("no session at all: 404", async () => {
    process.env.NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH = "false";
    await expect(ControlLayout({ children: "x" })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("Tom (any case): the page, with its title", async () => {
    process.env.NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH = "false";
    state.user = "Tom@GTEveryday.com";
    expect(await ControlLayout({ children: "x" })).toBe("x");
    expect((await generateMetadata()).title).toBe("חדר בקרה — GT CRM");
  });

  it("dev-shim (never on production): the shim's email cookie decides; a production deployment ignores the cookie", async () => {
    process.env.NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH = "true";
    state.cookie = encodeURIComponent("tom@gteveryday.com");
    expect(await ControlLayout({ children: "x" })).toBe("x");
    state.cookie = "admin%40fake.gtfactory";
    await expect(ControlLayout({ children: "x" })).rejects.toThrow("NEXT_NOT_FOUND");
    process.env.VERCEL_ENV = "production";
    state.cookie = encodeURIComponent("tom@gteveryday.com");
    state.user = null;
    await expect(ControlLayout({ children: "x" })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
