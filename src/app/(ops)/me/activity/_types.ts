export type SourceKind =
  | "form_submission"
  | "credit_decision"
  | "exception_acknowledge"
  | "exception_resolve";

export interface ActivityRow {
  activity_id: string;
  source_kind: SourceKind;
  action_kind: string;
  event_at: string;
  posted_at: string | null;
  status: string;
  rejection_reason: string | null;
  summary: { headline: string; secondary: string | null };
  raw_payload_present: boolean;
}

export interface ActivityListResponse {
  rows: ActivityRow[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface ActivityCrossLink {
  kind: string;
  label: string;
  target_id: string;
}

export interface ActivityDrawerResponse {
  row: ActivityRow & {
    raw_payload_redacted: unknown;
    cross_links: ActivityCrossLink[];
  };
}
