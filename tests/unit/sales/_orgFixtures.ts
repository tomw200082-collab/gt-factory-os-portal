// Synthetic Unit B payloads for the unit tests. No real customer, phone, email,
// amount or order appears here: names are invented, phones are in the
// +97250000xxxx test block, emails use the .invalid TLD.

import type {
  ContactRow,
  OrgCircle,
  OrgContacts,
  OrgDetail,
  RiverPage,
  SalesLeadRow,
  SalesTaskRow,
} from "@/app/(sales)/_lib/types";

export const ORG_ID = "00000000-0000-4000-8000-0000000000b1";
export const AS_OF = "2026-10-02T07:47:20.000000Z";

export function detail(over: Partial<OrgDetail> = {}): OrgDetail {
  return {
    header: { id: ORG_ID, name: "קפה הדגמה הרצליה", phone: "+972500000101", owner_email: null },
    link_status: "verified",
    chain: null,
    moved: null,
    counts: {
      orders_12m: 14,
      ex_vat_12m_agorot: 1234500,
      clean_orders: 28,
      cancelled_orders: 2,
      open_drafts: 1,
      last_order: { gid: "gid://shopify/Order/9000000001", name: "#9001", created_at: "2026-09-20T08:00:00.000000Z", line_count: 3 },
    },
    active: true,
    coverage_line: null,
    history_status: "ok",
    as_of: AS_OF,
    identity: null,
    merged_into: null,
    ...over,
  };
}

export function contact(over: Partial<ContactRow> = {}): ContactRow {
  return {
    id: "00000000-0000-4000-8000-0000000000c1",
    name: "נועה לדוגמה",
    kind: "person",
    phone: "+972500000102",
    email: "noa@example.invalid",
    verified_by: null,
    verified_at: null,
    source: { system: "lead", observed_at: "2026-09-01T10:00:00.000000Z" },
    ...over,
  };
}

export function verifiedContact(over: Partial<ContactRow> = {}): ContactRow {
  const c = contact({
    id: "00000000-0000-4000-8000-0000000000c2",
    name: "יואב בדיקה",
    phone: "+972500000103",
    email: "yoav@example.invalid",
    verified_by: "manager@synthetic.invalid",
    verified_at: "2026-09-10T10:00:00.000000Z",
    source: { system: "customer_portal_access", observed_at: "2026-09-10T10:00:00.000000Z" },
    ...over,
  });
  return {
    ...c,
    tel: c.phone ? `tel:${c.phone}` : undefined,
    wa: c.phone ? `https://wa.me/${c.phone.replace(/\D/g, "")}` : undefined,
    mailto: c.email ? `mailto:${c.email}` : undefined,
  };
}

export const CONTACTS: OrgContacts = { verified: [verifiedContact()], review: [contact()] };

export function circle(over: Partial<OrgCircle> = {}): OrgCircle {
  const months = Array.from({ length: 24 }, (_, i) => {
    const d = new Date(Date.UTC(2024, 10 + i, 1));
    return {
      ym: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      completed: i % 3 === 0 ? 2 : 1,
      refunded: i === 20 ? 1 : 0,
      cancelled: i === 22 ? 1 : 0,
      drafts: 3,
    };
  });
  return { months, last_order_at: "2026-09-20T08:00:00.000000Z", as_of: AS_OF, history_status: "ok", ...over };
}

export function river(over: Partial<RiverPage> = {}): RiverPage {
  return {
    rows: [
      {
        kind: "order",
        id: "o:gid://shopify/Order/9000000001",
        at: "2026-09-20T08:00:00.000000Z",
        order: { gid: "gid://shopify/Order/9000000001", name: "#9001", created_at: "2026-09-20T08:00:00.000000Z", class: "completed", draft_status: null, ex_vat_agorot: 45600, line_count: 3 },
      },
      { kind: "org_event", id: "e:1", at: "2026-09-02T08:00:00.000000Z", type: "identity_linked", actor: "system:identity" },
      {
        kind: "lead_event", id: "l:1", at: "2026-09-01T08:00:00.000000Z", type: "outreach", actor: "rep@synthetic.invalid",
        lead_id: "00000000-0000-4000-8000-0000000000d1", lead_name: "נועה לדוגמה", payload: { channel: "call" },
      },
    ],
    next: null,
    counts: { cancelled: 2, drafts: 4 },
    pending_drafts: [{ gid: "gid://shopify/DraftOrder/9100000001", name: "#D11", draft_status: "OPEN", created_at: "2026-09-25T08:00:00.000000Z", age_days: 7 }],
    history_status: "ok",
    ...over,
  };
}

export function lead(over: Partial<SalesLeadRow> = {}): SalesLeadRow {
  return {
    id: "00000000-0000-4000-8000-0000000000d1",
    org_id: ORG_ID,
    org_name: "קפה הדגמה הרצליה",
    contact_name: "נועה לדוגמה",
    phone_e164: "+972500000102",
    email: null,
    source: "form",
    campaign_name: null,
    ad_name: null,
    platform: null,
    is_organic: null,
    status: "working",
    lost_reason: null,
    assignee: "rep@synthetic.invalid",
    next_touch_at: "2026-10-05T06:00:00.000Z",
    first_touch_at: "2026-09-01T08:00:00.000Z",
    possible_duplicate_of: null,
    converted_order_ref: null,
    converted_amount: null,
    created_at: "2026-08-30T08:00:00.000Z",
    is_existing_customer: true,
    shopify_customer_id: null,
    shopify_snapshot: null,
    shopify_snapshot_at: null,
    age_days: 33,
    sla_deadline_at: "2026-08-31T08:00:00.000Z",
    sla_state: null,
    next_touch_overdue: false,
    uncontactable: false,
    ...over,
  };
}

export function task(over: Partial<SalesTaskRow> = {}): SalesTaskRow {
  return {
    id: "00000000-0000-4000-8000-0000000000e1",
    lead_id: "00000000-0000-4000-8000-0000000000d1",
    org_id: null,
    kind: "call",
    title: "לחזור לליד",
    due_at: "2026-10-03T06:00:00.000Z",
    status: "open",
    owner_email: "rep@synthetic.invalid",
    source_kind: "activity",
    source_id: "x",
    source_event_id: null,
    reason: "נקבע בעקבות תוצאת קשר",
    needs_assignment: false,
    lead_context: { org_name: "קפה הדגמה הרצליה", contact_name: "נועה לדוגמה", status: "working" },
    ...over,
  };
}
