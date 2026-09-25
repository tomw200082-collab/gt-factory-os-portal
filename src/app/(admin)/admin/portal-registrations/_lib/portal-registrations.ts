// ---------------------------------------------------------------------------
// Portal registrations — response shapes and the small helpers the page uses
// (Tranche 179).
//
// The shapes are the staff-route contract of the customer-portal API
// (gt-factory-os, module customer-portal); the page reads them through the
// proxies under src/app/api/portal/.
// ---------------------------------------------------------------------------

import { post } from "@/lib/api/client";

export type Rows<T> = { rows: T[] };

export interface Registration {
  /** uuid */
  id: string;
  wa_phone: string;
  business_name: string;
  branch_city: string;
  contact_name: string;
  suggested_customer_id: string | null;
  created_at: string;
}

/** A Shopify customer as the customer search returns it for one registration. */
export interface ShopifyCustomer {
  /** `gid://shopify/Customer/N` */
  id: string;
  name: string;
  city: string | null;
  orders_count: number;
  /** Whether the registration's phone is on this customer's Shopify record. */
  phone_matches: boolean;
}

export interface DecideResponse {
  wa_link: string | null;
}

/** A `customer_portal.access` row that is not revoked. */
export interface ApprovedCustomer {
  /** uuid */
  access_id: string;
  wa_phone: string;
  display_name: string | null;
  branch: string | null;
  shopify_customer_id: string;
  approved_at: string;
  source: "backfill" | "registration";
}

export interface LoginLinkResponse {
  url: string;
  wa_link: string;
}

/** A search is not sent until it has this many characters. */
export const MIN_SEARCH_CHARS = 2;

/** `gid://shopify/Customer/123` → `123`. Anything else comes back unchanged. */
export function shopifyCustomerNumber(gid: string): string {
  const m = /^gid:\/\/shopify\/Customer\/(\d+)$/.exec(gid.trim());
  return m ? m[1] : gid;
}

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Day-first date and time (en-GB). Unparseable input is shown as-is. */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : WHEN.format(d);
}

type PortalAction = "approve" | "reject" | "login-link" | "revoke";

/** The action as the object of a sentence: "Could not <this>", "Only an admin can <this>". */
const ACTION_PHRASE: Record<PortalAction, string> = {
  approve: "approve this registration",
  reject: "reject this registration",
  "login-link": "create a login link",
  revoke: "revoke this access",
};

/** What a 404 means for each action. */
const GONE: Record<PortalAction, string> = {
  approve: "This registration no longer exists. Refresh the list.",
  reject: "This registration no longer exists. Refresh the list.",
  "login-link": "This customer is no longer approved for the portal. Refresh the list.",
  revoke: "No access row with that id.",
};

/** Thrown by {@link postPortal}; the row shows `message` and `detail`, and offers a refresh when `stale`. */
export class PortalRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** The server's own words, kept only where they add to the message. */
    readonly detail?: string,
    /** The row no longer matches the server: refreshing the list shows where it stands. */
    readonly stale = false,
  ) {
    super(message);
    this.name = "PortalRequestError";
  }
}

/** What a row says when the server refuses an approve, a reject, a login link or a revoke. */
function portalFailure(
  action: PortalAction,
  { status, reason_code, detail }: { status: number; reason_code?: string; detail?: string },
): PortalRequestError {
  // The server's own words; a proxy failure adds a detail to its error.
  const reason = [reason_code, detail].filter(Boolean).join(": ") || undefined;
  if (status === 0) {
    return new PortalRequestError(
      "Could not reach the server. Check your connection and try again.",
      status,
    );
  }
  if (status === 403) {
    return new PortalRequestError(`Only an admin can ${ACTION_PHRASE[action]}.`, status);
  }
  if (status === 404) {
    return new PortalRequestError(GONE[action], status, undefined, true);
  }
  if (status === 409 && (action === "approve" || action === "reject")) {
    return new PortalRequestError(
      "This registration was already approved or rejected. Refresh the list to see where it stands.",
      status,
      undefined,
      true,
    );
  }
  if (status === 409 && action === "login-link") {
    return new PortalRequestError(
      "The portal is closed to this customer: the launch flag is off or they are not on its allowlist.",
      status,
    );
  }
  if (status === 422) {
    return new PortalRequestError(
      action === "approve"
        ? "The approval was not accepted. Check the picked customer and try again."
        : "The request was not accepted.",
      status,
      reason,
    );
  }
  return new PortalRequestError(
    `Could not ${ACTION_PHRASE[action]} (HTTP ${status}). Try again.`,
    status,
    reason,
  );
}

/** POST through the shared client; a refusal or a network failure throws {@link PortalRequestError}. */
export async function postPortal<T>(
  url: string,
  body: unknown,
  action: PortalAction,
): Promise<T> {
  const res = await post<T>(url, body);
  if (!res.ok) throw portalFailure(action, res);
  return res.data;
}
