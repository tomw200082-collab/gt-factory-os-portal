// Contract test for the sales API proxy stubs.
//
// The portal never queries Supabase for data; every read and write goes through
// a route handler that calls proxyRequest against the Fastify upstream. These
// assertions read the stub files as text — the same idiom
// tests/unit/globals-css-mobile-zoom.test.ts uses — so a stub that quietly
// stops proxying, or points at the wrong upstream path, fails here rather than
// at runtime.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const API_DIR = path.join(process.cwd(), "src/app/api/sales");

interface Stub {
  file: string;
  upstream: string;
  methods: string[];
}

const STUBS: Stub[] = [
  { file: "today/route.ts", upstream: "/api/v1/queries/sales/today", methods: ["GET"] },
  { file: "leads/route.ts", upstream: "/api/v1/queries/sales/leads", methods: ["GET"] },
  { file: "orgs/route.ts", upstream: "/api/v1/queries/sales/orgs", methods: ["GET"] },
  { file: "week-stats/route.ts", upstream: "/api/v1/queries/sales/week-stats", methods: ["GET"] },
  { file: "settings/route.ts", upstream: "sales/settings", methods: ["GET", "PUT"] },
  { file: "quick-add/route.ts", upstream: "/api/v1/mutations/sales/quick-add", methods: ["POST"] },
  { file: "leads/[lead_id]/events/route.ts", upstream: "queries/sales/leads/", methods: ["GET"] },
  { file: "leads/[lead_id]/status/route.ts", upstream: "mutations/sales/leads/", methods: ["POST"] },
  { file: "leads/[lead_id]/note/route.ts", upstream: "mutations/sales/leads/", methods: ["POST"] },
  { file: "leads/[lead_id]/next-touch/route.ts", upstream: "mutations/sales/leads/", methods: ["POST"] },
  { file: "leads/[lead_id]/assign/route.ts", upstream: "mutations/sales/leads/", methods: ["POST"] },
  { file: "leads/[lead_id]/outreach/route.ts", upstream: "mutations/sales/leads/", methods: ["POST"] },
  { file: "leads/[lead_id]/outcome/route.ts", upstream: "mutations/sales/leads/", methods: ["POST"] },
];

function read(stub: Stub): string {
  return fs.readFileSync(path.join(API_DIR, stub.file), "utf8");
}

describe("sales API proxy stubs", () => {
  it.each(STUBS)("$file proxies to the Fastify upstream", (stub) => {
    const src = read(stub);
    expect(src).toContain("proxyRequest");
    expect(src).toContain('from "@/lib/api-proxy"');
    expect(src).toContain(stub.upstream);
  });

  it.each(STUBS)("$file exports exactly its intended methods", (stub) => {
    const src = read(stub);
    for (const method of stub.methods) {
      expect(src).toMatch(new RegExp(`export async function ${method}\\b`));
    }
    const exported = [...src.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
    expect(exported.sort()).toEqual([...stub.methods].sort());
  });

  it("never reaches Supabase directly for data", () => {
    for (const stub of STUBS) {
      expect(read(stub)).not.toContain("createSupabase");
    }
  });

  it("escapes the lead id on every dynamic route", () => {
    for (const stub of STUBS.filter((s) => s.file.includes("[lead_id]"))) {
      const src = read(stub);
      expect(src).toContain("encodeURIComponent(lead_id)");
      expect(src).toContain("await params");
    }
  });
});
