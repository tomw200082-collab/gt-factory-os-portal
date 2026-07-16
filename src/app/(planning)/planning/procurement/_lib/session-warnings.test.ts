// ---------------------------------------------------------------------------
// Session-warning decoding tests — Tranche 132, extended Tranche 133.
//
//   W1 — builds a target→issues map from the machine-readable lines payload
//   W2 — issue labels: no-ETA quantity, overdue days
//   W3 — unknown codes / missing payloads degrade gracefully
//   W4 — warning chips carry Hebrew labels with the line count
//   W6 — PO-hygiene warning chips resolve a fix href to the first PO
//   W7 — components_without_supplier resolves is_item-aware master-data hrefs
//   W8 — stale_stock_input has no href (its fix is the refresh action, not a link)
//   W9 — inboundIssuePrimaryHref follows the same worst-first priority as the label
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import {
  buildInboundIssueMap,
  inboundIssueLabel,
  inboundIssuePrimaryHref,
  inboundIssueTooltip,
  parseUnassignedTargets,
  unassignedFixHref,
  warningChip,
} from "./session-warnings";
import type { PurchaseSessionWarning } from "../../purchase-session/_lib/types";

// Shape captured from the live 2026-07-16 session warnings.
const WARNINGS: PurchaseSessionWarning[] = [
  {
    code: "po_missing_expected_delivery",
    detail: "2 open PO line(s) …",
    lines: [
      { po_id: "PO-2026-00263", target_id: "RAW-DRIED-ORANGE", open_qty: 5, is_item: false, line_status: "OPEN" },
      { po_id: "PO-2026-00263", target_id: "RAW-NANA", open_qty: 5, is_item: false, line_status: "PARTIAL" },
    ],
  },
  {
    code: "po_overdue_receipt",
    detail: "1 open PO line(s) …",
    lines: [
      {
        po_id: "PO-2026-00216",
        target_id: "PKG-BOTTLE-1L",
        open_qty: 32999,
        days_overdue: 11,
        expected_receive_date: "2026-07-05",
        is_item: false,
        line_status: "OPEN",
      },
    ],
  },
];

describe("buildInboundIssueMap", () => {
  it("W1 maps each warned target to its open-PO issues", () => {
    const map = buildInboundIssueMap(WARNINGS);
    expect(map.get("RAW-NANA")).toHaveLength(1);
    expect(map.get("RAW-NANA")?.[0].kind).toBe("no_eta");
    expect(map.get("RAW-NANA")?.[0].openQty).toBe(5);
    expect(map.get("PKG-BOTTLE-1L")?.[0].kind).toBe("overdue");
    expect(map.get("PKG-BOTTLE-1L")?.[0].daysOverdue).toBe(11);
    expect(map.get("SOMETHING-ELSE")).toBeUndefined();
  });

  it("W2 labels quantify the issue", () => {
    const map = buildInboundIssueMap(WARNINGS);
    expect(inboundIssueLabel(map.get("RAW-NANA")!)).toBe("בדרך 5 ללא תאריך");
    expect(inboundIssueLabel(map.get("PKG-BOTTLE-1L")!)).toBe(
      "אספקה באיחור 11 ימ׳",
    );
    expect(inboundIssueTooltip(map.get("RAW-NANA")!)).toContain(
      "PO-2026-00263",
    );
  });

  it("W3 unknown codes and missing payloads degrade gracefully", () => {
    const map = buildInboundIssueMap([
      { code: "components_without_supplier", detail: "…" },
      { code: "made_up_code", detail: "…", lines: "not-an-array" },
    ] as PurchaseSessionWarning[]);
    expect(map.size).toBe(0);
  });

  it("W4 warning chips carry Hebrew labels with counts", () => {
    expect(warningChip(WARNINGS[0]).label).toBe("2 בדרך ללא תאריך");
    expect(warningChip(WARNINGS[1]).label).toBe("1 אספקות באיחור");
  });

  it("W5 an unmapped warning code never leaks its raw name as the label (ux-release-gate COPY-003)", () => {
    const generic = warningChip({ code: "weird", detail: "details here" });
    expect(generic.label).not.toBe("weird");
    expect(generic.label).toBe("התראת מערכת");
    expect(generic.tooltip).toBe("details here");
    const noDetail = warningChip({ code: "weird", detail: "" });
    expect(noDetail.tooltip).toBe("פנו לתמיכה לפרטים.");
  });

  it("W6 PO-hygiene warning chips resolve a fix href to the first affected PO", () => {
    expect(warningChip(WARNINGS[0]).href).toBe("/purchase-orders/PO-2026-00263");
    expect(warningChip(WARNINGS[1]).href).toBe("/purchase-orders/PO-2026-00216");
  });

  it("W7 components_without_supplier resolves is_item-aware master-data hrefs (0286)", () => {
    const componentWarning: PurchaseSessionWarning = {
      code: "components_without_supplier",
      detail: "1 planned line(s) …",
      lines: [
        {
          target_id: "RAW-APPLE-DRY",
          is_item: false,
          label: "Dried Apple",
          qty_purchase: 12,
          uom: "KG",
          need_date: "2026-07-20",
        },
      ],
    };
    const itemWarning: PurchaseSessionWarning = {
      code: "components_without_supplier",
      detail: "1 planned line(s) …",
      lines: [
        { target_id: "FG-COLA-1L", is_item: true, label: "Cola 1L" },
      ],
    };
    const preMigrationWarning: PurchaseSessionWarning = {
      code: "components_without_supplier",
      detail: "1 planned line(s) …",
      lines: [{ target_id: "SEMI-FRE-BASE", label: "Fresh Tea Base" }], // no is_item — pre-0286 session
    };

    expect(warningChip(componentWarning).href).toBe(
      "/admin/masters/components/RAW-APPLE-DRY",
    );
    expect(warningChip(itemWarning).href).toBe(
      "/admin/masters/items/FG-COLA-1L",
    );
    // Never a guessed route — degrade to no link on old sessions.
    expect(warningChip(preMigrationWarning).href).toBeNull();

    const targets = parseUnassignedTargets(componentWarning);
    expect(targets).toHaveLength(1);
    expect(targets[0].isItem).toBe(false);
    expect(unassignedFixHref(targets[0])).toBe(
      "/admin/masters/components/RAW-APPLE-DRY",
    );
    expect(unassignedFixHref({ targetId: "X", isItem: null })).toBeNull();
  });

  it("W8 stale_stock_input has no href — its fix is the refresh action, not a navigation link", () => {
    const chip = warningChip({
      code: "stale_stock_input",
      detail: "rebuild_verifier drift is 3 — …",
    });
    expect(chip.href).toBeNull();
    expect(chip.tooltip).toContain("רענון המלצות");
  });

  it("W9 inboundIssuePrimaryHref follows the same worst-first priority as the label", () => {
    const map = buildInboundIssueMap(WARNINGS);
    expect(inboundIssuePrimaryHref(map.get("RAW-NANA")!)).toBe(
      "/purchase-orders/PO-2026-00263",
    );
    expect(inboundIssuePrimaryHref(map.get("PKG-BOTTLE-1L")!)).toBe(
      "/purchase-orders/PO-2026-00216",
    );
    expect(inboundIssuePrimaryHref([])).toBeNull();
  });
});
