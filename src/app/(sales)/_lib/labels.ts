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
import type { LeadStatus, OrderClass, OrgFilter, OrgSort, OutcomeResult, OutreachChannel, RiverChip, TodayItemType } from "./types";

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
  orgPageTitle: (name: string) => `${name} · GT מכירות`,
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

export const NAV_LABELS = {
  today: "היום",
  leads: "לידים",
  orgs: "עסקים",
  attention: "מצב",
  settings: "הגדרות",
} as const;

/**
 * Everything else the user reads. "WhatsApp" stays Latin on purpose: it is the
 * product's own name, and Hebrew speakers read it that way.
 */
export const UI = {
  ...ORG_UI,
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
  ageInDays: (days: number) => (days === 1 ? "בן יום" : `בן ${days} ימים`),
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
};
