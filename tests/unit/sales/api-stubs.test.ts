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
  { file: "tasks/route.ts", upstream: "/api/v1/queries/sales/tasks", methods: ["GET"] },
  { file: "tasks/[task_id]/complete/route.ts", upstream: "/api/v1/mutations/sales/tasks/", methods: ["POST"] },
  { file: "leads/[lead_id]/contact/route.ts", upstream: "/api/v1/mutations/sales/leads/", methods: ["PATCH"] },
  { file: "leads/[lead_id]/activity/route.ts", upstream: "/api/v1/mutations/sales/leads/", methods: ["POST"] },
  // GT Pulse Unit B (tranche 189). The legacy GET /orgs proxy is gone with its last caller.
  { file: "orgs/page/route.ts", upstream: "/api/v1/queries/sales/orgs/page", methods: ["GET"] },
  { file: "orgs/search/route.ts", upstream: "/api/v1/queries/sales/orgs/search", methods: ["GET"] },
  { file: "orgs/owner/route.ts", upstream: "/api/v1/mutations/sales/orgs/owner", methods: ["POST"] },
  { file: "orgs/[id]/route.ts", upstream: "/api/v1/queries/sales/orgs/", methods: ["GET"] },
  { file: "orgs/[id]/orders/route.ts", upstream: "/orders", methods: ["GET"] },
  { file: "orgs/[id]/orders/[gid]/route.ts", upstream: "/orders/", methods: ["GET"] },
  { file: "orgs/[id]/river/route.ts", upstream: "/river", methods: ["GET"] },
  { file: "orgs/[id]/contacts/route.ts", upstream: "/contacts", methods: ["GET"] },
  { file: "orgs/[id]/circle/route.ts", upstream: "/circle", methods: ["GET"] },
  { file: "orgs/[id]/identity/route.ts", upstream: "/api/v1/mutations/sales/orgs/", methods: ["POST"] },
  { file: "identity-review/route.ts", upstream: "/api/v1/queries/sales/identity-review", methods: ["GET"] },
  { file: "contacts/[id]/[action]/route.ts", upstream: "/api/v1/mutations/sales/contacts/", methods: ["POST"] },
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

  it("escapes the org id on every Unit B dynamic route, and the order gid", () => {
    for (const stub of STUBS.filter((s) => s.file.includes("[id]"))) {
      const src = read(stub);
      expect(src).toContain("encodeURIComponent(id)");
      expect(src).toContain("await params");
    }
    expect(read(STUBS.find((s) => s.file.includes("[gid]"))!)).toContain("encodeURIComponent(raw)");
  });

  it("forwards only the contact decisions the portal makes (code review M2)", () => {
    const src = read(STUBS.find((s) => s.file.includes("[action]"))!);
    expect(src).toContain('new Set(["verify", "reject"])');
    expect(src).toContain("status: 404");
  });

  it("does not keep the legacy org list proxy", () => {
    expect(fs.existsSync(path.join(API_DIR, "orgs/route.ts"))).toBe(false);
  });

  it("escapes the task id on task completion", () => {
    const src = read(STUBS.find((s) => s.file.includes("[task_id]"))!);
    expect(src).toContain("encodeURIComponent(task_id)");
    expect(src).toContain("await params");
  });
});
