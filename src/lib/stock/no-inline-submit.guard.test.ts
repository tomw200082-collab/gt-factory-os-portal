import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// §V (tranche 091): every operator stock form posts through `submitStockEvent`.
// No page hand-rolls the submit POST + JSON-safe parse + {posted|pending|
// rejected|network} discrimination at the call site — that skeleton lives in one
// deep module, so the portal_ux_standard §1 "never leak raw JSON to an operator"
// rule cannot be forgotten by a future form author. This guard fails if a stock
// form re-grows a bare `fetch("<submit-endpoint>", …)` for its submission.
//
// (Other fetches in these files — e.g. opening a count snapshot via
// `/api/physical-count/open?…` — are reads, not submissions, and are unaffected:
// the guard pins the bare submit endpoint, not every fetch.)

const STOCK_FORMS: Array<{ file: string; submitEndpoint: string }> = [
  {
    file: "src/app/(ops)/stock/waste-adjustments/page.tsx",
    submitEndpoint: '/api/waste-adjustments"',
  },
  {
    file: "src/app/(ops)/stock/physical-count/page.tsx",
    submitEndpoint: '/api/physical-count"',
  },
];

describe("stock forms route submissions through submitStockEvent", () => {
  for (const { file, submitEndpoint } of STOCK_FORMS) {
    it(`${file} submits via submitStockEvent, not an inline fetch`, () => {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      expect(src).toContain("submitStockEvent");
      expect(src).toContain("@/lib/stock/submit");
      // The bare submit endpoint must no longer be fetched directly.
      expect(src).not.toContain(`fetch("${submitEndpoint}`);
    });
  }
});
