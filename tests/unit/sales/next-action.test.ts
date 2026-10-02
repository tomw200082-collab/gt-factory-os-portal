// The next action is real task or promise state of this business only (design §2 F4).
import { describe, it, expect } from "vitest";
import { nextActionFor } from "@/app/(sales)/_lib/nextAction";
import { ORG_ID, lead, task } from "./_orgFixtures";

const NOW = new Date("2026-10-02T09:00:00.000Z");

describe("nextActionFor", () => {
  it("is null when the business has no open task and no promised touch", () => {
    expect(nextActionFor(ORG_ID, [], [lead({ next_touch_at: null })], NOW)).toBeNull();
  });

  it("picks the earliest open task of a lead of this business", () => {
    const a = nextActionFor(ORG_ID, [task({ id: "t2", due_at: "2026-10-09T06:00:00.000Z" }), task({ id: "t1" })], [lead()], NOW);
    expect(a?.source).toBe("task");
    expect(a?.taskId).toBe("t1");
    expect(a?.title).toBe("לחזור לליד");
    expect(a?.why).toBe("נקבע בעקבות תוצאת קשר");
    expect(a?.leadId).toBe("00000000-0000-4000-8000-0000000000d1");
    expect(a?.overdue).toBe(false);
  });

  it("counts a task tied to the org itself", () => {
    const a = nextActionFor(ORG_ID, [task({ lead_id: null, org_id: ORG_ID })], [], NOW);
    expect(a?.source).toBe("task");
    expect(a?.leadId).toBeNull();
  });

  it("ignores another business's tasks and leads", () => {
    const other = "00000000-0000-4000-8000-0000000000ff";
    expect(nextActionFor(ORG_ID, [task({ lead_id: "zz", org_id: other })], [lead({ org_id: other })], NOW)).toBeNull();
  });

  it("falls back to the promised next touch of an open lead", () => {
    const a = nextActionFor(ORG_ID, [], [lead()], NOW);
    expect(a?.source).toBe("touch");
    expect(a?.dueAt).toBe("2026-10-05T06:00:00.000Z");
    expect(a?.leadId).toBe("00000000-0000-4000-8000-0000000000d1");
  });

  it("ignores a closed lead's old promise", () => {
    expect(nextActionFor(ORG_ID, [], [lead({ status: "lost" })], NOW)).toBeNull();
    expect(nextActionFor(ORG_ID, [], [lead({ status: "won" })], NOW)).toBeNull();
  });

  it("says overdue when the due time has passed", () => {
    expect(nextActionFor(ORG_ID, [task({ due_at: "2026-10-01T06:00:00.000Z" })], [lead()], NOW)?.overdue).toBe(true);
  });

  it("prefers the earlier of a task and a promise", () => {
    const a = nextActionFor(ORG_ID, [task({ due_at: "2026-10-20T06:00:00.000Z" })], [lead()], NOW);
    expect(a?.source).toBe("touch");
  });
});
