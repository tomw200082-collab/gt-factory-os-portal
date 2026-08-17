// Every user-visible string in the sales workspace.
//
// The surface is Hebrew-first by Tom's authorisation (portal CLAUDE.md, row
// added 2026-08-17). Nothing here is inlined at a call site: one file means one
// place to review the voice, and a missing translation is a compile error
// rather than an English word leaking onto a Hebrew screen.
//
// Schema values (new / working / won / lost) are never translated in data —
// only on the way to the eye.

import type { LeadStatus, OutcomeResult, TodayItemType } from "./types";

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "חדש",
  working: "בטיפול",
  won: "הומר ✓",
  lost: "אבוד",
};

export const TODAY_SECTION_LABELS: Record<TodayItemType, string> = {
  conversion: "הומרו 🎉",
  returning_customer: "לקוח חוזר",
  new_lead: "לידים חדשים",
  due_follow_up: "מעקבים להיום",
};

export const OUTCOME_LABELS: Record<OutcomeResult, string> = {
  answered_progressing: "ענה, מתקדם",
  no_answer: "לא ענה",
  whatsapp_sent: "וואטסאפ נשלח",
  lost: "אבוד",
};

/** Timeline vocabulary. Keys are lead_event.event_type values (0318 + 0322). */
export const EVENT_LABELS: Record<string, string> = {
  created: "ליד נוצר",
  status_change: "שינוי סטטוס",
  note: "הערה",
  assignment: "שיוך",
  next_touch_set: "נקבע מגע הבא",
  alert_sent: "התראה נשלחה",
  converted: "הומר מהזמנה",
  matched_existing_customer: "זוהה כלקוח קיים",
  imported: "יובא",
  outreach: "פנייה יצאה",
  outcome: "תוצאת שיחה",
};

export const CHANNEL_LABELS: Record<string, string> = {
  call: "שיחה",
  whatsapp: "וואטסאפ",
  email: "אימייל",
};

/** The reasons a lead can be marked lost. Free text lands under "אחר". */
export const LOST_REASONS: string[] = [
  "לא רלוונטי",
  "אין תקציב",
  "הלך למתחרה",
  "לא עונה לאורך זמן",
  "אחר",
];

export const NAV_LABELS = {
  today: "היום",
  leads: "לידים",
  orgs: "עסקים",
  settings: "הגדרות",
} as const;

export const TAB_LABELS: Record<LeadStatus, string> = STATUS_LABELS;

/**
 * Everything else the user reads. "WhatsApp" stays Latin on purpose: it is the
 * product's own name, and Hebrew speakers read it that way.
 */
export const UI = {
  appName: "GT מכירות",
  switchToFactory: "מעבר לייצור",

  // Today
  todayTitle: "היום",
  statsLine: (n: number, working: number, converted: number) =>
    `השבוע: ${n} לידים · ${working} בטיפול · ${converted} הומרו`,
  queueDone: "סיימת להיום ✓",
  queueDoneHint: "אין לידים שדורשים טיפול כרגע.",
  queueError: "לא הצלחנו לטעון את התור",
  queueErrorHint: "בדוק את החיבור ונסה שוב.",
  retry: "נסה שוב",
  loading: "טוען…",

  // actions
  call: "התקשר",
  whatsapp: "וואטסאפ",
  email: "אימייל",
  postpone: "דחה",
  noPhone: "אין מספר טלפון לליד הזה",
  markLost: "אבוד",
  addNote: "הוסף הערה",
  save: "שמור",
  cancel: "ביטול",
  close: "סגור",

  // next touch
  nextTouchTitle: "מתי לחזור?",
  tomorrow: "מחר",
  inThreeDays: "עוד 3 ימים",
  inAWeek: "עוד שבוע",
  pickDate: "תאריך",
  nextTouchOn: (date: string) => `מגע הבא: ${date}`,
  noNextTouch: "לא נקבע מגע הבא",

  // outcome sheet
  outcomeTitle: "מה קרה בשיחה?",
  outcomeSaved: "נרשם ✓",
  lostReasonTitle: "למה אבוד?",
  lostReasonOther: "פרט…",
  lostReasonRequired: "צריך לבחור סיבה",

  // leads
  leadsTitle: "לידים",
  search: "חיפוש לפי שם, עסק או טלפון",
  searchEmpty: "לא נמצאו תוצאות",
  colBusiness: "עסק",
  colContact: "איש קשר",
  colPhone: "טלפון",
  colCampaign: "קמפיין",
  colAge: "גיל",
  colNextTouch: "מגע הבא",
  ageDays: (n: number) => (n === 0 ? "היום" : n === 1 ? "אתמול" : `לפני ${n} ימים`),
  duplicateBadge: "כפול?",
  emptyForTab: (tab: string) => `אין לידים בסטטוס ${tab}`,

  // drawer
  timelineTitle: "היסטוריה",
  detailsTitle: "פרטים",
  assigneeLabel: "אחראי",
  assigneePlaceholder: "אימייל",
  notePlaceholder: "מה קרה?",
  statusLabel: "סטטוס",
  wonBanner: (ref: string) => `הומר — הזמנה ${ref}`,
  wonBannerHint: "סטטוס 'הומר' נכתב מהזמנה בשופיפיי, ולא ידנית.",
  lostReasonLabel: "סיבת אובדן",

  // orgs
  orgsTitle: "עסקים",
  orgLeads: (n: number) => `${n} לידים`,
  orgLastActivity: "פעילות אחרונה",
  orgNoActivity: "אין פעילות",
  orgLeadsTitle: "הלידים של העסק",

  // customer context
  customerBadge: "לקוח קיים",
  customerContext: "היסטוריית לקוח",
  snapshotAsOf: (date: string) => `נכון ל-${date}`,
  revenue12m: "הכנסה 12 חודשים",
  orderCount: "הזמנות",
  daysSinceOrder: "ימים מההזמנה האחרונה",
  customerStatus: "סטטוס",

  // quick add
  quickAdd: "+ ליד חדש",
  quickAddTitle: "ליד חדש",
  contactName: "שם איש קשר",
  contactNameRequired: "שם איש קשר הוא שדה חובה",
  phone: "טלפון",
  businessName: "שם העסק",
  sourceNote: "מאיפה הגיע?",
  quickAddSaved: "ליד נוצר ✓",

  // search palette
  commandTitle: "חיפוש",
  commandPlaceholder: "שם, עסק או מספר טלפון",
  commandHintLeads: "לידים",
  commandHintOrgs: "עסקים",

  // settings
  settingsTitle: "הגדרות",
  templatesTitle: "תבניות WhatsApp",
  templatesHint: "אפשר להשתמש ב-{{name}} כדי לשתול את שם איש הקשר.",
  templateNewLead: "ליד חדש",
  templateReminder: "תזכורת",
  templateReturning: "לקוח חוזר",
  slaTitle: "זמן תגובה (SLA)",
  slaHint: "כמה שעות יש לטפל בליד חדש לפני שהוא נצבע באדום.",
  slaHours: "שעות",
  settingsSaved: "נשמר ✓",

  // SLA badge
  slaWithin: "בזמן",
  slaOverdue: "עבר SLA",

  // errors
  genericError: "משהו השתבש",
  saveFailed: "השמירה נכשלה",
} as const;

/** Server rule codes (SALES_*) rendered in Hebrew. */
export const RULE_MESSAGES: Record<string, string> = {
  SALES_LOST_REQUIRES_REASON: "צריך לציין סיבה לאובדן.",
  SALES_WON_IS_EVIDENCE_ONLY: "סטטוס 'הומר' נכתב מהזמנה בשופיפיי, ולא ידנית.",
  SALES_NEXT_TOUCH_REQUIRED: "צריך לקבוע מתי חוזרים לליד.",
  SALES_OPEN_LEAD_WITHOUT_NEXT_TOUCH: "ליד פתוח חייב מגע הבא.",
  SALES_INVALID_CHANNEL: "ערוץ פנייה לא מוכר.",
  SALES_INVALID_OUTCOME: "תוצאה לא מוכרת.",
  SALES_INVALID_STATUS: "סטטוס לא מוכר.",
  SALES_LEAD_NOT_FOUND: "הליד לא נמצא.",
  SALES_NOTE_EMPTY: "ההערה ריקה.",
};
