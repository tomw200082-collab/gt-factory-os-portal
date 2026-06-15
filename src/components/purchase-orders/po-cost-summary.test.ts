import { describe, expect, it } from "vitest";
import {
  summarizePoLineCosts,
  type PoLineCostInput,
} from "./po-cost-summary";

function line(over: Partial<PoLineCostInput> = {}): PoLineCostInput {
  return {
    ordered_qty: "10",
    received_qty: "0",
    open_qty: "10",
    unit_price_net: "5",
    line_total_net: "50",
    line_status: "OPEN",
    ...over,
  };
}

describe("summarizePoLineCosts", () => {
  it("sums ordered / received / open value across lines", () => {
    const s = summarizePoLineCosts([
      line({ received_qty: "4", open_qty: "6" }), // 50 ordered, 20 received, 30 open
      line({
        ordered_qty: "2",
        received_qty: "2",
        open_qty: "0",
        unit_price_net: "100",
        line_total_net: "200",
        line_status: "CLOSED",
      }), // 200 ordered, 200 received, 0 open
    ]);
    expect(s.orderedValue).toBe(250);
    expect(s.receivedValue).toBe(220);
    expect(s.openValue).toBe(30);
    expect(s.hasPrices).toBe(true);
  });

  it("excludes cancelled lines", () => {
    const s = summarizePoLineCosts([
      line({ line_status: "CANCELLED" }),
      line({ received_qty: "10", open_qty: "0" }),
    ]);
    expect(s.orderedValue).toBe(50);
    expect(s.receivedValue).toBe(50);
  });

  it("reports hasPrices=false when no line carries a price", () => {
    const s = summarizePoLineCosts([
      line({ unit_price_net: "0", line_total_net: "0" }),
    ]);
    expect(s.hasPrices).toBe(false);
    expect(s.orderedValue).toBe(0);
  });

  it("receivedFraction is 0 when nothing is ordered by value", () => {
    const s = summarizePoLineCosts([
      line({ unit_price_net: "0", line_total_net: "0" }),
    ]);
    expect(s.receivedFraction).toBe(0);
  });

  it("receivedFraction caps at 1 on over-receipt", () => {
    const s = summarizePoLineCosts([
      line({ received_qty: "20", open_qty: "0" }), // received 100 vs ordered 50
    ]);
    expect(s.receivedFraction).toBe(1);
  });
});
