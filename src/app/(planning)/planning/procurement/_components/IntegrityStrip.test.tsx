// ---------------------------------------------------------------------------
// IntegrityStrip tests — Tranche 132.
//
//   S1 — renders drift / counts / forecast / firmed-plan chips from a
//        live-shaped 0284 session
//   S2 — pre-0284 session (no input_integrity / firmed_window) degrades to
//        drift + warnings only — nothing crashes, nothing invents data
//   S3 — engine warnings render as compact chips (not banners)
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { IntegrityStrip } from "./IntegrityStrip";
import type { PurchaseSession } from "../../purchase-session/_lib/types";

afterEach(() => cleanup());

function makeSession(overrides: Partial<PurchaseSession> = {}): PurchaseSession {
  return {
    session_id: "s1",
    session_type: "weekly",
    session_date: "2026-07-16",
    status: "open",
    horizon_days: 56,
    consolidation_window_days: 21,
    rebuild_verifier_drift: 0,
    warnings: [],
    release_fence: "2026-07-19",
    created_at: "2026-07-16T12:36:00+00:00",
    completed_at: null,
    totals: {
      po_count: 0,
      line_count: 0,
      total_cost: 0,
      by_tier: { urgent: 0, must: 0, recommended: 0 },
      by_status: { proposed: 0, approved: 0, placed: 0, skipped: 0 },
    },
    pos: [],
    ...overrides,
  };
}

describe("IntegrityStrip", () => {
  it("S1 renders the freshness chips from a 0284 session", () => {
    render(
      <IntegrityStrip
        session={makeSession({
          input_integrity: {
            counts: {
              fresh: 4,
              stale: 19,
              targets: 33,
              never_counted: 10,
              threshold_days: 7,
              oldest_age_days: 66,
            },
            forecast: {
              age_days: 38,
              coverage_end: "2026-08-02",
              horizon_end: "2026-09-09",
              uncovered_days: 38,
              published_at: "2026-06-08T12:32:36+00:00",
              version_id: "x",
            },
            verifier_drift: 0,
          },
          firmed_window: {
            firmed_weeks_iso_monday: ["2026-07-13", "2026-07-20", "2026-07-27"],
            window_end: "2026-09-09",
            firmed_plan_rows: 29,
          },
        })}
      />,
    );
    const strip = screen.getByTestId("procurement-integrity-strip");
    expect(strip.textContent).toContain("מלאי מאומת");
    expect(strip.textContent).toContain("ספירות: 4/33 טריות");
    expect(strip.textContent).toContain("תחזית: לפני 38 ימ׳");
    expect(strip.textContent).toContain("תוכנית מאושרת: 3 שב׳");
  });

  it("S2 degrades gracefully on a pre-0284 session", () => {
    render(<IntegrityStrip session={makeSession()} />);
    const strip = screen.getByTestId("procurement-integrity-strip");
    expect(strip.textContent).toContain("מלאי מאומת");
    expect(strip.textContent).not.toContain("ספירות:");
    expect(strip.textContent).not.toContain("תחזית:");
  });

  it("S3 engine warnings render as compact chips", () => {
    render(
      <IntegrityStrip
        session={makeSession({
          warnings: [
            {
              code: "po_missing_expected_delivery",
              detail: "…",
              lines: [{ po_id: "PO-1", target_id: "RAW-NANA", open_qty: 5 }],
            },
            { code: "no_orders_needed", detail: "…" },
          ],
        })}
      />,
    );
    const strip = screen.getByTestId("procurement-integrity-strip");
    expect(strip.textContent).toContain("1 בדרך ללא תאריך");
    // Informational "nothing needed" is not a warning chip.
    expect(strip.textContent).not.toContain("אין צורך בהזמנות");
  });
});
