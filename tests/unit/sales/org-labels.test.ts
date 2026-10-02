// Every event the river can carry reads in Hebrew. The lists below are copied
// from the backend's check constraints (gt-factory-os db/migrations
// 0360_lead_journey.sql for lead_event, 0364_sales_org_identity.sql for
// org_event); a type added there without a label here fails this test.

import { describe, it, expect } from "vitest";
import {
  CONTACT_SOURCE_LABELS,
  DRAFT_STATUS_LABELS,
  EXCEPTION_LABELS,
  IDENTITY_REASON_LABELS,
  ORDER_CLASS_LABELS,
  RIVER_EVENT_LABELS,
  contactSourceLabel,
  riverEventLabel,
} from "@/app/(sales)/_lib/labels";

const LEAD_EVENT_TYPES = [
  "created", "status_change", "note", "assignment", "next_touch_set",
  "alert_sent", "converted", "matched_existing_customer", "imported",
  "outreach", "outcome", "reminder_sent",
  "qualified", "kit_sent", "question_logged",
  "auto_message", "button_tap", "opt_out", "draft_order",
];

const ORG_EVENT_TYPES = [
  "identity_linked", "identity_review", "identity_disputed", "identity_resolved",
  "identity_reverted", "identity_merged", "org_retired", "owner_assigned",
  "contact_added", "contact_verified", "contact_rejected", "contact_promoted",
  "contact_redacted",
];

// db/migrations/0368 (identity reasons) and 0366 (mirror_exception kinds)
const IDENTITY_REASONS = ["id_unproven", "phone_shared", "chain_branch", "b1_review_tag",
  "b1_active_no_client_key", "customer_not_verified", "chain_rule_hit"];
const EXCEPTION_KINDS = ["cap_exceeded", "stale_refresh", "chain_map_changed", "chain_conflict",
  "b1_fact_mismatch", "reconcile_failed", "order_gone", "customer_unresolved"];

const HEBREW = /[֐-׿]/;
const RAW = /^[a-z_]+$/;

function checkAll(map: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const label = map[key];
    expect(label, key).toBeDefined();
    expect(label, key).toMatch(HEBREW);
    expect(label, key).not.toMatch(RAW);
    expect(label, `${key} carries an em dash`).not.toMatch(/[—–]/);
  }
}

describe("river vocabulary", () => {
  it("labels every lead event type", () => checkAll(RIVER_EVENT_LABELS, LEAD_EVENT_TYPES));
  it("labels every org event type", () => checkAll(RIVER_EVENT_LABELS, ORG_EVENT_TYPES));
  it("never shows a raw type, even one it was not taught", () => {
    expect(riverEventLabel("something_new")).toMatch(HEBREW);
    expect(riverEventLabel("something_new")).not.toContain("something_new");
  });
});

describe("order vocabulary", () => {
  it("labels every class and draft status", () => {
    checkAll(ORDER_CLASS_LABELS, ["completed", "refunded", "cancelled", "draft"]);
    checkAll(DRAFT_STATUS_LABELS, ["OPEN", "INVOICE_SENT", "COMPLETED"]);
  });
});

describe("identity and mirror vocabulary", () => {
  it("explains every identity reason", () => checkAll(IDENTITY_REASONS.reduce((m, k) => ({ ...m, [k]: IDENTITY_REASON_LABELS[k] }), {} as Record<string, string>), IDENTITY_REASONS));
  it("names every mirror exception", () => checkAll(EXCEPTION_LABELS, EXCEPTION_KINDS));
});

describe("contact sources", () => {
  it("names the systems contacts come from, without table names", () => {
    checkAll(CONTACT_SOURCE_LABELS, ["lead", "customer_portal_access", "customer_book", "wa_customer_map", "shopify", "manager"]);
    expect(contactSourceLabel("private_core.something")).not.toContain("private_core");
  });
});
