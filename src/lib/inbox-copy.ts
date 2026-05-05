// Hebrew copy register for the typed Inbox surface.
//
// Spec: docs/superpowers/specs/2026-05-04-inbox-typed-cards-and-price-proposals-design.md §1.15
// Plan: docs/superpowers/plans/2026-05-04-inbox-typed-cards-and-price-proposals.md Task 4.1
//
// All Hebrew strings rendered by the typed-Inbox UI live here. NEVER inline
// Hebrew in components; always import from this module. The audience is
// planner+admin (per spec §1.2) so copy is concise/professional, not
// hand-holding.

export type CardType = 'decision' | 'to_do' | 'warning' | 'info';
export type MacroStatus = 'open' | 'closed';
export type ActionSlot = 'primary' | 'secondary';

// ---------------------------------------------------------------------------
// Card-type labels (top-level taxonomy)
// ---------------------------------------------------------------------------
const CARD_TYPE_LABEL: Record<CardType, string> = {
  decision: 'החלטה',
  to_do: 'משימה',
  warning: 'התראה',
  info: 'מידע',
};

const CARD_TYPE_LABEL_PLURAL: Record<CardType, string> = {
  decision: 'החלטות',
  to_do: 'משימות',
  warning: 'התראות',
  info: 'מידע',
};

export function copyForCardType(t: CardType, plural = false): string {
  return plural ? CARD_TYPE_LABEL_PLURAL[t] : CARD_TYPE_LABEL[t];
}

// ---------------------------------------------------------------------------
// Macro-status compression — internal status → planner-facing 2-state
// (per spec §1.11)
// ---------------------------------------------------------------------------
export function copyForStatus(internalStatus: string): string {
  switch (internalStatus) {
    case 'open':
    case 'acknowledged':
    case 'pending_gi_action':
    case 'gi_action_failed':
      return 'פתוח';
    case 'resolved':
    case 'auto_resolved':
    case 'dismissed':
    case 'gi_draft_created':
      return 'טופל';
    default:
      return internalStatus;
  }
}

// ---------------------------------------------------------------------------
// Action button labels (per card_type + slot)
// ---------------------------------------------------------------------------
const ACTION_LABELS: Record<CardType, Record<ActionSlot, string>> = {
  decision: { primary: 'אשר', secondary: 'ערוך ואשר' },
  to_do: { primary: 'פתח', secondary: 'דלג' },
  warning: { primary: 'ראיתי', secondary: 'בדוק' },
  info: { primary: 'סגור', secondary: '' },
};

export function copyForAction(t: CardType, slot: ActionSlot): string {
  return ACTION_LABELS[t][slot];
}

// Standalone action labels used across multiple card types
export const ACTION_REJECT = 'דחה';
export const ACTION_DEFER = 'דחה לזמן אחר';
export const ACTION_SNOOZE = 'דחה לזמן אחר';

// ---------------------------------------------------------------------------
// Subtype labels — exhaustive map per spec §1.15
// ---------------------------------------------------------------------------
const SUBTYPE_LABEL: Record<string, string> = {
  // Decision subtypes
  gi_price_proposal: 'שינוי מחיר ספק',
  po_line_over_receipt: 'עודף בקבלת סחורה',
  count_large_variance: 'אישור ספירת מלאי',
  positive_adjustment: 'אישור התאמת מלאי (חיובית)',
  loss_above_threshold: 'אישור פחת מעל סף',
  manual_po_approval: 'אישור הזמנת רכש ידנית',
  purchase_recommendation_approval: 'אישור המלצת רכש',
  production_recommendation_approval: 'אישור המלצת ייצור',
  customer_credit: 'אישור זיכוי לקוח',
  lw_catalog_gap: 'החלטת קטלוג LionWheel',
  shopify_variant_gap: 'פער וריאנט Shopify',

  // To-Do subtypes
  unmapped_fg_alias: 'מיפוי FG לחנות',
  unmapped_gi_supplier: 'מיפוי ספק מ-Green Invoice',
  unmapped_gi_line: 'מיפוי שורת חשבונית',
  ambiguous_supplier_mapping: 'פתרון מיפוי כפול',
  unmapped_lw_sku: 'מיפוי SKU מ-LionWheel',
  gi_expense_review: 'בדיקת חשבונית מ-Green Invoice',

  // Warning subtypes
  gi_stale: 'Green Invoice לא מסונכרן',
  lionwheel_stale: 'LionWheel לא מסונכרן',
  shopify_stale: 'Shopify לא מסונכרן',
  rebuild_stale: 'אימות מלאי לא רץ',
  export_stale: 'ייצוא לילי לא רץ',
  forecast_stale: 'תחזית לא עודכנה',
  supplier_price_anomaly: 'אנומליה במחיר ספק',
  gi_price_activation_failed: 'הפעלת מחיר עתידי נכשלה',
  gi_api_failure: 'שגיאת API ב-Green Invoice',
  gi_auth_failure: 'פג תוקף הזדהות Green Invoice',
  gi_rate_limit_stuck: 'מגבלת קצב Green Invoice',
  gi_mirror_insert_failed: 'כשל בכתיבת מראה GI',
  lionwheel_auth_expired: 'פג תוקף הזדהות LionWheel',
  lionwheel_auth_failure: 'כשל הזדהות LionWheel',
  lionwheel_rate_limit_stuck: 'מגבלת קצב LionWheel',
  lionwheel_schema_drift: 'שינוי לא צפוי במבנה LionWheel',
  shopify_auth_failure: 'כשל הזדהות Shopify',
  shopify_rate_limit_stuck: 'מגבלת קצב Shopify',
  shopify_api_version_drift: 'שינוי גרסת API ב-Shopify',
  shopify_network_failure: 'תקלת רשת Shopify (היסטורי)',
  shopify_drift: 'דריפט נתונים מ-Shopify',
  lw_pick_enrich_failed: 'העשרת לקיטה נכשלה',
  alias_revoked_with_dependencies: 'alias בוטל עם תלויות פעילות',

  // Info subtypes
  lw_capped_window: 'חריגה מ-100 שורות ב-LionWheel',
  gi_non_ils_currency: 'חשבונית במטבע שאינו ש"ח',
  lw_pick_data_missing: 'נתוני לקיטה חסרים',
  lionwheel_payload_invalid_sku: 'SKU לא תקין מ-LionWheel',
  lionwheel_payload_invalid_picked_quantity: 'כמות לקיטה לא תקינה',
  lionwheel_order_note: 'הערת הזמנה מ-LionWheel',
  bom_version_published: 'גרסת BOM פורסמה',
};

export function copyForSubtype(subtype: string | null | undefined): string {
  if (!subtype) return '';
  return SUBTYPE_LABEL[subtype] ?? subtype;
}

// ---------------------------------------------------------------------------
// Filter side-pane labels
// ---------------------------------------------------------------------------
export const FILTER_COPY = {
  type: 'סוג',
  severity: 'חומרה',
  source: 'מקור',
  status: 'מצב',
  search: 'חיפוש',
  saveFilter: 'שמור סינון',
  resetFilter: 'אתחל סינון',
  savedViewDefault: 'פתוח',
  savedViewHistory: 'טופל',
  severityCritical: 'קריטי',
  severityWarning: 'אזהרה',
  severityInfo: 'מידע',
  statusOpen: 'פתוח',
  statusClosed: 'טופל',
  statusAll: 'הכל',
} as const;

// ---------------------------------------------------------------------------
// Empty / loading / toast states
// ---------------------------------------------------------------------------
export const STATE_COPY = {
  emptyAllClean: 'הכל מטופל',
  emptyFilterNoMatch: 'אין פריטים שמתאימים לסינון',
  loadingFeed: 'טוען רשימה…',
  loadingDrawer: 'טוען פרטים…',
  // Auto-resolve note shown in Warning card body
  autoResolveNote: 'הכרטיסייה תיסגר לבד כשהאינטגרציה תחזור לתקין.',
} as const;

// ---------------------------------------------------------------------------
// Action dialog / confirmation strings
// ---------------------------------------------------------------------------
export const DIALOG_COPY = {
  // Approve
  approveHeader: 'אישור שינוי מחיר',
  approveBody: 'המחיר הנוכחי יוחלף במחיר המוצע. הפעולה תיחתם ב-audit.',
  approveConfirm: 'אשר',
  approveCancel: 'ביטול',
  // Edit→Approve
  editApproveOverridePlaceholder: 'מחיר מתוקן (₪ לפי יחידת רכש)',
  editApproveReasonPlaceholder: 'סיבה לעריכה (חובה)',
  editApproveEffectiveAtPlaceholder: 'תאריך תחילת תוקף (אופציונלי)',
  // Reject
  rejectReasonPlaceholder: 'סיבת הדחייה (חובה)',
  rejectConfirm: 'דחה',
  // Defer / Snooze
  deferDurationOptions: ['שעה', 'יום', 'שבוע'] as const,
  snoozeDurationOptions: ['יום', 'שבוע'] as const,
  // Toasts
  toastApproved: 'אושר',
  toastRejected: 'נדחה',
  toastSupplierMappingDrift: 'המיפוי השתנה מאז שהוצעה ההצעה. נדרש מיפוי מחדש.',
  toastStaleProposal: 'מישהו אחר כבר טיפל בהצעה זו.',
  toastInvalidInput: 'הקלט לא תקין',
} as const;

// ---------------------------------------------------------------------------
// Confidence label (Decision-card key facts)
// ---------------------------------------------------------------------------
const CONFIDENCE_LABEL: Record<string, string> = {
  HIGH: 'גבוה',
  MEDIUM: 'בינוני',
};

export function copyForConfidence(conf: string): string {
  return `ביטחון: ${CONFIDENCE_LABEL[conf] ?? conf}`;
}

// ---------------------------------------------------------------------------
// Top badge strip — "12 החלטות · 4 משימות · 2 התראות"
// ---------------------------------------------------------------------------
export function topBadgeStripLabel(counts: Record<CardType, number>): string {
  const parts: string[] = [];
  for (const t of ['decision', 'to_do', 'warning'] as const) {
    if (counts[t] > 0) {
      parts.push(`${counts[t]} ${copyForCardType(t, true)}`);
    }
  }
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Tier color (per spec §1.5.1)
// ---------------------------------------------------------------------------
export function colorForPriceDelta(pctDelta: number): 'green' | 'amber' | 'red' | 'neutral' {
  if (pctDelta < 0) return 'green';
  if (pctDelta > 0.15) return 'red';
  if (pctDelta > 0.03) return 'amber';
  return 'neutral';
}
