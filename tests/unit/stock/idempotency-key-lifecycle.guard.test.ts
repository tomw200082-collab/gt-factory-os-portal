import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// §V (tranche 094): each operator stock form must hold its SUBMIT idempotency
// key in a ref that is reused across retries, and must NOT regenerate the key
// inline in the submit envelope. Inline regeneration (`idempotency_key:
// newIdempotencyKey()`) lets a retry after a lost response post a SECOND ledger
// event — a stock-truth violation. This guard fails if that pattern returns.
//
// (The physical-count CANCEL call legitimately mints a fresh key per cancel via
// a local `const idempotencyKey = newIdempotencyKey()` — a distinct operation —
// so the guard pins only the inline `idempotency_key: newIdempotencyKey()`
// envelope shape, not every use of newIdempotencyKey.)

const FORMS = [
  "src/app/(ops)/stock/receipts/page.tsx",
  "src/app/(ops)/stock/waste-adjustments/page.tsx",
  "src/app/(ops)/stock/physical-count/page.tsx",
];

describe("stock forms hold a stable submit idempotency key", () => {
  for (const rel of FORMS) {
    it(`${rel} reuses a key ref and does not regenerate inline`, () => {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      expect(src).toContain("idemKeyRef");
      expect(src).not.toContain("idempotency_key: newIdempotencyKey()");
    });
  }
});
