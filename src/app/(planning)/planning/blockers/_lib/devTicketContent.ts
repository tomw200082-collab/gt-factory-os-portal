// ---------------------------------------------------------------------------
// devTicketContent — payload formatting for FLOW-003 dev escalation.
//
// Pure helper. Takes a BlockerRow (the DTO already on screen) and produces
// a copy-pasteable plain-text payload the planner can send to the dev team.
//
// Tom-approved interim copy (Phase 8 Run C, 2026-05-08): "שלח לצוות הפיתוח
// את ID החסם" — used as descriptive lead in the modal; the payload itself
// includes the structured fields below.
//
// No backend dependency. No external integration. Browser-local only.
// ---------------------------------------------------------------------------

import {
  BLOCKER_LABEL_HE,
  BLOCKER_CATEGORY_HE,
  SEVERITY_LABEL_HE,
} from "./labelMaps";
import type { BlockerRow } from "./types";

// ---------------------------------------------------------------------------
// DEV_TEAM_EMAIL — destination for the optional mailto: action.
//
// Set this to the dev-team alias when one is canonical. Until then, leave
// empty and the modal renders the clipboard-copy action only. The codebase
// has no canonical owner config today; this constant is the single touch
// point Tom edits when an alias is decided.
// ---------------------------------------------------------------------------
export const DEV_TEAM_EMAIL = "";

export const SOURCE_SCREEN = "/planning/blockers";

export interface DevTicketPayload {
  /** Plain-text body, ready for clipboard or mail. */
  body: string;
  /** Subject line for mail. */
  subject: string;
}

function formatField(label: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return `${label}: —`;
  return `${label}: ${value}`;
}

function formatAffectedEntity(row: BlockerRow): string {
  const name = row.display_name ?? "—";
  const kind = row.display_kind;
  const itemRef = row.item_id ?? row.component_id ?? "—";
  return `${name} (${kind}; ref ${itemRef})`;
}

export function buildDevTicketPayload(row: BlockerRow): DevTicketPayload {
  const subtype = BLOCKER_CATEGORY_HE[row.category] ?? row.category;
  const message = BLOCKER_LABEL_HE[row.blocker_label] ?? row.blocker_label;
  const severity = SEVERITY_LABEL_HE[row.severity] ?? row.severity;
  const generatedAt = new Date().toISOString();

  const lines = [
    "כרטיס טיפול — חסם תכנון",
    "",
    formatField("מזהה חסם (exception_id)", row.exception_id),
    formatField("תת-סוג", `${subtype} [${row.category}]`),
    formatField("מפתח תווית (blocker_label)", row.blocker_label),
    formatField("ישות מושפעת", formatAffectedEntity(row)),
    formatField("שיטת אספקה", row.supply_method),
    formatField("הודעה למשתמש", message),
    formatField("ביקוש חסום (יחידות)", row.demand_qty),
    formatField("חוסר ראשון", row.earliest_shortage_at),
    formatField("תקופות מושפעות", row.affected_bucket_count),
    formatField("חומרה", `${severity} [${row.severity}]`),
    formatField("נוצר בזמן (emitted_at)", row.emitted_at),
    formatField("ריצת תכנון (run_id)", row.run_id),
    formatField("מסך מקור", SOURCE_SCREEN),
    formatField("נשלח בזמן", generatedAt),
  ];

  const body = lines.join("\n");
  const subject = `כרטיס טיפול: ${row.blocker_label} — ${row.display_name ?? row.exception_id}`;

  return { body, subject };
}

export function buildMailtoHref(payload: DevTicketPayload): string {
  if (!DEV_TEAM_EMAIL) return "";
  const subject = encodeURIComponent(payload.subject);
  const body = encodeURIComponent(payload.body);
  return `mailto:${DEV_TEAM_EMAIL}?subject=${subject}&body=${body}`;
}
