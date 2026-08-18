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
  | "lost";

export type OutreachChannel = "call" | "whatsapp" | "email";

/** null once the lead has been touched — that is how the badge disappears. */
export type SlaState = "within" | "overdue" | null;

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
}

export interface LeadEventRow {
  id: string;
  lead_id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  actor: string;
  created_at: string;
}

export interface OrgRow {
  id: string;
  display_name: string;
  phone_e164: string | null;
  email: string | null;
  email_domain: string | null;
  city: string | null;
  shopify_customer_id: string | null;
  is_existing_customer: boolean;
  shopify_snapshot: ShopifySnapshot | null;
  shopify_snapshot_at: string | null;
  created_at: string;
  lead_count: number;
  last_activity_at: string | null;
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
  sla_hours: number;
  whatsapp_templates: WhatsappTemplates;
  lost_reasons: string[];
  queue: QueueSettings;
  assignees: AssigneeEntry[];
  last_changes: SettingChange[];
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
