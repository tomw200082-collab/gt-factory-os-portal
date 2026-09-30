import { describe, expect, it } from "vitest";
import { deriveLeadMilestones } from "@/app/(sales)/_lib/leadMilestones";
import type { LeadEventRow } from "@/app/(sales)/_lib/types";

function event(id: string, event_type: string, payload: Record<string, unknown> = {}): LeadEventRow {
  return { id, lead_id: "synthetic-lead", event_type, payload, actor: "rep", created_at: "2026-09-29T12:00:00Z" };
}

describe("source-backed lead milestones", () => {
  it("keeps an outreach attempt distinct from a verified answered activity", () => {
    expect(deriveLeadMilestones([event("e1", "outreach", { channel: "call" })]))
      .not.toContainEqual(expect.objectContaining({ kind: "answered" }));
    expect(deriveLeadMilestones([event("e2", "outcome", { result: "answered_progressing" })]))
      .not.toContainEqual(expect.objectContaining({ kind: "answered" }));
    expect(deriveLeadMilestones([event("e3", "outcome", { result: "answered_progressing", note_event_id: "n1", channel: "call" })]))
      .toContainEqual(expect.objectContaining({ kind: "answered", sourceEventId: "e3" }));
  });

  it("never promotes a draft or outbound message into verified conversion or reply", () => {
    const nodes = deriveLeadMilestones([
      event("d1", "draft_order", { idem_key: "synthetic" }),
      event("m1", "auto_message", { kind: "wake" }),
      event("o1", "outcome", { result: "whatsapp_sent", channel: "whatsapp" }),
    ]);
    expect(nodes.some((node) => node.kind === "converted" || node.kind === "answered")).toBe(false);
  });

  it("links a verified conversion and next action to their committed sources", () => {
    const nodes = deriveLeadMilestones([
      event("c1", "created"),
      event("a1", "outreach", { channel: "call" }),
      event("n1", "outcome", { result: "answered_progressing", channel: "call", request_id: "synthetic-request", note_event_id: "note1", next_touch_at: "2026-10-01T09:00:00Z" }),
      event("d1", "draft_order", { idem_key: "synthetic" }),
      event("w1", "converted", { order_ref: "GI-synthetic" }),
    ]);
    expect(nodes.map((node) => node.kind)).toEqual(["created", "outreach", "answered", "next_action", "converted"]);
    expect(nodes.every((node) => Boolean(node.sourceEventId))).toBe(true);
    expect(nodes.find((node) => node.kind === "converted")?.sourceEventId).toBe("w1");
  });
});
