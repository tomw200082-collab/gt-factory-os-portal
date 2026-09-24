// ---------------------------------------------------------------------------
// Portal registrations — response shapes and the small helpers the page uses
// (Tranche 179).
//
// The shapes are the staff-route contract of the customer-portal API
// (gt-factory-os, module customer-portal); the page reads them through the
// proxies under src/app/api/portal/.
// ---------------------------------------------------------------------------

export type RegistrationStatus = "pending" | "approved" | "rejected";

export interface Registration {
  /** uuid */
  id: string;
  wa_phone: string;
  business_name: string;
  branch_city: string;
  contact_name: string;
  suggested_customer_id: string | null;
  status: RegistrationStatus;
  created_at: string;
}

export interface RegistrationsResponse {
  rows: Registration[];
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

export interface CustomerSearchResponse {
  rows: ShopifyCustomer[];
}

export interface DecideResponse {
  ok: true;
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

export interface ApprovedResponse {
  rows: ApprovedCustomer[];
}

export interface LoginLinkResponse {
  url: string;
  wa_link: string;
}

export interface RevokeResponse {
  ok: true;
}

/** A search is not sent until it has this many characters. */
export const MIN_SEARCH_CHARS = 2;

/** `gid://shopify/Customer/123` → `123`. Anything else comes back unchanged. */
export function shopifyCustomerNumber(gid: string): string {
  const m = /^gid:\/\/shopify\/Customer\/(\d+)$/.exec(gid.trim());
  return m ? m[1] : gid;
}

export function ordersLabel(count: number): string {
  return `${count} ${count === 1 ? "order" : "orders"}`;
}

/** Day-first date and time (en-GB). Unparseable input is shown as-is. */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** The request that has waited longest comes first. */
export function byOldestFirst(
  a: { created_at: string },
  b: { created_at: string },
): number {
  return Date.parse(a.created_at) - Date.parse(b.created_at);
}

export type PortalAction = "approve" | "reject" | "login-link" | "revoke";

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
  revoke: "This access no longer exists or was already revoked. Refresh the list.",
};

export interface PortalFailure {
  status: number | null;
  message: string;
  /** The server's own reason, kept only where it adds to the message. */
  detail?: string;
}

/** Thrown by {@link postPortal}; the page renders `message` and `detail`. */
export class PortalRequestError extends Error {
  readonly status: number | null;
  readonly detail: string | undefined;
  constructor(failure: PortalFailure) {
    super(failure.message);
    this.name = "PortalRequestError";
    this.status = failure.status;
    this.detail = failure.detail;
  }
}

function serverReason(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const error = (body as { error?: unknown }).error;
  return typeof error === "string" && error.trim() !== "" ? error.trim() : undefined;
}

/** What a row says when the server refuses an approve, a reject, a login link or a revoke. */
export function portalFailure(
  action: PortalAction,
  status: number,
  body: unknown,
): PortalFailure {
  if (status === 401) {
    return { status, message: "Your session has expired. Sign in again, then retry." };
  }
  if (status === 403) {
    return { status, message: `Only an admin can ${ACTION_PHRASE[action]}.` };
  }
  if (status === 404) {
    return { status, message: GONE[action] };
  }
  if (status === 409 && (action === "approve" || action === "reject")) {
    return {
      status,
      message: "This registration was already approved or rejected. Refresh the list to see where it stands.",
    };
  }
  if (status === 422) {
    return {
      status,
      message:
        action === "approve"
          ? "The approval was not accepted. Check the picked customer and try again."
          : "The request was not accepted.",
      detail: serverReason(body),
    };
  }
  return {
    status,
    message: `Could not ${ACTION_PHRASE[action]} (HTTP ${status}). Try again.`,
    detail: serverReason(body),
  };
}

/** POST a JSON body; throws {@link PortalRequestError} on a refusal or a network failure. */
export async function postPortal<T>(
  url: string,
  body: unknown,
  action: PortalAction,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new PortalRequestError({
      status: null,
      message: "Could not reach the server. Check your connection and try again.",
    });
  }
  const parsed: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new PortalRequestError(portalFailure(action, res.status, parsed));
  return parsed as T;
}
