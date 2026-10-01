import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// §V (2026-07-31): a status change goes to POST .../:id/status, never to the
// entity PATCH.
//
// The Archive screen's Restore buttons used to call
//   PATCH /api/{items,components,suppliers}/:id  with { status, if_match_updated_at }
// but the PATCH schema on all three has no `status` field (zod strips unknown
// keys) and requires an `idempotency_key` that was never sent — so every
// Restore returned 422 and nothing was ever restored. The bug was invisible
// because the button reported a generic failure.
//
// The two shapes are easy to confuse: both take if_match_updated_at, and the
// PATCH endpoint exists and is the one used for field edits on the same page
// (expiry_date). This guard pins the distinction so a future author editing
// this screen cannot re-cross the wires.

const ARCHIVE_PAGE = "src/app/(admin)/admin/masters/archive/page.tsx";

describe("archive restore posts to the status endpoint", () => {
  const src = readFileSync(join(process.cwd(), ARCHIVE_PAGE), "utf8");

  it("uses the shared postStatus helper", () => {
    expect(src).toContain("postStatus");
    expect(src).toContain("@/lib/admin/mutations");
  });

  it("targets /status for all three restorable entities", () => {
    for (const entity of ["items", "components", "suppliers"]) {
      expect(src).toContain(`/api/${entity}/`);
    }
    expect(src).toContain("/status");
  });

  it("does not hand-roll a PATCH carrying a status field", () => {
    // The page still PATCHes for expiry_date, which is legitimate — what must
    // never come back is a PATCH body that tries to carry `status`.
    expect(src).not.toMatch(/method:\s*"PATCH"[\s\S]{0,400}?\bstatus:/);
    expect(src).not.toContain("patchStatus");
  });

  it("still routes field edits through patchEntity", () => {
    expect(src).toContain("patchEntity");
    expect(src).toContain("expiry_date");
  });
});
