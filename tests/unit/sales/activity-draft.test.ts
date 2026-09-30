import { beforeEach, describe, expect, it } from "vitest";
import { clearActivityDraft, markActivityAttempt, readActivityDraft, saveActivityDraft } from "@/app/(sales)/_lib/activityDraft";

describe("per-agent lead activity draft", () => {
  beforeEach(() => sessionStorage.clear());

  it("survives reload and keeps the request ID for a timeout retry", () => {
    const first = readActivityDraft("rep@synthetic.invalid", "L1");
    saveActivityDraft("rep@synthetic.invalid", "L1", { ...first, note: " שיחה טובה ", kind: "call" });
    const recovered = readActivityDraft("rep@synthetic.invalid", "L1");
    expect(recovered).toMatchObject({ request_id: first.request_id, note: " שיחה טובה ", kind: "call" });
    expect(recovered.request_id).toMatch(/^[a-f0-9-]{36}$/i);
  });

  it("does not expose one agent or lead's note to another", () => {
    const original = readActivityDraft("rep@synthetic.invalid", "L1");
    saveActivityDraft("rep@synthetic.invalid", "L1", { ...original, note: "פרטים אישיים" });
    expect(readActivityDraft("other@synthetic.invalid", "L1").note).toBe("");
    expect(readActivityDraft("rep@synthetic.invalid", "L2").note).toBe("");
  });

  it("clears only after confirmed success", () => {
    const original = readActivityDraft("rep@synthetic.invalid", "L1");
    saveActivityDraft("rep@synthetic.invalid", "L1", { ...original, note: "שיחה טובה" });
    clearActivityDraft("rep@synthetic.invalid", "L1");
    expect(readActivityDraft("rep@synthetic.invalid", "L1").note).toBe("");
    expect(readActivityDraft("rep@synthetic.invalid", "L1").request_id).not.toBe(original.request_id);
  });

  it("retries the same request ID, but rotates it after an attempted payload changes", () => {
    const draft = saveActivityDraft("rep@synthetic.invalid", "L1", {
      ...readActivityDraft("rep@synthetic.invalid", "L1"), note: "אבגדה", kind: "call", due_at: "2026-10-01",
    });
    const attempt = markActivityAttempt("rep@synthetic.invalid", "L1", draft);
    expect(markActivityAttempt("rep@synthetic.invalid", "L1", readActivityDraft("rep@synthetic.invalid", "L1")).request_id).toBe(attempt.request_id);
    const changed = saveActivityDraft("rep@synthetic.invalid", "L1", { ...attempt, note: "אבגדה אחרת" });
    expect(changed.request_id).not.toBe(attempt.request_id);
    expect(changed.attempted).toBeUndefined();
    const otherChannel = markActivityAttempt("rep@synthetic.invalid", "L1", { ...changed, channel: "email" });
    expect(otherChannel.request_id).toBe(changed.request_id);
    const switched = markActivityAttempt("rep@synthetic.invalid", "L1", { ...otherChannel, channel: "call" });
    expect(switched.request_id).not.toBe(otherChannel.request_id);
  });
});
