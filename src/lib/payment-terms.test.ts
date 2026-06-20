// Payment-terms vocabulary — tranche 086. The structured (net_days, eom)
// values are the cash-flow foundation, so the supplier-term mapping is the
// thing worth pinning.

import { describe, expect, it } from "vitest";
import { matchSupplierTerm, paymentTermByCode, PAYMENT_TERMS } from "./payment-terms";

describe("payment-terms vocabulary", () => {
  it("every term has a non-negative net_days and a boolean eom", () => {
    for (const t of PAYMENT_TERMS) {
      expect(t.net_days).toBeGreaterThanOrEqual(0);
      expect(typeof t.eom).toBe("boolean");
    }
  });

  it("maps שוטף+N to the EOM family (eom=true)", () => {
    const m = matchSupplierTerm("שוטף + 30");
    expect(m?.net_days).toBe(30);
    expect(m?.eom).toBe(true);
  });

  it("maps NET_N to the net family (eom=false)", () => {
    const m = matchSupplierTerm("NET_45");
    expect(m?.net_days).toBe(45);
    expect(m?.eom).toBe(false);
  });

  it("maps cash / מזומן to net_days 0", () => {
    expect(matchSupplierTerm("מזומן")?.net_days).toBe(0);
    expect(matchSupplierTerm("cash")?.code).toBe("CASH");
  });

  it("returns null for empty / unrecognised input", () => {
    expect(matchSupplierTerm(null)).toBeNull();
    expect(matchSupplierTerm("")).toBeNull();
    expect(matchSupplierTerm("on delivery")).toBeNull();
  });

  it("paymentTermByCode round-trips", () => {
    expect(paymentTermByCode("EOM_60")?.label).toBe("שוטף+60");
    expect(paymentTermByCode("NOPE")).toBeUndefined();
  });
});
