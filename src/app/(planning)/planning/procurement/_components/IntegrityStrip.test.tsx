// ---------------------------------------------------------------------------
// IntegrityStrip tests — Tranche 132, extended Tranche 133.
//
//   S1 — renders drift / counts / forecast / firmed-plan chips from a
//        live-shaped 0284 session
//   S2 — pre-0284 session (no input_integrity / firmed_window) degrades to
//        drift + warnings only — nothing crashes, nothing invents data
//   S3 — engine warnings render as compact chips (not banners)
//   S4 — the refresh action appears only when the input actually looks
//        untrustworthy, and calls onRefresh on click
//   S5 — a warning chip with a resolved fix href renders as a real link
//   S6 — the mobile collapse toggle flips aria-expanded without crashing
//   S7 — refreshConfirming disables the refresh action (ux-release-gate
//        2026-07-21 INT-P0-1: a second tap must not land as the implicit
//        supersede confirm)
//   S8 — an /admin fix target degrades to a tooltip-only badge for a role
//        without admin:execute (FLOW-101)
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntegrityStrip } from "./IntegrityStrip";
import type { PurchaseSession } from "../../purchase-session/_lib/types";

// IntegrityStrip consults useCapability (FLOW-101) which needs the session
// provider — stub it with a switchable value so tests run without one.
const capability = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/auth/role-gate", () => ({
  useCapability: () => capability.value,
}));

afterEach(() => {
  capability.value = true;
  cleanup();
});

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

  it("S4a no untrustworthy signal → no refresh action, even with onRefresh supplied", () => {
    const onRefresh = vi.fn();
    render(<IntegrityStrip session={makeSession()} onRefresh={onRefresh} />);
    expect(screen.queryByTestId("procurement-integrity-refresh")).toBeNull();
  });

  it("S4b drift present → refresh action shows and fires onRefresh on click", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    render(
      <IntegrityStrip
        session={makeSession({ rebuild_verifier_drift: 3 })}
        onRefresh={onRefresh}
      />,
    );
    await user.click(screen.getByTestId("procurement-integrity-refresh"));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("S4c no onRefresh supplied → never rendered, even with drift", () => {
    render(
      <IntegrityStrip session={makeSession({ rebuild_verifier_drift: 3 })} />,
    );
    expect(screen.queryByTestId("procurement-integrity-refresh")).toBeNull();
  });

  it("S5 a warning chip with a resolved fix href renders as a real link", () => {
    render(
      <IntegrityStrip
        session={makeSession({
          warnings: [
            {
              code: "po_overdue_receipt",
              detail: "1 open PO line(s) …",
              lines: [{ po_id: "PO-9", target_id: "c1", days_overdue: 4 }],
            },
          ],
        })}
      />,
    );
    const link = screen.getByTestId(
      "procurement-integrity-warning-po_overdue_receipt",
    );
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/purchase-orders/PO-9");
  });

  it("S6 the mobile collapse toggle flips aria-expanded", async () => {
    const user = userEvent.setup();
    render(<IntegrityStrip session={makeSession()} />);
    const toggle = screen.getByTestId("procurement-integrity-strip-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    // The full detail content is still reachable regardless of collapse
    // state (jsdom doesn't evaluate the sm: breakpoint that visually hides
    // it) — the toggle only needs to not lose or duplicate content.
    expect(screen.getByTestId("procurement-integrity-strip").textContent).toContain(
      "מלאי מאומת",
    );
  });

  it("S7 refreshConfirming disables the refresh action and blocks a second tap", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    render(
      <IntegrityStrip
        session={makeSession({ rebuild_verifier_drift: 3 })}
        onRefresh={onRefresh}
        refreshConfirming
      />,
    );
    const btn = screen.getByTestId(
      "procurement-integrity-refresh",
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain("ממתין לאישור…");
    await user.click(btn).catch(() => undefined);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("S8 an /admin fix chip degrades to a badge for a role without admin:execute", () => {
    const warnings = [
      {
        code: "components_without_supplier",
        detail: "…",
        lines: [{ target_id: "c-77", is_item: false, label: "פירה קיווי" }],
      },
    ];
    capability.value = false;
    const { unmount } = render(
      <IntegrityStrip session={makeSession({ warnings })} />,
    );
    expect(
      screen.queryByTestId(
        "procurement-integrity-warning-components_without_supplier",
      ),
    ).toBeNull();
    expect(
      screen.getByTestId("procurement-integrity-strip").textContent,
    ).toContain("1 ללא ספק");
    unmount();

    capability.value = true;
    render(<IntegrityStrip session={makeSession({ warnings })} />);
    const link = screen.getByTestId(
      "procurement-integrity-warning-components_without_supplier",
    );
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/admin/masters/components/c-77");
  });
});
