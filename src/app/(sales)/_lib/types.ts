// Shapes returned by the sales endpoints. These mirror the api_read.v_sales_*
// views (db/migrations/0323) column for column — if a view changes, this file
// changes with it.

export type LeadStatus = "new" | "working" | "won" | "lost";

/** Display order of the Today queue, and the reason a row is in it. */
export type TodayItemType =
  | "conversion"
  | "returning_customer"
  | "new_lead"
  | "due_follow_up";

export type OutcomeResult =
  | "answered_progressing"
  | "no_answer"
  | "whatsapp_sent"
  | "email_sent"
  | "lost";

export type OutreachChannel = "call" | "whatsapp" | "email";

/**
 * The response clock on an untouched lead, in working hours (D-043, 0377): on_time,
 * due_soon (the last quarter of the allowed time), overdue. null once the lead has been
 * touched — that is how the badge disappears. "within" is what a server before 0377
 * sends instead of on_time; it renders no badge, as it always did.
 */
export type SlaState = "on_time" | "due_soon" | "overdue" | "within" | null;

/** D-043: a hot lead (tapped order / hear more, or wrote) gets the shorter target. */
export type SlaClass = "hot" | "normal";

/** D-043 (0377): the working calendar and the two targets, in working hours. Days are 0 = Sunday. */
export interface ResponseTime {
  days: number[];
  start: string;
  end: string;
  hot_hours: number;
  normal_hours: number;
}

/** One owner's last 7 days of first contacts (0377 v_sales_response_week). null owner = unowned. */
export interface ResponseWeekRow {
  assignee: string | null;
  total: number;
  answered_on_time: number;
  answered_late: number;
  not_answered: number;
  /** of not_answered: in the last quarter, and past the deadline */
  not_answered_due_soon: number;
  not_answered_overdue: number;
  /** answered on time over every lead whose outcome is known; null while none is */
  met_pct: number | null;
}

/**
 * The dated snapshot the customer/product tracker wrote for a matched business.
 * Every value arrives as a string, and any key may be absent: this is evidence,
 * not a schema. Render only what is present — never infer a missing number.
 */
export interface ShopifySnapshot {
  status?: string;
  rev12?: string;
  orders?: string;
  days_since_last_order?: string;
  as_of?: string;
  source?: string;
  name?: string;
  customer_key?: string;
}

export interface SalesLeadRow {
  id: string;
  org_id: string;
  org_name: string;
  contact_name: string | null;
  phone_e164: string | null;
  email: string | null;
  source: string;
  campaign_name: string | null;
  ad_name: string | null;
  platform: string | null;
  is_organic: boolean | null;
  status: LeadStatus;
  lost_reason: string | null;
  assignee: string | null;
  next_touch_at: string | null;
  first_touch_at: string | null;
  possible_duplicate_of: string | null;
  converted_order_ref: string | null;
  converted_amount: string | null;
  created_at: string;
  is_existing_customer: boolean;
  shopify_customer_id: string | null;
  shopify_snapshot: ShopifySnapshot | null;
  shopify_snapshot_at: string | null;
  age_days: number;
  sla_deadline_at: string;
  sla_state: SlaState;
  next_touch_overdue: boolean;
  /** Neither phone nor email: real history, but nobody can call it (0326). */
  uncontactable: boolean;
  /** D-042: what the lead line sent automatically, and the suggested quick message. */
  conversation?: LeadConversation | null;
  /** D-043 (0377). Optional: a server before 0377 does not send them. */
  sla_class?: SlaClass | null;
  /** Working minutes to the deadline; negative once past; null once touched. */
  sla_minutes_left?: number | null;
}

export interface TodayRow {
  lead_id: string;
  item_type: TodayItemType;
  org_id: string;
  org_name: string;
  contact_name: string | null;
  phone_e164: string | null;
  email: string | null;
  campaign_name: string | null;
  platform: string | null;
  status: LeadStatus;
  assignee: string | null;
  next_touch_at: string | null;
  first_touch_at: string | null;
  created_at: string;
  is_existing_customer: boolean;
  shopify_snapshot: ShopifySnapshot | null;
  shopify_snapshot_at: string | null;
  converted_order_ref: string | null;
  converted_amount: string | null;
  converted_at: string | null;
  sla_deadline_at: string;
  sla_state: SlaState;
  age_days: number;
  uncontactable: boolean;
  conversation?: LeadConversation | null;
  /** D-043 (0377). Optional: a server before 0377 does not send them. */
  sla_class?: SlaClass | null;
  /** Working minutes to the deadline; negative once past; null once touched. */
  sla_minutes_left?: number | null;
}

// ---- the lead conversation (tranche 203, D-042 / D-044) ----------------------

/** The six situations a rep can send a quick message in, in priority order. */
export type QuickSituation =
  | "returning_customer"
  | "tapped_order_no_order"
  | "asked_more"
  | "no_answer"
  | "menu_no_reply"
  | "no_auto";
export type Situation = "opted_out" | QuickSituation;

/** One automatic message that really left (dry runs and failed sends never appear). */
export interface AutoSent {
  kind: string;
  step: string | null;
  at: string;
  menu: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed: boolean;
}

export interface LeadConversation {
  suggested_situation: Situation;
  opted_out: boolean;
  menu_key: string | null;
  menu_label: string | null;
  auto: AutoSent[];
  /** title: the button as the lead saw it (server, from lead_texts BUTTONS). */
  taps: Array<{ button_id: string; at: string; title?: string | null }>;
}

export interface JourneyButton {
  kind: "reply" | "link";
  id?: string;
  title: string;
}

export type JourneyTrigger =
  | { kind: "first_message"; when: "menu" | "menu_opening" | "no_menu" }
  | { kind: "button"; button_id: string; known_customer?: boolean }
  | { kind: "free_text" }
  | { kind: "stop_text" }
  | { kind: "wake"; step: number; slots: "any" | "morning"; on: "after_conversation" | "follow_up_date"; template: string };

export interface JourneyStep {
  id: string;
  trigger: JourneyTrigger;
  text: string;
  footer: string | null;
  buttons: JourneyButton[];
  effects: string[];
}

export interface WakeRules {
  timezone: string;
  days: string;
  slots: { morning: { from: string; to: string }; afternoon: { from: string; to: string } };
  first_after_hours: number;
  min_hours_between: number;
  quiet_after_staff_hours: number;
  retry_after_hours: number;
  max_messages: number;
}

/** GET /api/sales/journey — the lead line's automatic sequence, read-only (D-044). */
export interface Journey {
  mode: {
    state: "live" | "test" | "off";
    outreach_gate_open: boolean;
    test_phone_count: number;
    phone_number_id_set: boolean;
    send_token_set: boolean;
  };
  steps: JourneyStep[];
  wake_rules: WakeRules;
}

export interface LeadEventRow {
  id: string;
  lead_id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  actor: string;
  created_at: string;
}

export interface WeekStats {
  week_new_leads: number;
  working_now: number;
  week_converted: number;
  /** The triage counts (0326). The three above describe steady state and read
   *  zero for as long as a batch-imported backlog is being cleared. */
  queue_today: number;
  overdue_count: number;
  unassigned_open_count: number;
  never_contacted_count: number;
  uncontactable_count: number;
}

export interface WhatsappTemplates {
  new_lead: string;
  reminder: string;
  returning_customer: string;
}

/** Queue shape — Tom's, not a constant in the code (0326). */
export interface QueueSettings {
  daily_cap: number;
  order: "newest_first" | "oldest_first";
}

/** One person who may be handed leads. Curated, never derived from app_users —
 *  that table carries ~100 test accounts. */
export interface AssigneeEntry {
  email: string;
  name: string;
  active: boolean;
}

export interface SettingChange {
  key: string;
  actor: string;
  at: string;
}

export interface SalesSettings {
  /** Legacy: no view reads it since 0377. Still drives the Today age tone. */
  sla_hours: number;
  /** D-043 (0377). Optional: a server before 0377 does not send it. */
  response_time?: ResponseTime;
  whatsapp_templates: WhatsappTemplates;
  lost_reasons: string[];
  queue: QueueSettings;
  assignees: AssigneeEntry[];
  last_changes: SettingChange[];
  /** D-042 (0376). Optional: an API without them still renders (old templates). */
  whatsapp_quick_messages?: Record<QuickSituation, string>;
  quick_message_changes?: Partial<Record<QuickSituation, { actor: string; at: string }>>;
  /** The signer for THIS session: the person who sends signs the message. */
  quick_message_signer?: string;
}

/** One row of the attention screen (0326). A lead can appear in two buckets —
 *  each section answers a different question. */
export interface AttentionRow {
  lead_id: string;
  org_name: string;
  contact_name: string | null;
  phone_e164: string | null;
  assignee: string | null;
  status: LeadStatus;
  bucket: "overdue" | "unowned" | "stalled";
  days_stuck: number;
  next_touch_at: string | null;
  last_event_at: string | null;
}

/** One row of the cross-lead activity feed (0327). */
export interface ActivityRow {
  event_id: string;
  lead_id: string;
  org_name: string;
  contact_name: string | null;
  event_type: string;
  payload: Record<string, unknown> | null;
  actor: string;
  created_at: string;
}

/** What /api/sales/today returns: the rows plus the shape they were ordered by. */
export interface TodayPayload {
  rows: TodayRow[];
  queue: QueueSettings;
}

export type SalesTaskScope = "mine" | "unassigned" | "all";

export interface SalesTaskRow {
  id: string;
  lead_id: string | null;
  org_id: string | null;
  kind: string;
  title: string;
  due_at: string;
  status: "open" | "done" | "cancelled";
  owner_email: string | null;
  source_kind: string;
  source_id: string;
  source_event_id: string | null;
  reason: string;
  needs_assignment: boolean;
  lead_context: { org_name: string | null; contact_name: string | null; status: string | null } | null;
}

/**
 * The lead a just-recorded "אבוד" can be taken back from, and the date it was
 * carrying before. Owned by the toast that offers the reversal — never by the
 * screen — so a new toast cannot inherit a previous toast's target.
 */
export interface UndoTarget {
  leadId: string;
  previousNextTouch: string | null;
}

// ---- GT Pulse Unit B (gt-factory-os api/src/sales/orgs_handler.ts, main 893b3701) ----
// Copied from the handler's exported shapes. Agorot are integers (₪1 = 100).

/** How far GT trusts the link between an org and a Shopify customer (glossary). */
export type LinkStatus = "verified" | "review" | "disputed" | "retired" | null;
/** Whether order history may be shown now: only while the latest reconcile passed. */
export type HistoryStatus = "ok" | "unverified" | "stale";
export type OrderClass = "completed" | "refunded" | "cancelled" | "draft";

export type OrgFilter = "active" | "prospect" | "all" | "review";
export type OrgSort = "last_order" | "ex_vat_12m" | "name";

export interface OrgListRow {
  id: string;
  name: string;
  link_status: LinkStatus;
  owner_email: string | null;
  last_activity_at: string | null;
  has_open_lead: boolean;
  is_active_customer: boolean | null;
  last_order_at: string | null;
  orders_12m: number | null;
  ex_vat_12m_agorot: number | null;
  chain_name: string | null;
}

export interface OrgsPage {
  rows: OrgListRow[];
  next: string | null;
  total: number;
}

export interface OrgSearchHit {
  id: string;
  name: string;
  phone: string | null;
}

export interface Coverage {
  verified_active: number;
  census_active: number;
  source: "shopifyql";
  as_of: string;
}

/** A customer an identity decision is about. Its numbers are evidence, never a verified fact. */
export interface Candidate {
  customer_gid: string;
  name: string | null;
  order_count: number;
  last_order_at: string | null;
  basis: "held" | "phone";
  /** another live org that already holds this customer: picking it merges into that org (absent from older APIs) */
  held_by?: { org_id: string; name: string } | null;
  evidence: "candidate";
}

export interface OrgCounts {
  orders_12m: number;
  ex_vat_12m_agorot: number;
  clean_orders: number;
  cancelled_orders: number;
  open_drafts: number;
  last_order: { gid: string; name: string | null; created_at: string; line_count: number } | null;
}

export interface OrgDetail {
  header: { id: string; name: string; phone: string | null; owner_email: string | null };
  link_status: LinkStatus;
  chain: { name: string; kind: string; branch_count: number } | null;
  moved: { to: string; on: string } | null;
  counts: OrgCounts | null;
  active: boolean | null;
  coverage_line: Coverage | null;
  history_status: HistoryStatus;
  as_of: string | null;
  identity: { reasons: string[]; candidates: Candidate[] } | null;
  merged_into: { id: string; name: string } | null;
}

export interface OrderRow {
  gid: string;
  name: string | null;
  created_at: string;
  class: OrderClass;
  draft_status: string | null;
  ex_vat_agorot: number | null;
  line_count: number;
}

export interface OrderDetail extends Omit<OrderRow, "line_count"> {
  lines: Array<{ title: string | null; sku: string | null; quantity: number; ex_vat_agorot: number | null }>;
  provenance: { source: "Shopify"; observed_at: string };
}

export interface OrdersPage {
  rows: OrderRow[];
  next: string | null;
  history_status: HistoryStatus;
}

export type RiverChip = "all" | "orders" | "contact" | "cancelled" | "drafts";

export type RiverItem =
  | { kind: "order"; id: string; at: string; order: OrderRow }
  | { kind: "org_event"; id: string; at: string; type: string; actor: string }
  | {
      kind: "lead_event";
      id: string;
      at: string;
      type: string;
      actor: string;
      lead_id: string;
      lead_name: string | null;
      payload: Record<string, unknown>;
    };

export interface PendingDraft {
  gid: string;
  name: string | null;
  draft_status: string;
  created_at: string;
  age_days: number;
}

export interface RiverPage {
  rows: RiverItem[];
  next: string | null;
  counts: { cancelled: number; drafts: number };
  pending_drafts: PendingDraft[];
  history_status: HistoryStatus;
}

export interface ContactRow {
  id: string;
  name: string | null;
  kind: "person" | "org_channel";
  phone: string | null;
  email: string | null;
  verified_by: string | null;
  verified_at: string | null;
  source: { system: string; observed_at: string };
  /** present only on a verified contact */
  tel?: string;
  wa?: string;
  mailto?: string;
}

export interface OrgContacts {
  verified: ContactRow[];
  review: ContactRow[];
}

export interface CircleMonth {
  ym: string;
  completed: number;
  refunded: number;
  cancelled: number;
  /** every draft record, completed ones included: not drawn (design §2 F1) */
  drafts: number;
}

export interface OrgCircle {
  months: CircleMonth[];
  last_order_at: string | null;
  as_of: string | null;
  history_status: HistoryStatus;
}

export interface IdentityOrg {
  org_id: string;
  name: string;
  link_status: LinkStatus;
  reason: string;
  reasons: string[];
  task_id: string;
  task_ids: string[];
  created_at: string;
  candidates: Candidate[];
}

export interface MirrorException {
  id: string;
  kind: string;
  detail: Record<string, unknown>;
  created_at: string;
  run_id: string | null;
}

export interface IdentityReview {
  orgs: IdentityOrg[];
  exceptions: MirrorException[];
  coverage: Coverage | null;
}

export type IdentityAction = "confirm" | "pick" | "reject";

export interface IdentityResult {
  org_id: string;
  action: IdentityAction;
  link_status: LinkStatus;
  customer_gid: string | null;
  merged_into: string | null;
}
