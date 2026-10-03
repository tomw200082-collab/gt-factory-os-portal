// Every user-visible string in the sales workspace.
//
// The surface is Hebrew-first by Tom's authorisation (portal CLAUDE.md, row
// added 2026-08-17). Nothing here is inlined at a call site: one file means one
// place to review the voice, and a missing translation is a compile error
// rather than an English word leaking onto a Hebrew screen.
//
// Schema values (new / working / won / lost) are never translated in data —
// only on the way to the eye.

import { fmtCount } from "./format";
import type { LeadStatus, OrderClass, OrgFilter, OrgSort, OutcomeResult, OutreachChannel, QuickSituation, RiverChip, TodayItemType } from "./types";

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
  email_sent: "אימייל נשלח",
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
  outcome: "תוצאת קשר",
  // Written by the morning digest (migration 0334). Without a label here the
  // drawer timeline renders the raw token "reminder_sent" on a Hebrew screen —
  // and this is the one event type a rep will see most mornings.
  reminder_sent: "תזכורת נשלחה",
  // 0340 (funnel metrics) and 0360 (the WhatsApp lead journey). Before Unit B
  // these rendered as raw tokens in the lead timeline.
  qualified: "הליד ענה על שאלת המיון",
  kit_sent: "נשלחה ערכת תוכן",
  question_logged: "נרשמה שאלה של הליד",
  auto_message: "נשלחה הודעה אוטומטית",
  button_tap: "הליד לחץ על כפתור בהודעה",
  opt_out: "ביקש לא לקבל הודעות",
  draft_order: "נוצרה טיוטת הזמנה",
};

/**
 * Which matching tier claimed a lead as an existing customer (spec 5.4, and the
 * 0330 backfill that filled the history). The badge says "known customer"; this
 * says on what evidence, because a claim about someone else's revenue has to be
 * answerable on screen.
 */
export const MATCH_TIER_LABELS: Record<string, string> = {
  // Written by the 0330 backfill, which knew which tier it used.
  phone_e164: "לפי טלפון",
  email: "לפי אימייל",
  // Written by sales_core.ingest_lead on the live path. The Shopify lookup
  // searches `email:X OR phone:Y` in one call and takes the hit, so it does not
  // know which of the two matched — and claiming one would be a guess.
  shopify_lookup: "לפי התאמה ב-Shopify",
};

/**
 * Who did it, in Hebrew.
 *
 * `lead_event.actor` is written by whatever wrote the event, so it carries
 * engineering names — `system`, `system:sales-leads-poll`, `system:backfill-0330`.
 * Those are correct in the ledger and wrong on a screen: append-only means the
 * stored value can never be tidied up later, so the translation has to happen
 * here. A human actor is a person's name and passes through untouched.
 */
export const SYSTEM_ACTOR_LABELS: Record<string, string> = {
  system: "מערכת",
  "system:ingest": "מערכת · קליטת ליד",
  "system:sales-leads-poll": "מערכת · סנכרון Shopify",
  "system:backfill-0330": "מערכת · התאמה היסטורית",
};

export function actorLabel(actor: string | null | undefined): string {
  const raw = (actor ?? "").trim();
  if (!raw) return "מערכת";
  const known = SYSTEM_ACTOR_LABELS[raw];
  if (known) return known;
  // A system actor we have no wording for is still a system actor. Bare
  // "system" is already in the map above, so only the prefixed form reaches here.
  return raw.startsWith("system:") ? "מערכת" : raw;
}

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

// ---- GT Pulse Unit B ------------------------------------------------------
// Written under Tom's delegation of 2026-10-02 (Session 2 masterprompt §1):
// normal Unit B microcopy is the executor's call; business words come from the
// glossary (Sales-Machine CONTEXT.md). No em dash in these strings.

/** The list's server-side filters (T9: active customers plus open leads by default). */
export const ORG_FILTER_LABELS: Record<OrgFilter, string> = {
  active: "פעילים",
  prospect: "טרם לקוח",
  all: "הכל",
  review: "בבדיקת זהות",
};

export const ORG_SORT_LABELS: Record<OrgSort, string> = {
  last_order: "הזמנה אחרונה",
  ex_vat_12m: "מחזור 12 חודשים",
  name: "שם",
};

/** One state per business, always in words next to its icon. */
export const ORG_STATE_LABELS = {
  active: "לקוח פעיל",
  inactive: "לקוח לא פעיל",
  prospect: "טרם לקוח",
  review: "בבדיקת זהות",
  disputed: "זהות במחלוקת",
  retired: "רשומה סגורה",
  verifiedNoHistory: "לקוח מאומת",
} as const;

export type OrgStateKey = keyof typeof ORG_STATE_LABELS;

/** org_event types (gt-factory-os 0364): what happened to the business itself. */
const ORG_EVENT_LABELS: Record<string, string> = {
  identity_linked: "העסק קושר ללקוח ב־Shopify",
  identity_review: "זהות העסק הועברה לבדיקה",
  identity_disputed: "זהות העסק במחלוקת",
  identity_resolved: "נרשמה החלטה על זהות העסק",
  identity_reverted: "הקישור ל־Shopify בוטל",
  identity_merged: "בוצע מיזוג של שתי רשומות",
  org_retired: "הרשומה נסגרה",
  owner_assigned: "נקבעו בעלים לעסק",
  contact_added: "נוסף איש קשר",
  contact_verified: "איש קשר אומת",
  contact_rejected: "איש קשר נדחה",
  contact_promoted: "ערוץ של העסק נרשם כאיש קשר",
  contact_redacted: "פרטי איש קשר הוסרו לצורכי פרטיות",
};

/** Every event the business river can carry: the lead's and the business's. */
export const RIVER_EVENT_LABELS: Record<string, string> = { ...EVENT_LABELS, ...ORG_EVENT_LABELS };

/** A type this file was not taught still reads as a sentence, never as a token. */
export function riverEventLabel(type: string): string {
  return RIVER_EVENT_LABELS[type] ?? "עדכון ברשומה";
}

export const ORDER_CLASS_LABELS: Record<OrderClass, string> = {
  completed: "הזמנה",
  refunded: "הזמנה עם החזר",
  cancelled: "הזמנה שבוטלה",
  draft: "טיוטה",
};

/** A Shopify draft's own status. A completed draft is also an order (glossary). */
export const DRAFT_STATUS_LABELS: Record<string, string> = {
  OPEN: "טיוטה פתוחה",
  INVOICE_SENT: "טיוטה, נשלחה חשבונית",
  COMPLETED: "טיוטה שהפכה להזמנה",
};

export const RIVER_CHIP_LABELS: Record<RiverChip, string> = {
  all: "הכל",
  orders: "הזמנות",
  contact: "קשר",
  cancelled: "בוטלו",
  drafts: "טיוטות",
};

export const CONTACT_KIND_LABELS: Record<"person" | "org_channel", string> = {
  person: "איש קשר",
  org_channel: "מספר של העסק",
};

/** Where a contact came from, in the words of the people who use those systems. */
export const CONTACT_SOURCE_LABELS: Record<string, string> = {
  lead: "פנייה של ליד",
  customer_portal_access: "פורטל ההזמנות של הלקוח",
  customer_book: "ספר הלקוחות",
  wa_customer_map: "מיפוי WhatsApp של הצוות",
  wa_session: "שיחת WhatsApp עם הזמנה",
  shopify: "הזמנות ב־Shopify",
  manager: "מנהל המכירות",
};

export function contactSourceLabel(system: string): string {
  return CONTACT_SOURCE_LABELS[system] ?? "מערכת פנימית";
}

/** Why an identity is under review (gt-factory-os 0368), said to a manager in plain words. */
export const IDENTITY_REASON_LABELS: Record<string, string> = {
  id_unproven: "הקישור ל־Shopify לא הוכח בטלפון",
  phone_shared: "הטלפון של העסק מופיע אצל כמה לקוחות ב־Shopify",
  chain_branch: "הטלפון שייך לסניף ברשת עם כמה סניפים",
  b1_review_tag: "הלקוח ב־Shopify מסומן לבדיקה",
  b1_active_no_client_key: "לקוח פעיל ב־Shopify בלי קישור ל־Green Invoice",
  customer_not_verified: "הלקוח שהעסק מחזיק אינו לקוח מאומת",
  chain_rule_hit: "מפת הרשתות מציעה לשייך את העסק לרשת",
};

export function identityReasonLabel(reason: string): string {
  return IDENTITY_REASON_LABELS[reason] ?? "נדרשת בדיקה של זהות העסק";
}

/** mirror_exception kinds (gt-factory-os 0366). */
export const EXCEPTION_LABELS: Record<string, string> = {
  cap_exceeded: "ריענון עצר: יותר מדי שינויים בבת אחת",
  stale_refresh: "הנתונים לא רועננו בזמן",
  chain_map_changed: "מפת הרשתות השתנתה",
  chain_conflict: "לקוח מתאים לשתי רשתות",
  b1_fact_mismatch: "נתוני לקוח לא תואמים",
  reconcile_failed: "ההשוואה מול Shopify נכשלה",
  order_gone: "הזמנה נמחקה ב־Shopify",
  customer_unresolved: "לקוח כבר לא נמצא ב־Shopify",
};

export function exceptionLabel(kind: string): string {
  return EXCEPTION_LABELS[kind] ?? "חריגה בסנכרון";
}

/** Hebrew counts agree with the noun: "עסק אחד", never "1 עסקים". */
function orgsWord(n: number): string {
  return n === 1 ? "עסק אחד" : `${fmtCount(n)} עסקים`;
}

const ORG_UI = {
  orgsCount: (n: number) => orgsWord(n),
  orgsShowing: (shown: number, total: number) =>
    `מוצגים ${fmtCount(shown)} מתוך ${fmtCount(total)}`,
  orgsFilterEmpty: "אין עסקים במסנן הזה",
  orgsShowAll: "הצג את כל העסקים",
  showMoreOrgs: "הצג עוד עסקים",
  orgsSearch: "חיפוש עסק לפי שם או טלפון",
  sortLabel: "מיון",
  filterLabel: "סינון עסקים",
  orgOpenLead: "ליד פתוח",
  orgOwner: (name: string) => `בעלים: ${name}`,
  orgNoOwner: "ללא בעלים",
  orgLastOrder: (when: string) => `הזמנה אחרונה ${when}`,
  orgValue12mSuffix: "ב־12 חודשים",
  exVat: "לפני מע״מ",
  orgsSelect: "בחירה",
  orgsSelectDone: "סיום בחירה",
  selectOrgNamed: (name: string) => `בחר את ${name}`,
  ownerPick: "בעלים חדשים",
  ownerPickPlaceholder: "בחרו איש מכירות",
  ownerAssign: "שייך בעלים",
  ownerAssignNeedsOwner: "בחרו קודם למי לשייך",
  ownerSavingWait: "השיוך נשמר, רגע",
  selectRetiredHint: "רשומה סגורה: אין לה בעלים",
  ownerAssigned: (n: number, name: string) =>
    n === 1 ? `עסק אחד שויך ל${name}` : `${n} עסקים שויכו ל${name}`,
  ownerFailed: "השיוך נכשל. הבחירה נשמרה, אפשר לנסות שוב",
  ownerTooMany: "אפשר לשייך עד 200 עסקים בפעם אחת",
  reviewQueueLink: "בדיקת זהות",

  // the workspace (tranche 190)
  backToOrgs: "חזרה לעסקים",
  orgPageTitle: (name: string) => `${name} · GT CRM`,
  orgLoading: "טוען את העסק…",
  orgForbiddenTitle: "לא ניתן להציג את העסק",
  orgForbiddenHint: "ייתכן שהקישור שגוי, או שהעסק אינו משויך אליך.",
  orgNotFoundTitle: "העסק לא נמצא",
  orgNotFoundHint: "ייתכן שהרשומה לא קיימת, או שהקישור שגוי.",
  orgErrorWhat: "העסק",
  // kind is the chain map's own word (רשת, מפיץ), so the line reads "רשת ארומה · 4 סניפים".
  chainLine: (kind: string, chain: string, branches: number) =>
    branches > 1 ? `${kind} ${chain} · ${branches} סניפים` : `${kind} ${chain}`,
  movedLine: (to: string, on: string) => `עבר ל${to} מ־${on}`,
  ownerLine: (name: string) => `בעלים: ${name}`,
  freshness: (when: string) => `Shopify · נכון ל־${when}`,
  nextActionTitle: "הפעולה הבאה",
  nextActionNone: "אין פעולה פתוחה לעסק",
  nextActionNoneHint: "כשתיקבע משימה או מגע הבא לליד של העסק, הם יופיעו כאן.",
  nextActionOverdue: "באיחור",
  nextActionTouch: (name: string) => `לחזור ל${name}`,
  nextActionTouchWhy: "מגע הבא שהובטח לליד",
  nextActionOpenLead: "פתח את הליד",
  nextActionOpenToday: "פתח בתור היום",
  primaryContactTitle: "איש קשר",
  noVerifiedContact: "אין עדיין איש קשר מאומת",
  awaitingReview: (n: number) => (n === 1 ? "איש קשר אחד ממתין לאימות" : `${n} אנשי קשר ממתינים לאימות`),
  callNamed: (name: string) => `התקשר ל${name}`,
  whatsappNamed: (name: string) => `וואטסאפ ל${name}`,
  emailNamed: (name: string) => `אימייל ל${name}`,
  summaryTitle: "הזמנות",
  lastOrder: "הזמנה אחרונה",
  lastOrderLines: (n: number) => (n === 1 ? "שורה אחת" : `${n} שורות`),
  orders12m: "הזמנות ב־12 חודשים",
  value12m: "מחזור ב־12 חודשים",
  noOrdersYet: "אין עדיין הזמנות",
  openDraftsLine: (n: number) => (n === 1 ? "טיוטה פתוחה אחת ממתינה" : `${n} טיוטות פתוחות ממתינות`),
  daysSince: (n: number) => (n === 0 ? "היום" : n === 1 ? "לפני יום" : `לפני ${n} ימים`),
  asOf: (when: string) => `נכון ל־${when}`,
  sourceOpen: "מקור הנתון",
  sourceTitle: "מקור הנתון",
  sourceSystem: "מקור",
  sourceTime: "נכון ל",
  sourceBasis: "בסיס",
  sourceShopify: "Shopify, ההעתק המאומת של GT",
  sourceBasisMoney: "סכום שורות ההזמנה במחיר הלקוח, לפני מע״מ",
  sourceBasisOrders: "הזמנות נקיות: לא בוטלו, לא טיוטה ולא בדיקה. הזמנה עם החזר נספרת",
  sourcePublication: "היסטוריה מוצגת רק כשההשוואה הלילית מול Shopify עוברת.",
  historyStaleTitle: "הנתונים לא עודכנו בזמן",
  historyStaleHint: (when: string) => `ההשוואה האחרונה מול Shopify עברה ב־${when}. מה שמוצג כאן נכון לאותו רגע.`,
  historyUnavailableTitle: "היסטוריית ההזמנות לא זמינה כרגע",
  historyUnavailableHint: "ההשוואה מול Shopify לא עוברת כרגע, ולכן לא מוצגים הזמנות וסכומים. זה לא אומר שאין הזמנות.",
  identityReviewTitle: "זהות העסק בבדיקה",
  identityReviewHint: "עד שמנהל יחליט על הקישור ל־Shopify לא מוצגים הזמנות וסכומים.",
  identityDisputedTitle: "זהות העסק במחלוקת",
  identityOpenReview: "למסך בדיקת הזהות",
  prospectHint: "לעסק הזה אין עדיין קישור ללקוח ב־Shopify, ולכן אין היסטוריית הזמנות.",
  retiredMerged: (name: string) => `העסק אוחד אל ${name}`,
  retiredGo: (name: string) => `עבור אל ${name}`,
  retiredClosed: "הרשומה הזו סגורה. אין לבצע עליה פעולות.",
  riverTitle: "מה קרה עם העסק",
  riverEmpty: "אין עדיין אירועים לעסק",
  riverChipsLabel: "סינון אירועים",
  riverMore: "הצג עוד אירועים",
  pendingDraftsTitle: "טיוטות פתוחות",
  draftAge: (days: number) => (days === 0 ? "נפתחה היום" : days === 1 ? "פתוחה יום אחד" : `פתוחה ${days} ימים`),
  orderLinesTitle: "שורות ההזמנה",
  orderNoLines: "אין שורות בהזמנה",
  orderQuantity: (n: number) => `× ${n}`,
  orderOpen: (name: string) => `פתח את ${name}`,
  orderNameless: "הזמנה ללא מספר",
  byActor: (who: string) => `על ידי ${who}`,
  forLead: (name: string) => `ליד: ${name}`,
  contactsTitle: "אנשי קשר",
  contactsEmpty: "אין עדיין אנשי קשר לעסק",
  contactsVerifiedTitle: "מאומתים",
  contactsReviewTitle: "ממתינים לאימות",
  contactsReviewHint: "לא מאומת: אין חיוג או הודעה מכאן עד שמנהל יאשר.",
  contactVerifiedByWho: (who: string) => `אומת על ידי ${who}`,
  contactFromWhere: (source: string) => `מקור: ${source}`,
  contactVerifyNamed: (name: string) => `אמת את ${name}`,
  contactRejectNamed: (name: string) => `דחה את ${name}`,
  contactVerify: "אמת",
  contactReject: "דחה",
  contactVerifyTitle: "לאמת את איש הקשר?",
  contactVerifyBody: "אחרי אימות יופיעו כפתורי חיוג, WhatsApp ואימייל לכל מי שעובד עם העסק. אמת רק אחרי שווידאת מול האדם עצמו.",
  contactVerifyConfirm: "כן, אמת",
  contactRejectTitle: "לדחות את איש הקשר?",
  contactRejectBody: "איש הקשר יוסר מהרשימה של העסק. המקור שלו נשמר בהיסטוריה.",
  contactRejectConfirm: "כן, דחה",
  contactDecided: (action: string, name: string) =>
    action === "verify" ? `${name} אומת ✓`
      : action === "reject" ? `${name} נדחה`
      : action === "redact" ? `הפרטים של ${name} הוסרו לצורכי פרטיות`
      : `${name} עודכן ✓`,
  contactUnnamed: "ללא שם",
  leadsTitle: "הלידים של העסק",
  leadsEmpty: "אין לידים לעסק",
  panelUnavailable: (what: string) => `לא הצלחנו לטעון ${what} כרגע. זה לא אומר שאין.`,
  panelWhatNext: "את הפעולה הבאה",
  panelWhatContact: "את אנשי הקשר",
  panelWhatLeads: "את הלידים",
  panelWhatHistory: "את ההזמנות של השנתיים",
  openBusiness: "לעמוד העסק",

  // the business circle and the month sheet (tranche 191)
  circleTitle: "שנתיים של הזמנות",
  circleMonthsGroup: "חודשים, מהישן לחדש",
  circleLegendOrder: "הזמנה",
  circleLegendCancelled: "בוטלה",
  circleLegendDraft: "טיוטה פתוחה",
  circleLegendRings: "בחוץ: 12 החודשים האחרונים. בפנים: 12 שלפניהם. החודש הנוכחי למעלה",
  circleLegendGrid: "מהחודש הנוכחי (במסגרת) אחורה, שנתיים",
  circleMovedTitle: (to: string) => `עבר ל${to}`,
  circleMovedSince: (on: string) => `מ־${on}`,
  circleNoOrders: "אין הזמנות בשנתיים האחרונות",
  circleSource: "מקור: Shopify",
  monthCounts: (orders: number, refunded: number, cancelled: number, open: number) => {
    const parts: string[] = [];
    if (orders === 0 && cancelled === 0 && open === 0) return "אין הזמנות";
    if (orders > 0) parts.push(orders === 1 ? "הזמנה אחת" : `${orders} הזמנות`);
    if (refunded > 0) parts.push(refunded === 1 ? "אחת עם החזר" : `${refunded} עם החזר`);
    if (cancelled > 0) parts.push(cancelled === 1 ? "אחת בוטלה" : `${cancelled} בוטלו`);
    if (open > 0) parts.push(open === 1 ? "טיוטה פתוחה אחת" : `${open} טיוטות פתוחות`);
    return parts.join(", ");
  },
  monthEmpty: "אין הזמנות בחודש הזה",

  // the orders timeline: the same two years on a time axis (Tom, 2026-10-02)
  ordersViewLabel: "תצוגת ההזמנות",
  viewCircle: "עיגול",
  viewTimeline: "ציר זמן",
  timelineChartLabel: "הזמנות לפי חודש בשנתיים האחרונות, מהישן (מימין) לחדש (משמאל)",
  timelineScale: (n: number) => (n === 1 ? "סולם: עד הזמנה אחת בחודש" : `סולם: עד ${n} הזמנות בחודש`),
  timelineZoomLabel: "סולם ההזמנות",
  timelineTotal: "הזמנות בשנתיים",
  timelineTotalOne: "הזמנה בשנתיים",
  timelineTrendWord: (dir: "up" | "down" | "flat", pct: number | null) =>
    dir === "flat" ? "יציב" : `${dir === "up" ? "עלייה" : "ירידה"}${pct === null ? "" : ` של ${pct}%`}`,
  timelineTrendBasis: "3 החודשים המלאים האחרונים מול 3 שלפניהם",
  timelineInProgress: "חודש בתהליך",
  timelineAvgNow: (v: string) => `כעת ${v} בחודש`,
  timelineSteps: "מעבר בין חודשים",
  timelineMonthPrev: "החודש הקודם",
  timelineMonthNext: "החודש הבא",
  timelineZoomAtFit: "כל החודשים כבר בתצוגה",
  timelineZoomAtMax: "זו התצוגה הקרובה ביותר",
  timelineZoomIn: "הגדלת התצוגה",
  timelineZoomOut: "הקטנת התצוגה",
  timelineZoomFit: "התאם לכל החודשים",
  timelineZoomFitShort: "הכול",
  timelineTrend: "מגמה: ממוצע 3 חודשים מלאים,",
  timelinePick: "הקישו על חודש כדי לראות מה היה בו",
  timelineOpenMonth: "פתח את הזמנות החודש",
  timelineAxisHint: "ישן מימין, חדש משמאל",
  monthLoading: "טוען את הזמנות החודש…",

  // the identity review (tranche 191)
  reviewTitle: "בדיקת זהות",
  reviewIntro: "עסקים שהקישור שלהם ל־Shopify מחכה להחלטה של מנהל. עד ההחלטה לא מוצגים להם הזמנות וסכומים.",
  reviewCount: (n: number) => (n === 1 ? "עסק אחד ממתין להחלטה" : `${n} עסקים ממתינים להחלטה`),
  reviewCoverage: (verified: number, census: number) =>
    `${fmtCount(verified)} מתוך ${fmtCount(census)} הלקוחות הפעילים ב־Shopify מאומתים`,
  reviewCoverageSource: "מקור: ספירת הלקוחות של Shopify",
  reviewEmpty: "אין עסקים שממתינים להחלטה ✓",
  reviewForbiddenTitle: "המסך הזה למנהלי מכירות",
  reviewForbiddenHint: "החלטות על זהות של עסקים מתקבלות בידי מנהל.",
  reviewSince: (when: string) => `בבדיקה מ־${when}`,
  candidatesTitle: "מועמדים ב־Shopify",
  candidateEvidence: "ראיה להחלטה, לא נתון מאומת",
  candidateHeld: "הלקוח שהעסק מחזיק היום",
  candidatePhone: "אותו מספר טלפון",
  candidateOrders: (n: number) => (n === 1 ? "הזמנה נקייה אחת" : `${n} הזמנות נקיות`),
  candidateLast: (when: string) => `אחרונה: ${when}`,
  candidateNoOrders: "אין הזמנות נקיות",
  candidateUnnamed: "לקוח ללא שם",
  chooseCandidate: "זה העסק",
  confirmCustomer: "אשר את הלקוח",
  rejectAll: "אף אחד מהם",
  confirmChain: "אשר שיוך לרשת",
  keepAsLead: "לא לקוח, להשאיר כליד",
  keepAsLeadHint: "החשבון ב־Shopify שהעסק מחזיק אינו לקוח מאומת אצלנו. אם העסק עוד לא קונה מאיתנו, השאר אותו כליד.",
  keepAsLeadTitle: (org: string) => `להשאיר את ${org} כליד?`,
  keepAsLeadConsequence: "הקישור לחשבון ב־Shopify יוסר מהעסק. הלידים ואנשי הקשר נשארים. אם יתחיל לקנות, אפשר יהיה לקשר אותו שוב.",
  keepAsLeadConfirm: "כן, להשאיר כליד",
  reviewKeptAsLead: (org: string) => `${org} נשאר ליד`,
  reviewBlocked: "אי אפשר להחליט מכאן: הלקוח שהעסק מחזיק לא נמצא בהעתק שלנו של Shopify. פנה למנהל המערכת.",
  linkTitle: (org: string, customer: string) => `לקשר את ${org} ל${customer}?`,
  linkConsequence: "מרגע זה העסק ייחשב לקוח מאומת, ויוצגו לו ההזמנות והסכומים של הלקוח הזה ב־Shopify.",
  linkMaybeMerge: "אם הלקוח כבר שייך לעסק אחר, הרשומה הזו תיסגר לצמיתות ותאוחד אליו. אי אפשר לבטל את זה.",
  candidateHeldBy: (holder: string) => `כבר שייך לעסק ${holder}`,
  mergeTitle: (org: string, holder: string) => `לאחד את ${org} אל ${holder}?`,
  mergeConsequence: (org: string, holder: string) =>
    `הלקוח הזה כבר שייך לעסק ${holder}. הרשומה של ${org} תיסגר לצמיתות. הלידים שלה יעברו אל ${holder}, וגם אנשי הקשר שעוד אין לו. אי אפשר לבטל את זה.`,
  mergeConfirm: "כן, לאחד",
  mergeTargetUnknown: "העסק הקיים",
  reviewMergedOpen: "לעסק",
  reviewSaving: "שומר את ההחלטה…",
  linkConfirm: "כן, לקשר",
  rejectTitle: (org: string) => `לקבוע שאף מועמד אינו ${org}?`,
  rejectConsequence: "הקישור ל־Shopify יוסר מהעסק, והמועמדים יירשמו כנדחים. לא יוצגו לעסק הזמנות עד שתימצא התאמה.",
  rejectConfirm: "כן, אף אחד מהם",
  chainTitle: (org: string) => `לשייך את ${org} לרשת שמפת הרשתות מציעה?`,
  chainConsequence: "העסק יוצג כסניף ברשת. השיוך נרשם כהחלטה שלך.",
  chainConfirm: "כן, לשייך",
  reviewLinked: (org: string) => `${org} קושר ✓`,
  reviewMerged: (org: string, holder: string) => `${org} אוחד אל ${holder} ✓`,
  reviewRejected: (org: string) => `הקישור של ${org} הוסר`,
  reviewChained: (org: string) => `${org} שויך לרשת ✓`,
  exceptionsTitle: "חריגות בסנכרון",
  exceptionsEmpty: "אין חריגות פתוחות",
  openOrg: (name: string) => `פתח את ${name}`,
} as const;

// ---- the sales report (tranche 202) -------------------------------------------------------------
//
// Ported from the Artifact's template. Counts agree with their noun ("הזמנה אחת", never "1 הזמנות").

const reportNum = new Intl.NumberFormat("he-IL");
const rn = (n: number) => reportNum.format(Math.round(n));
const reportOrders = (n: number) => (n === 1 ? "הזמנה אחת" : `${rn(n)} הזמנות`);

export const REPORT_UI = {
  title: "דוח מכירות",
  exVat: "ללא מע״מ · ללא מבוטלות",
  loading: "טוען את הדוח…",
  loadErrorWhat: "דוח המכירות",
  managerOnly: "דוח המכירות מיועד למנהל המכירות",
  managerOnlyHint: "התור והלידים שלך נמצאים בעמוד היום.",
  managerOnlyLink: "חזרה להיום",
  authExpiredTitle: "ההתחברות פגה",
  authExpiredHint: "יש להיכנס מחדש כדי לראות את הדוח.",
  reload: "טעינה מחדש",
  summaryLabel: "סיכום הדוח",

  // freshness
  updatedNow: (clock: string) => `עודכן עכשיו · ${clock}`,
  updatedAgo: (minutes: number, clock: string) => `עודכן לפני ${rn(minutes)} דק׳ · ${clock}`,
  updatedUnknown: "מועד העדכון לא ידוע",
  staleBandPrefix: "מוצגת הגרסה המאומתת האחרונה · נתונים עד",
  staleBandNoTime: "מוצגת הגרסה המאומתת האחרונה",
  staleFailedGate: "העדכון האחרון לא עבר בדיקת התאמה מול Shopify",
  staleFailed: "העדכון האחרון נכשל",
  staleDelayed: "העדכון מתעכב",
  staleRunning: "העדכון מתבצע עכשיו",
  refreshFailed: (clock: string) => `הרענון האחרון נכשל · מוצגים נתונים מ־${clock}`,
  recheck: "בדוק שוב",
  clearSearch: "נקה חיפוש",
  checkedAt: (time: string) => `נבדק לאחרונה ב־${time}`,
  rechecking: "בודק…",
  refreshAuto: "הדף בודק שוב מעצמו כל 5 דקות",
  historicSku: (month: string, amount: string) => `ב${month} ${amount} ממכירות מוצרים שאינם במחירון (מסווגים לפי שם המוצר)`,
  toTop: "חזרה למעלה",

  // states
  neverTitle: "הדוח עוד לא נבנה",
  neverHint: "כשהבנייה הראשונה תסתיים הדוח יופיע כאן. זה לא אומר שאין מכירות.",
  neverFailedGate: "הבנייה האחרונה לא עברה בדיקת התאמה מול Shopify",
  neverFailed: "הבנייה האחרונה נכשלה",
  neverRunning: "הבנייה הראשונה מתבצעת עכשיו",
  invalidTitle: "הדוח הגיע במבנה שלא ניתן לקרוא",
  invalidHint: "לא מציגים מספרים שאי אפשר לסמוך עליהם. נסה שוב בעוד רגע.",
  invalidEscalate: "אם זה חוזר, פנה למנהל המערכת.",

  // tabs and controls
  tabsLabel: "לשוניות הדוח",
  tabs: { daily: "יומי", cust: "לקוחות", prod: "מוצרים", chain: "רשתות", trend: "מגמה" },
  periodLabel: "תקופה",
  period12: "12ח׳",
  period12Hint: "12 החודשים המלאים האחרונים, בלי החודש החלקי",
  periodAll: "הכול",
  unitLabel: "יחידת מדידה",
  unitRev: "₪",
  unitUnits: "יחידות",
  rangeLabel: "טווח הגרף",
  ranges: { 30: "30 יום", 90: "90 יום", 365: "שנה" } as Record<number, string>,
  viewLabel: "תצוגה",
  viewSummary: "סיכום",
  viewMonths: "לפי חודש",
  searchCust: "חיפוש לקוח או רשת…",
  searchProd: "חיפוש משפחה, מק״ט או שם מוצר…",
  searchChain: "חיפוש רשת, סניף או מוצר…",
  searchClear: "ניקוי החיפוש",
  heat: "צביעה",
  heatHint: "ירוק ▲ = חודש מעל הממוצע של השורה · אדום ▼ = מתחת",
  heatAbove: "מעל ממוצע השורה",
  heatBelow: "מתחת לממוצע השורה",
  copyCsv: "העתקת CSV",
  copied: "הטבלה הועתקה",
  copyFailed: "ההעתקה נכשלה",
  unitShort: "יח׳",
  sortedBy: (col: string, asc: boolean) => `ממוין לפי ${col} · ${asc ? "עולה" : "יורד"}`,
  tableCaption: (name: string) => `${name}, לפי חודש`,
  partialKey: (label: string, pulledShort: string) => `${label} חלקי (עד ${pulledShort})`,
  summaryIncludesPartial: (month: string, pulledShort: string) => `כולל ${month} חלקי (עד ${pulledShort})`,

  // summaries
  orders: reportOrders,
  customers: (n: number) => (n === 1 ? "לקוח אחד" : `${rn(n)} לקוחות`),
  rowsWord: (n: number) => (n === 1 ? "שורה אחת" : `${rn(n)} שורות`),
  chainsWord: (n: number) => (n === 1 ? "רשת אחת" : `${rn(n)} רשתות`),
  branchesWord: (n: number) => (n === 1 ? "סניף אחד" : `${rn(n)} סניפים`),
  sumRev: (money: string, orders: string, customers: string) => `סה״כ ${money} · ${orders} · ${customers}`,
  sumUnits: (units: string, orders: string, customers: string) => `סה״כ ${units} יח׳ · ${orders} · ${customers}`,
  sumFilteredRev: (money: string, rows: string) => `סה״כ מסונן ${money} · ${rows}`,
  sumFilteredUnits: (units: string, rows: string) => `סה״כ מסונן ${units} יח׳ · ${rows}`,
  sumChains: (money: string, chains: string, branches: string) => `רשתות ${money} · ${chains} · ${branches}`,
  sumChainsDormant: (n: number) => `${rn(n)} ישנים`,
  sumChainsFiltered: (money: string, chains: string) => `מסונן ${money} · ${chains}`,
  emptySearch: "אין שורות שמתאימות לחיפוש",
  emptyChainSearch: "אין רשת שמתאימה לחיפוש",
  emptyPeriod: "אין נתוני מכירות בתקופה שנבחרה",
  noName: "(ללא שם)",
  noChain: "ללא רשת",

  // grid
  colCust: "לקוח",
  colProd: "משפחת מוצר",
  colTotal: "סה״כ",
  colShare: "%",
  colYoy: "מול אשתקד",
  colTrend: "מגמה",
  yoyNew: "חדש",
  totalRow: "סה״כ",
  totalRowCapped: (cap: number, n: number) => `סה״כ (${rn(cap)}/${rn(n)} שורות)`,
  sortBy: (col: string) => `מיון לפי ${col}`,
  openRow: (name: string) => `הצג את הפירוט של ${name}`,
  closeRow: (name: string) => `הסתר את הפירוט של ${name}`,
  partialMark: "*",
  partialNote: (label: string) => `* ${label} חלקי`,

  // chains
  chainsKpiTurnover: "מחזור הרשתות",
  chainsKpiTurnoverUnits: "יחידות ברשתות",
  chainsKpiDormantRevUnits: "יחידות בסניפים הישנים",
  chainsKpiShare: (pct: number) => `${rn(pct)}% מכלל המכירות`,
  chainsKpiChains: "רשתות",
  chainsKpiBranches: (n: number) => `${rn(n)} סניפים`,
  chainsKpiDormant: "סניפים ישנים",
  chainsKpiDormantSub: (days: number) => `ללא הזמנה מעל ${rn(days)} יום`,
  chainsKpiDormantRev: "₪ בסניפים הישנים",
  chainsKpiDormantRevSub: "בחלון הנבחר",
  chainsKpiQuiet: "הרשת השקטה הגדולה",
  chainsKpiQuietSub: (n: number) => `כל ${rn(n)} הסניפים שקטים`,
  chainsKpiQuietNone: "אין רשת שכולה שקטה",
  chainsColName: "רשת · סניף · מוצר",
  chainsColMeta: "סגמנט · הזמנה אחרונה · משפחה",
  chainsTotalRow: "סה״כ רשתות",
  badgeOneBranch: "סניף אחד",
  badgeBranches: (n: number) => `${rn(n)} סניפים`,
  badgeOneDormant: "אחד ישן",
  badgeDormant: (n: number) => `${rn(n)} ישנים`,
  badgeDistributor: "מפיץ",
  badgeGroup: (g: string) => `קבוצת ${g}`,
  badgeMoved: (to: string, on: string) => `עברה ל${to} · ${on}`,
  badgeQuiet: (days: number) => (days === 1 ? "שקט יום אחד" : `שקט ${rn(days)} יום`),
  branchLast: "הזמנה אחרונה",
  badgeMerged: (n: number) => `${rn(n)} רשומות · החלפת מפעיל`,
  chainsToggle: (name: string, open: boolean) => `${open ? "הסתר" : "הצג"} את הסניפים של ${name}`,
  branchToggle: (name: string, open: boolean) => `${open ? "הסתר" : "הצג"} את המוצרים של ${name}`,

  // trend
  trendTile12: "12 חודשים מלאים אחרונים",
  trendTile12Delta: (pct: string) => `${pct} מול 12ח׳ קודמים`,
  trendTileLast: (month: string) => `${month} (מלא אחרון)`,
  trendTileLastDelta: (pct: string) => `${pct} מול אשתקד`,
  trendTileRate: "קצב שנתי",
  trendTileRateSub: "ממוצע 3 חודשים מלאים × 12",
  trendTilePartial: (month: string, pulledShort: string) => `${month} עד ${pulledShort}`,
  trendTilePartialSub: "חודש חלקי",
  chartMonthlyTitle: (n: number) => `מחזור חודשי · ${rn(n)} חודשים`,
  chartMonthlyTitleUnits: (n: number) => `יחידות לחודש · ${rn(n)} חודשים`,
  chartMonthlyAria: "מחזור לפי חודש עם השוואה לשנה קודמת",
  chartMonthlyUnits: "יחידות לחודש",
  chartMonthlyRev: "מחזור חודשי",
  chartPriorYear: "שנה קודמת",
  chartPartialNote: (label: string) => `* ${label} חלקי · מקווקו`,
  chartPeak: (label: string) => `שיא ${label}`,
  chartYoyTitle: "צמיחה מול אותו חודש אשתקד",
  chartYoyHint: "ירוק = גבוה משנה שעברה · אדום = נמוך · החודש החלקי שקוף",
  chartYoyAria: "אחוז שינוי שנתי לכל חודש",
  chartTapHint: "הקש על הגרף כדי לראות את הערכים של כל חודש או יום",
  chartKeys: "חצים לבחירת נקודה, Escape לסגירה",
  chartMonthTip: (label: string, partial: boolean) => `${label}${partial ? " · חלקי" : ""}`,
  matrixTitle: "שנים × חודשים",
  matrixYear: "שנה",
  matrixTotal: "סה״כ",
  matrixGrowth: "צמיחה",
  matrixNote: (pulled: string) =>
    `החודש האחרון חלקי (עד ${pulled}) · ללא הזמנות מבוטלות · ללא מע״מ · עמודת ״צמיחה״ משווה חודשים חופפים מלאים בלבד.`,

  // daily
  dailyTileYest: (dow: string, date: string) => `יום העסקים האחרון · ${dow} ${date}`,
  dailyTileToday: (time: string) => `היום עד ${time}`,
  dailyTileWeek: "ממוצע 7 ימים מלאים",
  vsUsual: "מול רגיל",
  vsSameHour: "מול אותה שעה",
  vsPrevWeek: "מול 7 הימים הקודמים",
  vsPrevMonth: "מול החודש שעבר",
  dailyTileMonth: "החודש עד היום",
  dailyOrdersSub: reportOrders,
  dailyOrdersPartialSub: (n: number) => `${reportOrders(n)} · חלקי`,
  paceTitle: "הקצב והצפי",
  paceTodaySame: (time: string, dow: string) => `עד ${time} בארבעת ימי ${dow} שקדמו`,
  paceYestUsual: (dow: string) => `חציון ארבעת ימי ${dow} שקדמו`,
  pacePrevWeek: "7 הימים הקודמים, ליום",
  paceSameDays: (n: number) => (n === 1 ? "אותו יום בחודש שעבר" : `אותם ${rn(n)} ימים בחודש שעבר`),
  paceForecast: "צפי לסוף החודש",
  paceExplain: (left: number) =>
    left === 0
      ? "החודש עד היום, כולל היום עד השעה שבכותרת. לא נותרו ימים. הטלה, לא תחזית."
      : `החודש עד היום, כולל היום עד השעה שבכותרת, ועוד ${left === 1 ? "יום אחד שנותר" : `${rn(left)} הימים שנותרו`} לפי חציון היום בשבוע של כל אחד. הטלה, לא תחזית.`,
  chartDailyTitle: "מחזור יומי",
  chartDailyAria: "מחזור לכל יום עם ממוצע נע של שבעה ימים",
  chartDailyLegendBar: "מחזור יומי",
  chartDailyLegendMa: "ממוצע נע 7 ימים",
  chartDailyLegendOff: "שישי־שבת",
  chartDailyLegendToday: "היום (חלקי)",
  chartDailyClipped: "העמודה קוצרה כדי שהימים הרגילים יישארו קריאים",
  chartDailyTip: (money: string, orders: string) => `${money} · ${orders}`,
  chartDailyTipSub: (dow: string, date: string, partial: boolean, ma: string) =>
    `יום ${dow} ${date}${partial ? " · חלקי" : ""} · ממוצע נע ${ma}`,
  weekdayTitle: "הקצב השבועי · חציון ליום בשבוע",
  weekdayHint: "13 שבועות אחרונים · חציון ולא ממוצע — הזמנת ענק אחת אינה מזיזה את הקו. הימים החזקים הם ימי החלוקה.",
  weekdayRow: (dow: string) => `יום ${dow}`,
  weekdayDays: (n: number) => (n === 1 ? "יום אחד" : `${rn(n)} ימים`),
  retroTitle: "רטרו · 14 הימים האחרונים",
  retroDate: "תאריך",
  retroDay: "יום",
  retroRev: "מחזור",
  retroOrders: "הזמנות",
  retroAvg: "ממוצע להזמנה",
  retroVs: "מול רגיל",
  retroTop: "הלקוח הגדול של היום",
  retroPartial: "חלקי",
  retroAvgShort: "ממוצע להזמנה",
  retroTopShort: "לקוח גדול",
  retroNote: (time: string) =>
    `״מול רגיל״ = מול חציון ארבעת אותם ימים בשבוע שקדמו, כך שיום ראשון נמדד מול ימי ראשון ולא מול שבת. ` +
    `שורת היום חלקית (עד ${time}) ולכן אין לה השוואה כאן; הכרטיס ״היום עד ${time}״ משווה אותה לאותה שעה בארבעת הימים שקדמו. ללא מבוטלות · ללא מע״מ.`,

  // calendar
  monthsShort: ["ינו", "פבר", "מרץ", "אפר", "מאי", "יוני", "יולי", "אוג", "ספט", "אוק", "נוב", "דצמ"],
  monthsFull: ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"],
  weekdays: ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"],
} as const;

export const NAV_LABELS = {
  today: "היום",
  leads: "לידים",
  orgs: "עסקים",
  attention: "מצב",
  /** the phone bar's label: five destinations leave room for one short word */
  report: "דוח",
  /** the desktop rail and the page title */
  reportFull: "דוח מכירות",
  settings: "הגדרות",
  /** D-045: Tom only — the entry is shown only for his session, the server guards the page */
  control: "חדר בקרה",
} as const;

/**
 * Everything else the user reads. "WhatsApp" stays Latin on purpose: it is the
 * product's own name, and Hebrew speakers read it that way.
 */
export const UI = {
  ...ORG_UI,
  appName: "GT CRM",
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
  // "Why these?" has to be answerable from the screen. The count above says
  // what is owed today; this says the rule that produced it.
  //
  // It used to read "…לכל התור" — a daily quota for the WHOLE queue. That was
  // true while new leads and follow-ups shared one budget, and tranche 173 made
  // it false: the quota now governs untouched new leads alone, and a callback
  // you already promised passes it untouched. Leaving the old wording would
  // have been a sentence on screen that overstates what it caps, which is the
  // one thing this workspace is not allowed to do. So the string names what it
  // actually governs, and names what it does not.
  dailyCapRule: (cap: number) =>
    `מתוך מכסה יומית של ${cap} לידים חדשים · מעקבים שהתחייבת אליהם אינם נספרים`,
  // Distinct from ageDays below, which reads "לפני N ימים" — a point in the
  // past. This one states the lead's age as a property of the lead, which is
  // what makes an old lead feel old on the card.
  ageInDays: (days: number) => (days <= 0 ? "חדש מהיום" : days === 1 ? "בן יום" : `בן ${days} ימים`),
  uncontactableChip: (n: number) => `ללא פרטי קשר (${n})`,
  sortByAge: "מיין לפי גיל",
  nextTouchPreview: (date: string) => `המגע הבא: ${date}`,
  chooseAnotherDate: "שנה תאריך",
  // A close is proven by a Green Invoice document number (Tom 2026-08-24).
  // Free text is rejected — "סגרנו עם דני" is not evidence, and `won` has been
  // evidence-only since 0322.
  wonTitle: "סגירת עסקה",
  wonEvidenceLabel: "מספר מסמך ב-Green Invoice",
  wonEvidenceHint: "סגירה נרשמת רק מול מספר מסמך. המספר נשמר כאסמכתה.",
  wonEvidenceRequired: "צריך מספר מסמך כדי לסגור",
  wonSaved: "נסגר ✓",
  // convert_lead returns false — not an error — when the lead is no longer
  // open. Announcing "נסגר ✓" for that is the workspace telling the user a
  // thing happened that did not, which is exactly the race a second person on
  // the queue creates: one rep marks אבוד while the other is closing the deal.
  wonNotOpen: "הליד כבר נסגר או סומן אבוד בינתיים — רענן ובדוק לפני שתנסה שוב",
  // The date step is a disclosure under an outcome that has already been
  // chosen, so it states which one it is about. It used to be reachable from a
  // bare "שנה תאריך" with nothing declared, and then wrote answered_progressing
  // whichever date was tapped — "לא ענה, but call back Thursday" was recorded
  // as a conversation that went well.
  dateForOutcome: (outcome: string) => `התוצאה שתירשם: ${outcome}`,
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
  queueUnassigned: "ללא שיוך",
  scopeUnassigned: "ללא שיוך",
  tasksTitle: "משימות",
  taskWhy: "למה עכשיו",
  taskSource: "מקור",
  taskComplete: "השלם משימה",
  taskDone: "המשימה הושלמה",
  taskNote: "מה בוצע?",
  taskContactGap: "בירור פרטי קשר",
  taskContactSource: "איך אומתו הפרטים?",
  taskContactSave: "שמור פרטי קשר",
  taskOpenLead: "פתח את הליד",
  settingsManagerOnly: "הגדרות אלה מנוהלות בידי מנהל המכירות",
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
  eventsLoaded: (n: number) => (n === 1 ? "אירוע אחד" : `${n} אירועים`),
  requiredMark: "(חובה)",
  queueOrderNewest: "חדשים קודם",
  queueOrderOldest: "ישנים קודם",
  removeItem: "הסר",
  removeItemNamed: (what: string) => `הסר ${what}`,
  addItem: "הוסף",
  lastChangedBy: (actor: string, when: string) => `שונה על ידי ${actor} · ${when}`,
  peopleTitle: "אנשי מכירות",
  // The roster is derived from the system's users, not edited here (D6). The
  // sentence says so plainly, because a list you cannot change and that does
  // not explain why reads as broken.
  peopleDerived: "הרשימה נגזרת ממשתמשי המערכת שיש להם הרשאת מכירות. הוספה והשבתה נעשות במסך המשתמשים.",
  peopleRegistryLink: "מסך המשתמשים",
  peopleEmpty: "אין עדיין אנשי מכירות פעילים.",
  personOpenLeads: (n: number) =>
    n === 1 ? "ליד פתוח אחד" : `${n} לידים פתוחים`,
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
  activityNoteLabel: "מה קרה?",
  activityActionLabel: "מה הפעולה הבאה?",
  activityDateLabel: "מתי לבצע?",
  activityWaitReview: "ממתין ללקוח — בדיקה",
  activityOther: "פעולה אחרת",
  activityChooseAction: "בחר פעולה",
  // Tom approved this exact string 2026-10-01 (UX gate B-FLOW-04).
  activitySaveNeeds: "כדי לשמור צריך: מה קרה (5 תווים לפחות), מה הפעולה הבאה ומתי לבצע.",
  railTitle: "מסלול הליד",
  railCreated: "פנייה נקלטה",
  railOutreach: "ניסיון קשר תועד",
  railAnswered: "קשר דו־כיווני תועד",
  railNextAction: "פעולה הבאה נקבעה",
  railConverted: "המרה אומתה",
  railSource: "הצג מקור",
  // Tom 2026-10-01 (tranche 187): the flow is the whole visible pipeline, the
  // triage counts are the team's, and a note save confirms itself.
  flowScope: "כל הלידים",
  noteSaved: "נשמר ✓",
  teamCounts: "כל הצוות",
  // Tom 2026-10-01 ("מאשר הכל", tranche 188).
  noteNeeded: "כתבו הערה כדי לשמור",
  customerStatusActive: "פעיל",
  customerStatusDisabled: "לא פעיל",
  navMain: "ניווט ראשי",
  navBar: "סרגל ניווט",
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
  commandSearching: "מחפש עסקים…",
  commandSearchFailed: "החיפוש בעסקים לא הצליח כרגע. נסו שוב בעוד רגע.",
  searchResults: (n: number) => (n === 1 ? "תוצאה אחת" : `${n} תוצאות`),
  searchMinHint: "עוד אות אחת, והחיפוש יתחיל",
  commandHintLeads: "לידים",
  commandHintOrgs: "עסקים",

  // the lead conversation (tranche 203, D-042 / D-044)
  waOptedOut: "הליד ביקש לא לקבל הודעות («הסר»)",
  waOther: "הודעה אחרת",
  waPickTitle: "איזו הודעה לפתוח?",
  autoSentPrefix: "נשלח אוטומטית:",
  autoRead: (t: string) => `נקרא ${t}`,
  autoDelivered: (t: string) => `נמסר ${t}`,
  autoFailed: "לא נמסר",
  autoTapped: (title: string) => `לחץ «${title}»`,
  autoShowAll: "כל ההודעות",
  autoHide: "הסתר",
  autoListTitle: "מה הקו שלח אוטומטית",
  quickTitle: "הודעות מהירות",
  quickHint: "ההודעה שנפתחת בוואטסאפ לפי המצב של הליד. היא נחתמת בשם מי ששולח.",
  quickVariables: "משתנים:",
  quickPreview: "תצוגה מקדימה, על ליד לדוגמה",
  quickSave: "שמירה",
  quickSaved: "נשמר ✓",
  quickUnsaved: "לא נשמר",
  quickEmpty: "ההודעה ריקה.",
  quickTooLong: "עד 1000 תווים.",
  quickCount: (n: number) => `${n}/1000`,
  quickChangedBy: (actor: string, when: string) => `שונה ע״י ${actor} ${when}`,
  journeyTitle: "שיחה עם ליד",
  journeyHint: "מה הקו האוטומטי שולח לליד, ומתי. לקריאה בלבד.",
  journeyChangeVia: "שינוי בנוסח עובר דרך תום: קודם בפלייבוק, ואז באישור של מטא.",
  journeyModeLive: "פעיל: ההודעות יוצאות לכל הלידים.",
  journeyModeTest: (n: number) =>
    n === 0
      ? "מצב בדיקה: שום הודעה לא יוצאת ללידים."
      : n === 1
        ? "מצב בדיקה: ההודעות יוצאות רק לטלפון בדיקה אחד."
        : `מצב בדיקה: ההודעות יוצאות רק ל-${n} טלפוני בדיקה.`,
  journeyModeOff: "כבוי: הקו האוטומטי לא מחובר, ושום הודעה לא יוצאת.",
  journeyWhenFirst: (when: "menu" | "menu_opening" | "no_menu") =>
    when === "menu"
      ? "בהודעה הראשונה, כשהליד ביקש תפריט"
      : when === "menu_opening"
        ? "בהודעה הראשונה, כשהליד ביקש את תפריט הפתיחה"
        : "בהודעה הראשונה, כשאין תפריט מזוהה",
  journeyWhenTap: (title: string) => `כשהליד לוחץ «${title}»`,
  journeyWhenTapCustomer: (title: string) => `כשלקוח קיים לוחץ «${title}»`,
  journeyWhenFreeText: "כשהליד כותב שוב טקסט חופשי (פעם ביום לכל היותר)",
  journeyWhenStop: "כשהליד כותב «הסר»",
  journeyWhenWake1: (hours: number) => `הודעת המשך 1: ${hours} שעות אחרי שיחה שנרשמה, עד יום המעקב הבא`,
  journeyWhenWakeN: (step: number) => `הודעת המשך ${step}: בבוקר של יום המעקב שנקבע`,
  journeySlotsAt: "בשעות",
  journeySlotsDays: "ראשון עד חמישי, לא בחגים",
  journeyRules: (between: number, quiet: number, max: number) =>
    `לפחות ${between} שעות בין הודעות, לא אם מישהו מהצוות כתב בוואטסאפ ב-${quiet} השעות האחרונות, ${max} הודעות המשך לכל היותר. נעצר כשהליד עונה, מזמין או מבקש להסיר.`,
  journeyEffectLost: "הליד נסגר כאבוד («לא כרגע») ומוסר מהעדכונים",
  journeyEffectOptOut: "הטלפון מוסר מכל ההודעות האוטומטיות",
  journeyEffectAlert: "הבעלים של הליד מקבל התראה",
  journeyFooter: "שורה תחתונה:",
  journeyButtons: "כפתורים:",
  journeyLoadError: "לא הצלחנו לטעון את ההודעות האוטומטיות.",
  journeyGroupFirst: "ההודעה הראשונה",
  journeyGroupTap: "אחרי לחיצה על כפתור",
  journeyGroupOther: "תשובות נוספות",
  journeyGroupWake: "הודעות המשך",

  // settings
  settingsTitle: "הגדרות",
  templatesTitle: "תבניות WhatsApp",
  templatesHint: "אפשר להשתמש ב-{{name}} כדי לשתול את שם איש הקשר.",
  templateNewLead: "ליד חדש",
  templateReminder: "תזכורת",
  templateReturning: "לקוח חוזר",
  settingsSaved: "נשמר ✓",

  // Response time (D-043, tranche 204). A pill only when it asks for action — about to pass,
  // or past it. On time is a quiet line of text: a pill on every fresh card is a pill on
  // nothing (tranche 164, audit P1-3). The time left sits in the card's meta line, so the
  // pill stays one or two words and the business name and phone never truncate.
  slaDueSoon: "עומד לעבור",
  slaOverdue: "עבר הזמן",
  /** Working time left: minutes under an hour; hours in words up to two and a half. */
  workLeft: (amount: string) => `עוד ${amount} עבודה`,
  workMinutes: (m: number) => (m === 1 ? "דקת" : `${m} דקות`),
  // From 3 hours up, whole hours only (rounded down): "5 שעות", never "5.5 שעות".
  workHours: (h: number) =>
    h === 1 ? "שעה" : h === 1.5 ? "שעה וחצי" : h === 2 ? "שעתיים" : h === 2.5 ? "שעתיים וחצי"
      : h >= 3 ? `${Math.floor(h)} שעות` : `${h} שעות`,

  // Settings: זמני תגובה (D-043)
  rtTitle: "זמני תגובה",
  rtHint: "הזמן נספר רק בימי העבודה ובשעות העבודה. חגים לא נספרים. השעון רץ מהרגע שהליד נכנס ועד הפנייה הראשונה אליו.",
  rtDays: "ימי עבודה",
  rtStart: "משעה",
  rtEnd: "עד שעה",
  rtHot: "ליד חם",
  rtHotHint: "הליד לחץ «אני רוצה להזמין» או «רוצה לשמוע עוד», או כתב לנו בוואטסאפ",
  rtNormal: "כל ליד אחר",
  rtHoursUnit: "שעות עבודה",
  rtDaysEmpty: "בחרו לפחות יום עבודה אחד",
  rtTimeFormat: "כתבו את השעה כך: 09:00",
  rtEndBeforeStart: "שעת הסיום צריכה להיות אחרי שעת ההתחלה",
  rtHoursRange: "בין חצי שעה ל־40 שעות, בחצאי שעות",
  rtHotSlower: "היעד לליד חם לא יכול להיות ארוך מהיעד לליד רגיל",
  rtSave: "שמירת זמני התגובה",
  rtSaved: "נשמר ✓",
  rtUnsaved: "לא נשמר",
  rtChangedBy: (actor: string, when: string) => `שונה ע״י ${actor} ${when}`,

  // Attention: the week per rep (D-043)
  weekTitle: "זמני תגובה · 7 ימים אחרונים",
  weekHint: "לידים שנכנסו השבוע, ומתי חזרו אליהם",
  weekOnTime: "ענו בזמן",
  weekLate: "ענו באיחור",
  weekOpen: "עוד לא ענו",
  weekOpenDueSoon: (n: number) => (n === 1 ? "מתוכם אחד עומד לעבור" : `מתוכם ${n} עומדים לעבור`),
  weekMetLabel: "עמדו ביעד",
  weekMet: (pct: number, met: number, decided: number) => `${pct}% · ${met} מתוך ${decided}`,
  weekNoDecided: "עוד אין",
  weekUnowned: "ללא בעלים",
  weekEmpty: "לא נכנסו לידים בשבוע האחרון",
  weekTotal: (n: number) => (n === 1 ? "ליד אחד" : `${n} לידים`),

  // errors
  genericError: "משהו השתבש",
  saveFailed: "השמירה נכשלה — נסה שוב",
  sessionExpired: "החיבור פג — רענן את הדף",
} as const;

/** Working days for the response clock (D-043): short on the toggle, full for its name. 0 = Sunday. */
export const DAY_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"] as const;
export const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"] as const;

/** The six quick-message situations (D-042), as a rep reads them. */
export const QUICK_SITUATION_LABELS: Record<QuickSituation, string> = {
  returning_customer: "לקוח חוזר",
  tapped_order_no_order: "לחץ «להזמין» ולא הזמין",
  asked_more: "ביקש לשמוע עוד",
  no_answer: "לא ענה לשיחה",
  menu_no_reply: "קיבל תפריט ולא ענה",
  no_auto: "לא קיבל הודעה אוטומטית",
};

/** The quick-message variables, as a person reads them: the chips' names and the journey's pills. */
export const QUICK_VARIABLE_LABELS: Record<"name" | "rep" | "business" | "menu", string> = {
  name: "שם הליד",
  rep: "שם הנציג",
  business: "שם העסק",
  menu: "שם התפריט",
};

/** What each automatic message is, in the drawer's line. A first menu shows its menu's label. */
export const AUTO_KIND_LABELS: Record<string, string> = {
  first_menu: "תפריט",
  general_reply: "תשובה ראשונה",
  order_link: "קישור להזמנה",
  customer_link: "קישור להזמנה",
  more_info: "הודעת «נחזור אליכם»",
  free_text_reply: "הודעת «נחזור אליכם»",
  not_now: "תודה על ההתעניינות",
  optout_confirm: "אישור הסרה",
  order_confirm: "אישור הזמנה",
  wake: "הודעת המשך",
};

/** Server rule codes (SALES_*) rendered in Hebrew. */
export const RULE_MESSAGES: Record<string, string> = {
  AUTH_EXPIRED: UI.sessionExpired,
  SALES_SIGNER_NOT_ON_ROSTER: "האדם הזה לא ברשימת אנשי המכירות הפעילים.",
  SALES_TEST_PHONE_INVALID: "אחד המספרים אינו מספר ישראלי תקין.",
  SALES_LOST_REQUIRES_REASON: "צריך לציין סיבה לאובדן.",
  SALES_WON_IS_EVIDENCE_ONLY: "סטטוס 'הומר' נכתב מהזמנה ב-Shopify, ולא ידנית.",
  SALES_NEXT_TOUCH_REQUIRED: "צריך לקבוע מתי חוזרים לליד.",
  SALES_OPEN_LEAD_WITHOUT_NEXT_TOUCH: "ליד פתוח חייב מגע הבא.",
  SALES_INVALID_CHANNEL: "ערוץ פנייה לא מוכר.",
  SALES_INVALID_OUTCOME: "תוצאה לא מוכרת.",
  SALES_INVALID_STATUS: "סטטוס לא מוכר.",
  SALES_LEAD_NOT_FOUND: "הליד לא נמצא.",
  SALES_NOTE_EMPTY: "ההערה ריקה.",
  // GT Pulse Unit B (gt-factory-os orgs_handler.ts)
  SALES_ORG_NOT_FOUND: "העסק לא נמצא.",
  SALES_ORG_RETIRED: "אחד העסקים סגור. אי אפשר לשייך לו בעלים.",
  SALES_OWNER_UNKNOWN: "האדם הזה אינו איש מכירות פעיל.",
  SALES_IDENTITY_NOTHING_OPEN: "ההחלטה כבר התקבלה בינתיים. רעננו את הרשימה.",
  SALES_IDENTITY_NOT_REJECTABLE: "לעסק זה יש אפשרות אישור בלבד, אין קישור לדחות.",
  SALES_IDENTITY_ACTION_UNSUPPORTED: "הפעולה הזו לא מתאימה לעסק הזה.",
  SALES_IDENTITY_CHAIN_AMBIGUOUS: "מפת הרשתות לא מציעה רשת אחת ברורה.",
  SALES_IDENTITY_NEEDS_CUSTOMER: "צריך לבחור לקוח.",
  SALES_IDENTITY_NOT_MIRRORED: "הלקוח לא נמצא בהעתק של Shopify.",
  SALES_IDENTITY_HOLDER_CHANGED: "הלקוח הזה כבר שייך לעסק אחר מזה שהוצג. רעננו את הרשימה והחליטו שוב.",
  SALES_IDENTITY_NOT_A_CANDIDATE: "הלקוח הזה כבר אינו מועמד לעסק. רעננו את הרשימה.",
  SALES_CONTACT_NOT_FOUND: "איש הקשר לא נמצא.",
  SALES_LEAD_OPTED_OUT: "הליד ביקש לא לקבל הודעות («הסר»). אפשר להתקשר.",
};

/** Settings phase 3, "צוות וכללים" (D-045, tranche 205). */
export const TEAM_UI = {
  title: "צוות וכללים",
  hint: "מי חותם על ההודעות, איזה תפריט יוצא לכל קו, וצורת התור.",
  changedBy: (actor: string, when: string) => `שונה ע״י ${actor} ${when}`,
  saved: "נשמר ✓",
  unsaved: "לא נשמר",
  retry: "נסו שוב",

  signersTitle: "אנשי מכירות ושמות חתימה",
  signersHint: "השם שחותם על הודעות ההמשך האוטומטיות ועל ההודעות המהירות. הוא מקושר לחשבון של כל אחד, לא לשם התצוגה.",
  signerLabel: (name: string) => `שם החתימה של ${name}`,
  signerPlaceholder: "למשל: אבי",
  signerNone: (name: string) => `אין שם חתימה, ולכן הודעות ההמשך האוטומטיות ללידים של ${name} לא יוצאות.`,
  signerLegacy: "נקרא כרגע לפי שם התצוגה. שמרו כדי לקשר אותו לחשבון.",
  signerTooLong: "עד 30 תווים",
  signersSave: "שמירת שמות החתימה",

  menusTitle: "קובץ התפריט לכל קו",
  menusHint: "הקובץ שנשלח לליד בהודעה הראשונה, לפי הקו שבחר באתר.",
  menusWarn: "בלי קובץ, הליד מקבל את התשובה הכללית במקום התפריט.",
  menusLoadError: "לא הצלחנו לבדוק את קובצי התפריט.",
  menuState: { ok: "תקין", missing: "חסר קובץ", unchecked: "לא נבדק" } as const,
  menuReason: (reason: string | null): string => {
    if (!reason) return "";
    if (reason === "no_file") return "לא הוגדר קובץ";
    if (reason === "unreachable") return "לא הצלחנו להגיע לקובץ";
    if (reason === "host_not_allowed") return "הקישור לא בכתובת מורשית, ולכן לא נבדק";
    const http = /^http_(\d{3})$/.exec(reason);
    if (http) return http[1] === "404" ? "הקובץ לא נמצא בכתובת" : `הכתובת החזירה שגיאה ${http[1]}`;
    return "";
  },
  menuCheckedAt: (when: string) => `נבדק ${when}`,
  menuLine: (line: string) => `קו: ${line}`,
  menuEdit: "עריכה",
  menuEditNamed: (label: string) => `עריכת ${label}`,
  menuCancel: "ביטול",
  menuLabel: "שם התפריט",
  menuFilename: "שם הקובץ",
  menuFilenameHint: "השם שהליד רואה בוואטסאפ, למשל Matcha.pdf",
  menuUrl: "קישור לקובץ",
  menuUrlHint: "קישור שמתחיל ב־https://cdn.shopify.com/",
  menuSave: "שמירת הקובץ",
  menuLabelRequired: "כתבו שם לתפריט, עד 60 תווים",
  menuFilenameBad: "שם הקובץ צריך להסתיים ב־.pdf, בלי / ועד 120 תווים",
  menuUrlBad: "הקישור צריך להתחיל ב־https://cdn.shopify.com/",

  queueSave: "שמירת צורת התור",
  lostReasonsSave: "שמירת סיבות האבוד",

  historyShow: "היסטוריית שינויים",
  historyTitle: (what: string) => `היסטוריית שינויים: ${what}`,
  historyEmpty: "אין עדיין שינויים.",
  historyError: "לא הצלחנו לטעון את ההיסטוריה.",
  historyLoading: "טוענים…",
  historyAdded: (items: string) => `נוסף: ${items}`,
  historyRemoved: (items: string) => `הוסר: ${items}`,
  historyChanged: (items: string) => `שונה: ${items}`,
  historyFirst: "ערך ראשון נשמר",
  historyUpdated: "עודכן",
} as const;

/** The control room (D-045, tranche 205). Tom only. */
export const CONTROL_UI = {
  title: "חדר בקרה",
  hint: "מצב המערכות של המכירות, במבט אחד. רק תום רואה את הדף הזה.",
  notFound: "הדף לא נמצא",
  notFoundHint: "אין כאן דף. אפשר לחזור לעמוד היום.",
  backToToday: "לעמוד היום",
  /** completes UI.loadError: "לא הצלחנו לטעון את …" */
  loadError: "חדר הבקרה",
  generatedAt: (when: string) => `עודכן ${when}`,
  tile: {
    intake: "קליטת לידים",
    whatsapp: "קו הוואטסאפ ללידים",
    wake: "הודעות המשך",
    mirror: "המראה של Shopify",
    report: "דוח המכירות",
    radar: "רדאר הלקוחות הרדומים",
    settings: "יומן שינויי הגדרות",
  } as const,
  state: { green: "תקין", amber: "לבדוק", red: "תקלה" } as const,
  lastSuccess: (when: string) => `הצלחה אחרונה ${when}`,
  noSuccess: "עוד לא נרשמה הצלחה",
  action: {
    ok: "אין מה לעשות.",
    intake_pulse_stale: "הדופק של Make לא הגיע יותר מיממה. בדקו את החיבור לפייסבוק ב־Make.",
    intake_poll_stale: "המשיכה מ־Meta לא הצליחה יותר מיממה. בדקו את הטוקן.",
    intake_unalerted: "יש לידים מהיומיים האחרונים בלי התראה. בדקו את שליחת המיילים.",
    intake_rejects: "לידים נדחו ביממה האחרונה. בדקו מה חסר בהם.",
    wa_off: "הקו לא מחובר. חסר מזהה המספר בשרת.",
    wa_failed: "הודעות נכשלו בשבוע האחרון. בדקו את סיבת הכישלון בלוג.",
    wa_test: "הקו במצב בדיקה: רק הטלפונים לבדיקה מקבלים הודעות באמת.",
    wake_no_runs: "עוד לא נרשמה ריצה. הריצות נרשמות מהעדכון הזה והלאה.",
    wake_error: "הריצה האחרונה נעצרה בשגיאה. בדקו את הלוג של השרת.",
    wake_quiet: "אין ריצה מוצלחת בשעה האחרונה. בדקו את משימת ה־cron.",
    wake_no_signer: "הודעות לא יצאו כי חסר שם חתימה. השלימו אותו בהגדרות.",
    wake_no_menu_file: "הודעות לא יצאו כי חסר קובץ תפריט. השלימו אותו בהגדרות.",
    wake_failed: "הודעות נכשלו בריצה האחרונה. בדקו את הלוג.",
    mirror_failed: "הריצה האחרונה נכשלה. בדקו את פירוט השגיאה.",
    mirror_stale: "אין ריצה מוצלחת יותר מ־30 שעות. בדקו את משימת ה־cron.",
    mirror_exceptions: "יש חריגים פתוחים. עברו עליהם.",
    report_failed: "הריצה האחרונה נכשלה. בדקו את פירוט השגיאה.",
    report_stale: "אין עדכון מוצלח בשעתיים האחרונות. בדקו את משימת ה־cron.",
    report_full_stale: "הדוח המלא לא נבנה יותר מיממה.",
    radar_stale: "הרדאר לא רץ יותר מ־30 שעות. בדקו את משימת ה־cron.",
  } as Record<string, string>,
  // facts, one short line each
  intakeMode: (mode: string) => (mode === "make" ? "מסלול: Make" : "מסלול: משיכה מ־Meta"),
  lastLead: (when: string) => `ליד אחרון ${when}`,
  leads24h: (n: number) => `${n} לידים ב־24 השעות האחרונות`,
  pulse: (mode: string, when: string) => (mode === "make" ? `דופק אחרון ${when}` : `משיכה מוצלחת אחרונה ${when}`),
  rejects24h: (n: number) => `${n} נדחו ב־24 שעות`,
  unalerted48h: (n: number) => `${n} בלי התראה ב־48 שעות`,
  waMode: { live: "פעיל: כל ליד מקבל הודעות", test: "מצב בדיקה", off: "לא מחובר" } as Record<string, string>,
  waWindow: "7 הימים האחרונים",
  waStatus: { sent: "נשלחו", delivered: "נמסרו", read: "נקראו", failed: "נכשלו", dry_run: "הרצה יבשה" } as Record<string, string>,
  optOuts: (total: number, week: number) => `ביקשו להפסיק: ${total} בסך הכל, ${week} השבוע`,
  templateApproval: "אישור התבניות ב־Meta: לא נשמר",
  wakeLast: (when: string) => `ריצה אחרונה ${when}`,
  wakeCounts: (considered: number, sent: number, dry: number, failed: number) =>
    `נבדקו ${considered} · נשלחו ${sent} · יבש ${dry} · נכשלו ${failed}`,
  wake24h: (runs: number, sent: number) => `${runs} ריצות ו־${sent} הודעות ב־24 שעות`,
  wakeSkipped: "דילוגים ב־24 שעות",
  // the wake job's skip reasons (gt-factory-os wake.ts), in words; an unknown one shows as sent
  skipReason: {
    no_signer: "חסר שם חתימה",
    no_menu_file: "חסר קובץ תפריט",
    no_menu: "לא נשלח תפריט ראשון",
    no_name: "אין שם לפנייה",
    already_claimed: "כבר נשלח",
    state_changed: "המצב השתנה",
    not_due: "עוד לא הזמן",
    outside_slot: "מחוץ לשעות השליחה",
    within_48h: "פחות מ־48 שעות מהקודמת",
    already_sent_today: "כבר נשלחה היום",
    not_eligible: "ההודעה הראשונה לא נמסרה",
    opted_out: "ביקשו להפסיק",
    ordered: "כבר הזמינו",
    replied: "ענו לנו",
    waiting_for_customer: "מחכים ללקוח",
    staff_wrote_within_24h: "כתבנו להם ב־24 שעות",
    sequence_complete: "הרצף הסתיים",
    step_already_sent: "השלב כבר נשלח",
    marketing_cap_retry_later: "מגבלת שיווק של Meta, ננסה שוב",
    no_such_step: "אין שלב כזה",
  } as Record<string, string>,
  remove: "הסרה",
  wakeError: (msg: string) => `שגיאה: ${msg}`,
  mirrorLast: (kind: string, status: string) => `ריצה אחרונה: ${kind} · ${status}`,
  openExceptions: (n: number) => (n === 0 ? "אין חריגים פתוחים" : `${n} חריגים פתוחים`),
  reportLast: (kind: string, status: string) => `ריצה אחרונה: ${kind} · ${status}`,
  reportFull: (when: string) => `דוח מלא אחרון ${when}`,
  radarCounts: (flagged: number, orgs: number) => `${flagged} מתוך ${orgs} עסקים סומנו לבדיקה`,
  settingsRecent: "שינויים אחרונים",
  settingsNone: "אין עדיין שינויים.",
  technicalTitle: "הגדרות טכניות",
  testPhonesTitle: "טלפונים לבדיקה",
  testPhonesHint: "כשהקו במצב בדיקה, רק המספרים האלה מקבלים את ההודעות האוטומטיות באמת.",
  testPhonesEmpty: "אין טלפונים לבדיקה.",
  testPhoneNew: "מספר חדש",
  testPhoneAdd: "הוספה",
  testPhoneRemove: (p: string) => `הסרת ${p}`,
  testPhoneBad: "כתבו מספר ישראלי, למשל 050-1234567",
  testPhonesSave: "שמירת הטלפונים",
  intakeModeTitle: "מסלול הקליטה",
  intakeModeReadOnly: "לקריאה בלבד. שינוי נעשה במיגרציה.",
  intakeModeValue: (mode: string | null) => (mode === "make" ? "Make מעביר את הלידים" : mode === "poll" ? "משיכה ישירה מ־Meta" : "לא הוגדר"),
  intakeModeChanged: (when: string) => `שונה ${when}`,
  intakePulseExpected: (v: string) => (v === "hourly" ? "דופק צפוי: כל שעה" : `דופק צפוי: ${v}`),
} as const;

/** Settings keys as a manager names them, for the history and the settings log. */
export const SETTING_KEY_LABELS: Record<string, string> = {
  whatsapp_quick_messages: "הודעות מהירות",
  response_time: "זמני תגובה",
  lead_journey_signers_by_email: "שמות חתימה",
  lead_menus: "קובצי תפריט",
  queue: "צורת התור",
  lost_reasons: "סיבות אבוד",
  lead_journey_test_phones: "טלפונים לבדיקה",
  sla_hours: "זמן תגובה (ישן)",
  whatsapp_templates: "תבניות WhatsApp (ישן)",
};
