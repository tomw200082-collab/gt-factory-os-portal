// Every user-visible string in the sales workspace.
//
// The surface is Hebrew-first by Tom's authorisation (portal CLAUDE.md, row
// added 2026-08-17). Nothing here is inlined at a call site: one file means one
// place to review the voice, and a missing translation is a compile error
// rather than an English word leaking onto a Hebrew screen.
//
// Schema values (new / working / won / lost) are never translated in data —
// only on the way to the eye.

import type { LeadStatus, OutcomeResult, OutreachChannel, TodayItemType } from "./types";

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

/** The outcome sheet's question, per channel it was raised by. */
export const OUTCOME_TITLES: Record<OutreachChannel, string> = {
  call: "מה קרה בשיחה?",
  whatsapp: "מה קרה בוואטסאפ?",
  email: "מה קרה במייל?",
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

/**
 * Hebrew agrees the noun with the count, so a bare `${n} לידים` prints
 * "1 לידים" — as wrong to a native reader as "1 leads". Singular gets the
 * word, everything else gets the numeral.
 */
function leads(n: number): string {
  return n === 1 ? "ליד אחד" : `${n} לידים`;
}

/** Same, for the feminine המרה. */
function conversions(n: number): string {
  return n === 1 ? "המרה אחת" : `${n} המרות`;
}

/** Reads as a sentence: "אין לידים " + the word for that tab. */
const EMPTY_TAB_WORDS: Record<LeadStatus, string> = {
  new: "חדשים",
  working: "בטיפול",
  won: "שהומרו",
  lost: "שסומנו כאבודים",
};

export const NAV_LABELS = {
  today: "היום",
  leads: "לידים",
  orgs: "עסקים",
  attention: "מצב",
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
  // "השבוע" governs only the two weekly counts. working_now is how many are
  // open right now, not how many were opened this week — filing it under the
  // same prefix states something untrue about the number.
  statsLine: (n: number, working: number, converted: number) =>
    `השבוע: ${leads(n)} · ${conversions(converted)} · בטיפול כרגע: ${working}`,
  // The triage line. The weekly counts above describe steady state and read
  // zero for as long as a batch-imported backlog is being worked down, which
  // is exactly when someone needs to know the shape of the morning.
  triageLine: (queue: number, overdue: number, unowned: number, never: number) =>
    `בתור היום: ${queue} · באיחור: ${overdue} · ללא בעלים: ${unowned} · טרם נוצר קשר: ${never}`,
  // The same four facts as fields rather than one sentence, because at 390px
  // the sentence wrapped to four lines and swallowed the header.
  triageQueueToday: "בתור היום",
  triageOverdue: "באיחור",
  triageUnowned: "ללא בעלים",
  triageNever: "טרם נוצר קשר",
  // Nothing is hidden — the rest is deferred, and the number says how much.
  dailyCommitment: (shown: number, remaining: number) =>
    `היום: ${shown} שיחות · עוד ${remaining} ממתינות בתור`,
  // Distinct from ageDays below, which reads "לפני N ימים" — a point in the
  // past. This one states the lead's age as a property of the lead, which is
  // what makes an old lead feel old on the card.
  ageInDays: (days: number) => (days === 1 ? "בן יום" : `בן ${days} ימים`),
  uncontactableChip: (n: number) => `ללא פרטי קשר (${n})`,
  sortByAge: "מיין לפי גיל",
  nextTouchPreview: (date: string) => `המגע הבא: ${date}`,
  chooseAnotherDate: "שנה תאריך",
  undo: "בטל",
  undone: "שוחזר",
  discardChanges: "יש שינויים שלא נשמרו — לצאת בכל זאת?",
  saveNote: "שמור הערה",
  saveDate: "קבע תאריך",
  saveAssignee: "שייך",
  workingNeedsDate: "מעבר לטיפול דורש תאריך למגע הבא",
  noOwnerOption: "— ללא בעלים —",
  colOwner: "בעלים",
  ownerNone: "—",
  assignNeedsDate: "שיוך חייב תאריך מגע — ליד בלי תאריך נרקב",
  assignAction: "שייך",
  clearSelection: "נקה",
  bulkBarLabel: "פעולות על לידים שנבחרו",
  // Hebrew agrees the verb with the count: "1 נבחרו" is as wrong as "1 were
  // selected". Every other counted string in this file guards n===1.
  bulkSelected: (n: number) => (n === 1 ? "נבחר 1" : `${n} נבחרו`),
  bulkAssigned: (n: number, name: string) =>
    n === 1 ? `שויך ליד אחד ל${name}` : `שויכו ${n} לידים ל${name}`,
  selectLead: "בחר ליד",
  selectAllOnPage: "בחר את כל הלידים המוצגים",
  // Twenty checkboxes that all announce "בחר ליד" name nothing. The visible
  // label stays the icon; the accessible name carries the business.
  selectLeadNamed: (org: string) => `בחר ליד – ${org}`,
  bulkDateLabel: "תאריך מגע הבא",
  bulkAssignFailed: "השיוך נכשל — הבחירה נשמרה, אפשר לנסות שוב",
  queueScopeGroupLabel: "טווח התור",
  callOrg: (org: string) => `התקשר ל${org}`,
  seeAllWaiting: "לכל הלידים",
  scopeAll: "הכל",
  scopeMine: "שלי",
  queueMine: "התור שלי",
  queueAll: "כל התור",
  chipUnowned: (n: number) => `ללא בעלים (${n})`,
  attentionTitle: "מצב",
  attentionHint: "מה תקוע, מה ללא בעלים, מה השתתק",
  attentionClear: "אין תקועים. ככה זה צריך להיראות.",
  bucketOverdue: (n: number) => `באיחור (${n})`,
  bucketUnowned: (n: number) => `ללא בעלים (${n})`,
  bucketStalled: (n: number) => `תקועים (${n})`,
  daysStuck: (n: number) => (n === 1 ? "יום א׳" : `${n} ימ׳`),
  activityTitle: "פעילות אחרונה",
  activityError: "הפעילות",
  activityEmpty: "אין עדיין פעילות.",
  lostReasonsTitle: "סיבות אבוד",
  lostReasonsHint: "הסיבה האחרונה תמיד פותחת שדה חופשי",
  // The field had the section's title as its accessible name, which named the
  // group rather than the input — and once the section itself was properly
  // labelled, the two collided.
  lostReasonNew: "סיבה חדשה",
  settingsHint: "מה שנקבע כאן חל על כל מי שעובד בתור",
  queueShapeTitle: "צורת התור",
  queueCapLabel: "כמה שיחות ביום",
  queueCapRange: "בין 1 ל־100 שיחות",
  slaRange: "בין 1 ל־168 שעות",
  eventsLoaded: (n: number) => (n === 1 ? "אירוע אחד" : `${n} אירועים`),
  requiredMark: "(חובה)",
  queueOrderNewest: "חדשים קודם",
  queueOrderOldest: "ישנים קודם",
  removeItem: "הסר",
  removeItemNamed: (what: string) => `הסר ${what}`,
  addItem: "הוסף",
  lastChangedBy: (actor: string, when: string) => `שונה על ידי ${actor} · ${when}`,
  peopleTitle: "אנשי מכירות",
  personName: "שם",
  personEmail: "אימייל",
  personActive: "פעיל",
  personActiveNamed: (name: string) => `פעיל – ${name}`,
  addPerson: "הוסף",
  deactivateWarning: (n: number) =>
    n === 1
      ? "יש לו ליד פתוח אחד — שייך אותו קודם"
      : `יש לו ${n} לידים פתוחים — שייך אותם קודם`,
  queueDone: "סיימת להיום ✓",
  queueDoneHint: "אין לידים שדורשים טיפול כרגע.",
  showMore: (n: number) => `הצג עוד ${leads(n)}`,
  showMoreRemaining: (remaining: number) => `נותרו ${remaining}`,
  queueError: "לא הצלחנו לטעון את התור",
  loadError: (what: string) => `לא הצלחנו לטעון את ${what}`,
  loadErrorLeads: "הלידים",
  loadErrorOrgs: "העסקים",
  loadErrorSettings: "ההגדרות",
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
  saved: "נשמר ✓",
  cancel: "ביטול",
  close: "סגור",
  back: "חזרה",
  saving: "שומר…",

  // next touch
  nextTouchTitle: "מתי לחזור?",
  tomorrow: "מחר",
  inThreeDays: "עוד 3 ימים",
  inAWeek: "עוד שבוע",
  pickDate: "תאריך",
  nextTouchOn: (date: string) => `המגע הבא: ${date}`,
  noNextTouch: "לא נקבע מגע הבא",
  // Field values, where the label already names the field.
  notSet: "לא נקבע",
  unassigned: "לא שויך",

  // outcome sheet
  outcomeSaved: "נרשם ✓",
  nextTouchSaved: "נקבע ✓",
  lostReasonTitle: "למה אבוד?",
  lostReasonOther: "פרט…",
  lostReasonOtherLabel: "סיבה אחרת",
  lostReasonGroupLabel: "סיבת אובדן",
  lostReasonRequired: "צריך לבחור סיבה",

  // leads
  leadsTitle: "לידים",
  search: "חיפוש לפי שם, עסק או טלפון",
  // "No results" answers a search. An empty collection is a different fact and
  // needs its own sentence, or a fresh database reads as a failed query.
  searchEmpty: "לא נמצאו תוצאות",
  orgsEmpty: "אין עסקים עדיין",
  colBusiness: "עסק",
  colContact: "איש קשר",
  colPhone: "טלפון",
  colCampaign: "קמפיין",
  colAge: "גיל",
  colNextTouch: "מגע הבא",
  ageDays: (n: number) => (n === 0 ? "היום" : n === 1 ? "אתמול" : `לפני ${n} ימים`),
  duplicateBadge: "כפול?",
  // Degrades to the bare "אין לידים" rather than interpolating undefined: a
  // status this file has not been taught about should read as a shorter true
  // sentence, never as the word "undefined" on a Hebrew screen.
  emptyForTab: (status: LeadStatus) => `אין לידים ${EMPTY_TAB_WORDS[status] ?? ""}`.trimEnd(),

  // drawer
  timelineTitle: "היסטוריה",
  detailsTitle: "פרטים",
  assigneeLabel: "בעלים",
  assigneePlaceholder: "אימייל",
  notePlaceholder: "מה קרה?",
  statusLabel: "סטטוס",
  // The order ref is rendered as a separate node rather than interpolated, so
  // it can sit in a <bdi dir="ltr"> — a Latin/numeric ref inside an RTL
  // paragraph otherwise resolves its leading punctuation to the paragraph
  // direction and renders on the wrong side.
  wonBannerPrefix: "הומר — הזמנה",
  wonBannerHint: "סטטוס 'הומר' נכתב מהזמנה ב-Shopify, ולא ידנית.",
  lostReasonLabel: "סיבת אובדן",

  // orgs
  orgsTitle: "עסקים",
  orgLeads: (n: number) => leads(n),
  orgLastActivity: "פעילות אחרונה",
  orgNoActivity: "אין פעילות",
  orgLeadsTitle: "הלידים של העסק",
  timelineForLead: (name: string) => `היסטוריה של הליד: ${name}`,

  // customer context
  customerBadge: "לקוח קיים",
  customerContext: "היסטוריית לקוח",
  snapshotAsOf: (date: string) => `נכון ל-${date}`,
  revenue12m: "הכנסה ב-12 חודשים",
  orderCount: "הזמנות",
  daysSinceOrder: "ימים מההזמנה האחרונה",
  customerStatus: "סטטוס",

  // quick add
  quickAdd: "ליד חדש",
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
  searchResults: (n: number) => (n === 1 ? "תוצאה אחת" : `${n} תוצאות`),
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
  // slaWithin was deliberately retired in tranche 164: the calm state gets no
  // badge, so the red one means something. Kept out of the object rather than
  // left dangling — an unused string is a future mistake.
  slaOverdue: "עבר זמן",

  // errors
  genericError: "משהו השתבש",
  saveFailed: "השמירה נכשלה — נסה שוב",
  sessionExpired: "החיבור פג — רענן את הדף",
} as const;

/** Server rule codes (SALES_*) rendered in Hebrew. */
export const RULE_MESSAGES: Record<string, string> = {
  AUTH_EXPIRED: UI.sessionExpired,
  SALES_LOST_REQUIRES_REASON: "צריך לציין סיבה לאובדן.",
  SALES_WON_IS_EVIDENCE_ONLY: "סטטוס 'הומר' נכתב מהזמנה ב-Shopify, ולא ידנית.",
  SALES_NEXT_TOUCH_REQUIRED: "צריך לקבוע מתי חוזרים לליד.",
  SALES_OPEN_LEAD_WITHOUT_NEXT_TOUCH: "ליד פתוח חייב מגע הבא.",
  SALES_INVALID_CHANNEL: "ערוץ פנייה לא מוכר.",
  SALES_INVALID_OUTCOME: "תוצאה לא מוכרת.",
  SALES_INVALID_STATUS: "סטטוס לא מוכר.",
  SALES_LEAD_NOT_FOUND: "הליד לא נמצא.",
  SALES_NOTE_EMPTY: "ההערה ריקה.",
};
