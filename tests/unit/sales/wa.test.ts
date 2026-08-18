import { describe, it, expect } from "vitest";
import {
  fillTemplate,
  mailtoHref,
  snapshotFacts,
  telHref,
  templateFor,
  waHref,
} from "@/app/(sales)/_lib/wa";
import type { WhatsappTemplates } from "@/app/(sales)/_lib/types";

const TEMPLATES: WhatsappTemplates = {
  new_lead: "היי {{name}}, כאן תום",
  reminder: "היי {{name}}, רק מוודא",
  returning_customer: "היי {{name}}, איזה כיף לראות אותך שוב",
};

describe("outreach links", () => {
  it("builds a wa.me link from bare digits with the text encoded", () => {
    const href = waHref("+972521234567", "היי");
    expect(href).toBe("https://wa.me/972521234567?text=%D7%94%D7%99%D7%99");
  });

  it("returns null when there is no number to call", () => {
    expect(waHref(null, "x")).toBeNull();
    expect(telHref(undefined)).toBeNull();
    expect(mailtoHref(null)).toBeNull();
  });

  it("builds tel: and mailto: links", () => {
    expect(telHref("+972521234567")).toBe("tel:+972521234567");
    expect(mailtoHref("a@b.co.il")).toBe("mailto:a@b.co.il");
  });

  it("fills the name placeholder, and empties it when the name is unknown", () => {
    expect(fillTemplate(TEMPLATES.new_lead, "דנה")).toBe("היי דנה, כאן תום");
    expect(fillTemplate(TEMPLATES.new_lead, null)).toBe("היי , כאן תום");
    expect(fillTemplate("{{ name }} שלום", "דנה")).toBe("דנה שלום");
  });

  it("opens a returning customer with the warmer template", () => {
    expect(templateFor(TEMPLATES, { isExistingCustomer: true })).toBe(
      TEMPLATES.returning_customer,
    );
    expect(templateFor(TEMPLATES, { alreadyTouched: true })).toBe(TEMPLATES.reminder);
    expect(templateFor(TEMPLATES, {})).toBe(TEMPLATES.new_lead);
  });
});

describe("customer snapshot", () => {
  it("returns the facts that help a call, in call order", () => {
    const facts = snapshotFacts({
      status: "נטש",
      rev12: "2152",
      orders: "5",
      days_since_last_order: "196",
      as_of: "2026-08-06",
      source: "customer-product-tracker",
    });
    expect(facts.map((f) => f.key)).toEqual([
      "status",
      "rev12",
      "orders",
      "days_since_last_order",
    ]);
  });

  it("omits what the snapshot does not carry, and invents nothing", () => {
    expect(snapshotFacts({ status: "פעיל" }).map((f) => f.key)).toEqual(["status"]);
    expect(snapshotFacts({ rev12: "" })).toEqual([]);
    expect(snapshotFacts(null)).toEqual([]);
    expect(snapshotFacts(undefined)).toEqual([]);
  });
});
