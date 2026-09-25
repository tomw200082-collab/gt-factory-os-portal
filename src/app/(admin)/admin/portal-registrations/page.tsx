"use client";

// ---------------------------------------------------------------------------
// Admin · Portal registrations — /admin/portal-registrations (Tranche 179).
//
// The staff side of the customer ordering portal. Two tabs:
//
//   Pending     — access requests from phones the portal does not know yet.
//                 Each is linked to the Shopify customer (branch) it belongs
//                 to and approved, or rejected. An approved row then offers
//                 "Send approval on WhatsApp": a wa.me link with the message
//                 already typed. A person presses send; nothing on this page
//                 messages a customer.
//   Login link  — search approved customers and create a login link to hand
//                 over by hand (copy it, or open WhatsApp with it typed), or
//                 revoke a customer's access.
//
// Every call goes through a /api/portal/* proxy; _lib/portal-registrations.ts
// holds the shapes.
//
// Role gate: (admin)/layout.tsx already gates on admin:execute, and every
// upstream route answers 403 to anyone who is not admin.
//
// docs/portal_ux_standard.md applies: English UI, LTR. Business, contact,
// customer and branch names are data and may be Hebrew, so they render in
// <bdi>.
// ---------------------------------------------------------------------------

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  Check,
  Copy,
  KeyRound,
  MessageCircle,
  Search,
  UserCheck,
  UserX,
} from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { QueryCountChip } from "@/components/feedback/QueryCountChip";
import {
  EmptyState,
  ErrorAlert,
  ErrorState,
  SkeletonRow,
} from "@/components/feedback/states";
import {
  useConfirm,
  type UseConfirmResult,
} from "@/components/overlays/ConfirmDialog";
import { useRovingTabList } from "@/components/a11y/useRovingTabList";
import { fetchJson } from "@/lib/http/fetchJson";
import { cn } from "@/lib/cn";
import {
  MIN_SEARCH_CHARS,
  formatWhen,
  postPortal,
  shopifyCustomerNumber,
  type ApprovedCustomer,
  type DecideResponse,
  type LoginLinkResponse,
  type PortalRequestError,
  type Registration,
  type Rows,
  type ShopifyCustomer,
} from "./_lib/portal-registrations";

const PENDING_KEY = ["admin", "portal-registrations", "pending"] as const;
const APPROVED_KEY = ["admin", "portal-approved"] as const;

type TabKey = "pending" | "login";
const TAB_KEYS: readonly TabKey[] = ["pending", "login"];
const TAB_LABEL: Record<TabKey, string> = {
  pending: "Pending",
  login: "Login link",
};

function useDebounced(value: string): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), 300);
    return () => clearTimeout(t);
  }, [value]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminPortalRegistrationsPage(): JSX.Element {
  const [tab, setTab] = useState<TabKey>("pending");
  const roving = useRovingTabList<TabKey>({
    keys: TAB_KEYS,
    activeKey: tab,
    onChange: setTab,
  });

  const pendingQuery = useQuery<Rows<Registration>>({
    queryKey: PENDING_KEY,
    queryFn: () =>
      fetchJson<Rows<Registration>>("/api/portal/registrations?status=pending"),
  });

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin · customer portal"
        title="Portal registrations"
        description="People who asked to order through the customer portal. Link each request to its Shopify customer to approve it, then send the approval on WhatsApp. Approved customers can be given a login link."
        meta={
          <QueryCountChip
            isLoading={pendingQuery.isLoading}
            isError={pendingQuery.isError}
            count={pendingQuery.data?.rows.length}
            noun="pending"
            tone="warning"
          />
        }
      />

      <div
        {...roving.tabListProps}
        aria-label="Portal registrations"
        className="flex w-fit items-center gap-1 rounded-md bg-bg-subtle/50 p-0.5"
      >
        {TAB_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            id={`portal-tab-${key}`}
            aria-controls={`portal-panel-${key}`}
            {...roving.getTabProps(key)}
            onClick={() => setTab(key)}
            data-testid={`portal-tab-${key}`}
            className={cn(
              "inline-flex h-9 items-center rounded px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
              tab === key
                ? "bg-bg text-fg shadow-sm"
                : "text-fg-muted hover:text-fg",
            )}
          >
            {TAB_LABEL[key]}
          </button>
        ))}
      </div>

      {/* Both panels stay mounted, so a typed search, a picked customer or a
          created link survives a tab switch. */}
      <div
        id="portal-panel-pending"
        role="tabpanel"
        aria-labelledby="portal-tab-pending"
        hidden={tab !== "pending"}
      >
        <PendingPanel
          query={pendingQuery}
          onShowLoginTab={() => {
            setTab("login");
            // The button that was pressed is about to be hidden; land focus
            // where the next step starts instead of on <body>.
            setTimeout(
              () => document.getElementById("portal-approved-search")?.focus(),
              0,
            );
          }}
        />
      </div>
      <div
        id="portal-panel-login"
        role="tabpanel"
        aria-labelledby="portal-tab-login"
        hidden={tab !== "login"}
      >
        <LoginLinkPanel shown={tab === "login"} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

/** A list's states, in order: loading, failed, stale (a refresh failed but the
 *  rows on screen stay usable), empty, listed. */
function QueryList<T>({
  query,
  rows,
  testId,
  errorTitle,
  staleLabel,
  empty,
  children,
}: {
  query: UseQueryResult<unknown>;
  rows: T[];
  testId: string;
  errorTitle: string;
  staleLabel: string;
  empty: ReactNode;
  children: (row: T) => ReactNode;
}): JSX.Element {
  if (query.isLoading) {
    return (
      <div
        className="space-y-2 p-5"
        aria-busy="true"
        aria-live="polite"
        data-testid={`${testId}-loading`}
      >
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }
  if (!query.data && query.isError) {
    return (
      <div className="p-5">
        <ErrorState
          title={errorTitle}
          description={query.error.message}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }
  return (
    <>
      {query.isError ? (
        <div className="border-b border-border/60 p-4">
          <ErrorAlert label={staleLabel} onRetry={() => void query.refetch()} />
        </div>
      ) : null}
      {rows.length === 0 ? (
        <div className="p-5" data-testid={`${testId}-empty`}>
          {empty}
        </div>
      ) : (
        <ul
          className="divide-y divide-border/60"
          data-testid={`${testId}-list`}
        >
          {rows.map(children)}
        </ul>
      )}
    </>
  );
}

/** A search box that owns what is typed and reports only the trimmed query,
 *  once typing pauses, so a keystroke re-renders nothing but the box.
 *  `onSearch` must be stable (a state setter, or wrapped in useCallback). */
function SearchField({
  id,
  label,
  placeholder,
  defaultValue = "",
  onSearch,
  disabled,
}: {
  id: string;
  label: string;
  placeholder: string;
  defaultValue?: string;
  onSearch: (q: string) => void;
  disabled?: boolean;
}): JSX.Element {
  const [text, setText] = useState(defaultValue);
  const q = useDebounced(text.trim());
  useEffect(() => {
    onSearch(q);
  }, [q, onSearch]);
  return (
    <>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint"
          aria-hidden
        />
        <input
          id={id}
          type="search"
          className="input pl-9"
          placeholder={placeholder}
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
          data-testid={id}
        />
      </div>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-fg">{children}</dd>
    </div>
  );
}

function Phone({ value }: { value: string }): JSX.Element {
  return (
    <span className="font-mono tabular-nums" dir="ltr">
      {value}
    </span>
  );
}

/** "name · city · N orders" — the three facts the search promises. */
function CustomerSummary({
  customer,
}: {
  customer: ShopifyCustomer;
}): JSX.Element {
  return (
    <span className="min-w-0">
      <span className="font-medium text-fg-strong">
        <bdi>{customer.name}</bdi>
      </span>
      {customer.city ? (
        <span className="text-fg-muted">
          {" · "}
          <bdi>{customer.city}</bdi>
        </span>
      ) : null}
      <span className="text-fg-muted">
        {" · "}
        {customer.orders_count} {customer.orders_count === 1 ? "order" : "orders"}
      </span>
    </span>
  );
}

/** Whether the registering phone is on this Shopify customer's record. A
 *  mismatch is not an error (many records carry no phone), so it stays neutral. */
function PhoneMatchBadge({ matches }: { matches: boolean }): JSX.Element {
  return (
    <Badge tone={matches ? "success" : "neutral"} dot>
      {matches ? "Phone matches" : "Phone does not match"}
    </Badge>
  );
}

function RowError({
  error,
  onRefresh,
  testId,
}: {
  error: PortalRequestError;
  onRefresh: () => void;
  testId: string;
}): JSX.Element {
  return (
    <div
      role="alert"
      className="mt-3 flex flex-wrap items-start justify-between gap-2 rounded border border-danger/40 bg-danger-softer px-3 py-2 text-sm text-danger-fg"
      data-testid={testId}
    >
      <div className="min-w-0">
        <div>{error.message}</div>
        {error.detail ? (
          <div className="mt-0.5 text-xs text-fg-muted">
            Details: <bdi>{error.detail}</bdi>
          </div>
        ) : null}
      </div>
      {error.stale ? (
        <button type="button" className="btn btn-outline" onClick={onRefresh}>
          Refresh list
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pending tab
// ---------------------------------------------------------------------------

type DecideVars =
  | { decision: "approve"; customer: ShopifyCustomer }
  | { decision: "reject" };

/** A registration's badge [tone, label], by what was decided on this visit. */
const REGISTRATION_BADGE = {
  pending: ["warning", "Pending"],
  approve: ["success", "Approved"],
  reject: ["neutral", "Rejected"],
} as const;

function PendingPanel({
  query,
  onShowLoginTab,
}: {
  query: UseQueryResult<Rows<Registration>>;
  onShowLoginTab: () => void;
}): JSX.Element {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  // A row decided on this visit keeps its place after the refetch drops it
  // from the pending list: an approved row's WhatsApp link is the next step.
  const [kept, setKept] = useState<Record<string, Registration>>({});

  const rows = useMemo(() => {
    const listed = query.data?.rows ?? [];
    const listedIds = new Set(listed.map((r) => r.id));
    const extra = Object.values(kept).filter((r) => !listedIds.has(r.id));
    // The request that has waited longest comes first.
    return [...listed, ...extra].sort(
      (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
    );
  }, [query.data, kept]);

  const refreshList = () =>
    void queryClient.invalidateQueries({ queryKey: PENDING_KEY });

  const onDecided = (row: Registration, decision: DecideVars["decision"]) => {
    setKept((prev) => ({ ...prev, [row.id]: row }));
    refreshList();
    if (decision === "approve") {
      void queryClient.invalidateQueries({ queryKey: APPROVED_KEY });
    }
  };

  return (
    <SectionCard
      eyebrow="Access requests"
      title="Pending registrations"
      description="Oldest first. Search for the Shopify customer each request belongs to, pick it, then approve."
      contentClassName="p-0"
    >
      {dialog}
      <QueryList
        query={query}
        rows={rows}
        testId="portal-registrations"
        errorTitle="We couldn't load the registrations"
        staleLabel="Could not refresh the list"
        empty={
          <EmptyState
            title="No pending registrations"
            description="When a phone the portal doesn't know asks to log in, its request appears here for approval. You can give an approved customer a login link from the Login link tab."
            icon={
              <UserCheck className="h-5 w-5 text-fg-faint" strokeWidth={1.5} />
            }
            action={
              <button
                type="button"
                className="btn btn-outline"
                onClick={onShowLoginTab}
              >
                Go to login links
              </button>
            }
          />
        }
      >
        {(row) => (
          <RegistrationItem
            key={row.id}
            row={row}
            confirm={confirm}
            onDecided={onDecided}
            onRefreshList={refreshList}
          />
        )}
      </QueryList>
    </SectionCard>
  );
}

function RegistrationItem({
  row,
  confirm,
  onDecided,
  onRefreshList,
}: {
  row: Registration;
  confirm: UseConfirmResult["confirm"];
  onDecided: (row: Registration, decision: DecideVars["decision"]) => void;
  onRefreshList: () => void;
}): JSX.Element {
  const id = row.id;
  const [picked, setPicked] = useState<ShopifyCustomer | null>(null);

  const decide = useMutation<DecideResponse, PortalRequestError, DecideVars>({
    mutationFn: (vars) =>
      postPortal<DecideResponse>(
        `/api/portal/registrations/${encodeURIComponent(id)}/decide`,
        vars.decision === "approve"
          ? { decision: "approve", shopify_customer_id: vars.customer.id }
          : { decision: "reject" },
        vars.decision,
      ),
    onSuccess: (_res, vars) => onDecided(row, vars.decision),
  });

  const approve = async () => {
    if (!picked) return;
    const ok = await confirm({
      title: "Approve this registration?",
      description: (
        <>
          <Phone value={row.wa_phone} /> (<bdi>{row.business_name}</bdi>) will
          be linked to the Shopify customer <bdi>{picked.name}</bdi>
          {picked.city ? (
            <>
              , <bdi>{picked.city}</bdi>
            </>
          ) : null}{" "}
          (#{shopifyCustomerNumber(picked.id)}).{" "}
          {picked.phone_matches
            ? "The phone is on that customer's Shopify record."
            : "The phone is not on that customer's Shopify record."}{" "}
          Check it is the right branch: the portal will treat this phone as
          that customer.
        </>
      ),
      confirmLabel: "Approve registration",
    });
    if (!ok) return;
    decide.mutate({ decision: "approve", customer: picked });
  };

  const reject = async () => {
    const ok = await confirm({
      title: "Reject this registration?",
      description: (
        <>
          <Phone value={row.wa_phone} /> (<bdi>{row.business_name}</bdi>) will
          not be given access to the portal.
        </>
      ),
      confirmLabel: "Reject registration",
      tone: "danger",
    });
    if (!ok) return;
    decide.mutate({ decision: "reject" });
  };

  const acting = decide.isPending ? decide.variables?.decision : undefined;
  const [tone, label] =
    REGISTRATION_BADGE[decide.isSuccess ? decide.variables.decision : "pending"];

  return (
    <li className="px-5 py-4 sm:px-6" data-testid={`portal-registration-${id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-semibold text-fg-strong">
            <bdi>{row.business_name || "Unnamed business"}</bdi>
          </div>
          <div className="mt-0.5 text-sm text-fg-muted">
            <bdi>{row.branch_city || "No branch or city given"}</bdi>
          </div>
        </div>
        <Badge tone={tone} dot>
          {label}
        </Badge>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Phone">
          <Phone value={row.wa_phone} />
        </Field>
        <Field label="Contact">
          <bdi>{row.contact_name || "—"}</bdi>
        </Field>
        <Field label="Suggested customer">
          {row.suggested_customer_id ? (
            <span className="font-mono">
              #{shopifyCustomerNumber(row.suggested_customer_id)}
            </span>
          ) : (
            <span className="text-fg-subtle">None</span>
          )}
        </Field>
        <Field label="Requested">
          <time dateTime={row.created_at}>{formatWhen(row.created_at)}</time>
        </Field>
      </dl>

      {decide.isSuccess ? (
        <DecidedNote
          id={id}
          decided={decide.variables}
          waLink={decide.data?.wa_link ?? null}
        />
      ) : (
        <div className="mt-4">
          <CustomerPicker
            registrationId={id}
            suggestedId={row.suggested_customer_id}
            picked={picked}
            onPick={setPicked}
            disabled={decide.isPending}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!picked || decide.isPending}
              title={picked ? undefined : "Pick a customer first"}
              onClick={() => void approve()}
              data-testid={`portal-approve-${id}`}
            >
              <UserCheck className="h-4 w-4" strokeWidth={2} aria-hidden />
              {acting === "approve" ? "Approving…" : "Approve"}
            </button>
            <button
              type="button"
              className="btn btn-ghost text-danger-fg"
              disabled={decide.isPending}
              onClick={() => void reject()}
              data-testid={`portal-reject-${id}`}
            >
              {acting === "reject" ? "Rejecting…" : "Reject"}
            </button>
            {!picked ? (
              <span className="text-xs text-fg-subtle">
                Pick a customer to approve.
              </span>
            ) : null}
          </div>
          {decide.isError ? (
            <RowError
              error={decide.error}
              onRefresh={onRefreshList}
              testId={`portal-decide-error-${id}`}
            />
          ) : null}
        </div>
      )}
    </li>
  );
}

function DecidedNote({
  id,
  decided,
  waLink,
}: {
  id: string;
  decided: DecideVars;
  waLink: string | null;
}): JSX.Element {
  if (decided.decision === "reject") {
    return (
      <p
        role="status"
        className="mt-4 text-sm text-fg-muted"
        data-testid={`portal-rejected-note-${id}`}
      >
        Rejected. This phone was not given access.
      </p>
    );
  }
  return (
    <div
      role="status"
      className="mt-4 flex flex-col gap-3 rounded-md border border-success/40 bg-success-softer p-4 sm:flex-row sm:items-center sm:justify-between"
      data-testid={`portal-approved-note-${id}`}
    >
      <div className="text-sm text-success-fg">
        <span className="font-semibold">Approved.</span> Linked to{" "}
        <bdi>{decided.customer.name}</bdi>. Let the customer know on WhatsApp.
      </div>
      {waLink ? (
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary shrink-0"
          title="Opens WhatsApp with the approval message typed. You press send."
          data-testid={`portal-send-approval-${id}`}
        >
          <MessageCircle className="h-4 w-4" strokeWidth={2} aria-hidden />
          Send approval on WhatsApp
        </a>
      ) : (
        <span className="text-xs text-fg-muted">
          No WhatsApp link came back. Tell the customer yourself.
        </span>
      )}
    </div>
  );
}

function CustomerPicker({
  registrationId,
  suggestedId,
  picked,
  onPick,
  disabled,
}: {
  registrationId: string;
  suggestedId: string | null;
  picked: ShopifyCustomer | null;
  onPick: (customer: ShopifyCustomer | null) => void;
  disabled: boolean;
}): JSX.Element {
  const [q, setQ] = useState("");
  // Keyed by registration too: phone_matches is about this request's phone.
  const search = useQuery<Rows<ShopifyCustomer>>({
    queryKey: ["admin", "portal-customer-search", registrationId, q],
    queryFn: () =>
      fetchJson<Rows<ShopifyCustomer>>(
        `/api/portal/customer-search?q=${encodeURIComponent(q)}&registration_id=${encodeURIComponent(registrationId)}`,
      ),
    enabled: q.length >= MIN_SEARCH_CHARS && !picked,
    placeholderData: keepPreviousData,
    // The error below has its own Retry.
    retry: false,
  });

  if (picked) {
    return (
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-success/40 bg-success-softer px-3 py-2 text-sm"
        data-testid={`portal-picked-${registrationId}`}
      >
        <Check
          className="h-4 w-4 shrink-0 text-success"
          strokeWidth={2.5}
          aria-hidden
        />
        <CustomerSummary customer={picked} />
        <span className="font-mono text-xs text-fg-muted">
          #{shopifyCustomerNumber(picked.id)}
        </span>
        <PhoneMatchBadge matches={picked.phone_matches} />
        <button
          type="button"
          className="btn btn-ghost ml-auto"
          onClick={() => onPick(null)}
          disabled={disabled}
        >
          Change
        </button>
      </div>
    );
  }

  const results = search.data?.rows ?? [];
  let status: ReactNode = null;
  if (q.length > 0 && q.length < MIN_SEARCH_CHARS) {
    status = (
      <p className="field-hint">
        Type at least {MIN_SEARCH_CHARS} characters to search.
      </p>
    );
  } else if (q.length < MIN_SEARCH_CHARS) {
    status = null;
  } else if (search.isError) {
    status = (
      <ErrorAlert
        label="Could not search Shopify customers"
        onRetry={() => void search.refetch()}
      />
    );
  } else if (results.length === 0) {
    // Nothing yet, or the last search found nothing and this one is on its way.
    status =
      search.isLoading || search.isPlaceholderData ? (
        <p className="field-hint">Searching Shopify customers…</p>
      ) : (
        <p className="field-hint">
          No Shopify customer matches “<bdi>{q}</bdi>”.
        </p>
      );
  } else {
    status = (
      <>
        {search.isPlaceholderData ? (
          <p className="field-hint mb-2">Searching…</p>
        ) : null}
        <ul
          className="divide-y divide-border/60 overflow-hidden rounded border border-border/70"
          data-testid={`portal-customer-results-${registrationId}`}
        >
          {results.map((customer) => (
            <li key={customer.id}>
              <button
                type="button"
                className="flex min-h-[40px] w-full flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-left text-sm transition-colors hover:bg-bg-subtle focus-visible:bg-bg-subtle focus-visible:outline-none"
                onClick={() => onPick(customer)}
                data-testid={`portal-customer-option-${registrationId}-${shopifyCustomerNumber(customer.id)}`}
              >
                <CustomerSummary customer={customer} />
                <PhoneMatchBadge matches={customer.phone_matches} />
                {customer.id === suggestedId ? (
                  <Badge tone="accent">Suggested</Badge>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <div>
      {/* Seeded with the last query, so "Change" after a pick comes back to
          the same results. */}
      <SearchField
        id={`portal-customer-search-${registrationId}`}
        label="Shopify customer"
        placeholder="Search Shopify customers"
        defaultValue={q}
        onSearch={setQ}
        disabled={disabled}
      />
      <div className="mt-2" aria-live="polite">
        {status}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Login link tab
// ---------------------------------------------------------------------------

function LoginLinkPanel({ shown }: { shown: boolean }): JSX.Element {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [q, setQ] = useState("");
  // A revoked row leaves the list on the refresh; this line says it worked,
  // until the search changes.
  const [revokedName, setRevokedName] = useState<string | null>(null);
  const onSearch = useCallback((next: string) => {
    setQ(next);
    setRevokedName(null);
  }, []);
  const searching = q.length >= MIN_SEARCH_CHARS;
  const approved = useQuery<Rows<ApprovedCustomer>>({
    queryKey: [...APPROVED_KEY, q],
    queryFn: () =>
      fetchJson<Rows<ApprovedCustomer>>(
        `/api/portal/approved?q=${encodeURIComponent(q)}`,
      ),
    // An approval invalidates this list; while the tab is hidden it waits.
    enabled: searching && shown,
    placeholderData: keepPreviousData,
  });
  // Links created on this visit, by access: a new search does not lose them.
  const [links, setLinks] = useState<Record<string, LoginLinkResponse>>({});

  const refreshList = () =>
    void queryClient.invalidateQueries({ queryKey: APPROVED_KEY });

  return (
    <SectionCard
      eyebrow="Approved customers"
      title="Login links"
      description="Create a login link for an approved customer, or revoke their access. Nothing is sent from here: copy the link, or open WhatsApp with it typed and press send yourself."
      contentClassName="p-0"
    >
      {dialog}
      <div className="border-b border-border/60 px-5 py-4 sm:px-6">
        <SearchField
          id="portal-approved-search"
          label="Search approved customers"
          placeholder="Search"
          onSearch={onSearch}
        />
        {approved.isFetching && approved.isPlaceholderData ? (
          <p className="field-hint">Searching…</p>
        ) : null}
      </div>
      {revokedName ? (
        <div
          role="status"
          className="border-b border-border/60 px-5 py-3 text-sm text-fg-muted sm:px-6"
          data-testid="portal-revoke-notice"
        >
          Access revoked for{" "}
          <bdi className="font-medium text-fg">{revokedName}</bdi>.
        </div>
      ) : null}
      {searching ? (
        <QueryList
          query={approved}
          rows={approved.data?.rows ?? []}
          testId="portal-approved"
          errorTitle="We couldn't load approved customers"
          staleLabel="Could not refresh the results"
          empty={
            <EmptyState
              title="No approved customer matches"
              description="Check the spelling. A customer who registered appears here once the registration is approved on the Pending tab. Revoked customers are not listed."
            />
          }
        >
          {(row) => (
            <ApprovedItem
              key={row.access_id}
              row={row}
              link={links[row.access_id] ?? null}
              confirm={confirm}
              onCreated={(link) =>
                setLinks((prev) => ({ ...prev, [row.access_id]: link }))
              }
              onRevoked={() => {
                setRevokedName(row.display_name || row.wa_phone);
                refreshList();
              }}
              onRefreshList={refreshList}
            />
          )}
        </QueryList>
      ) : (
        <div className="p-5">
          <EmptyState
            title="Search for an approved customer"
            description={`Type at least ${MIN_SEARCH_CHARS} characters above. Only customers approved for the portal are listed.`}
            icon={<Search className="h-5 w-5 text-fg-faint" strokeWidth={1.5} />}
          />
        </div>
      )}
    </SectionCard>
  );
}

function ApprovedItem({
  row,
  link,
  confirm,
  onCreated,
  onRevoked,
  onRefreshList,
}: {
  row: ApprovedCustomer;
  link: LoginLinkResponse | null;
  confirm: UseConfirmResult["confirm"];
  onCreated: (link: LoginLinkResponse) => void;
  onRevoked: () => void;
  onRefreshList: () => void;
}): JSX.Element {
  const id = row.access_id;

  const create = useMutation<LoginLinkResponse, PortalRequestError, void>({
    mutationFn: () =>
      postPortal<LoginLinkResponse>(
        "/api/portal/login-link",
        { access_id: id },
        "login-link",
      ),
    onSuccess: (created) => onCreated(created),
  });

  const revoke = useMutation<unknown, PortalRequestError, void>({
    mutationFn: () =>
      postPortal(
        `/api/portal/access/${encodeURIComponent(id)}/revoke`,
        {},
        "revoke",
      ),
    onSuccess: () => onRevoked(),
  });

  const revokeAccess = async () => {
    const ok = await confirm({
      title: "Revoke portal access?",
      description: (
        <>
          <bdi>{row.display_name || "This customer"}</bdi> (
          <Phone value={row.wa_phone} />) will no longer be approved for the
          customer portal.
        </>
      ),
      confirmLabel: "Revoke access",
      tone: "danger",
    });
    if (!ok) return;
    revoke.mutate();
  };

  const busy = create.isPending || revoke.isPending;

  return (
    <li className="px-5 py-4 sm:px-6" data-testid={`portal-approved-row-${id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-semibold text-fg-strong">
            <bdi>{row.display_name || "Unnamed customer"}</bdi>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
            {row.branch ? <bdi>{row.branch}</bdi> : null}
            <Phone value={row.wa_phone} />
            <span className="font-mono text-xs">
              Shopify #{shopifyCustomerNumber(row.shopify_customer_id)}
            </span>
            <span>Approved {formatWhen(row.approved_at)}</span>
            <Badge tone="neutral">
              {row.source === "registration"
                ? "Via registration"
                : "Existing mapping"}
            </Badge>
          </div>
        </div>
        {revoke.isSuccess ? (
          <Badge tone="neutral" dot>
            Revoked
          </Badge>
        ) : (
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => create.mutate()}
              disabled={busy}
              data-testid={`portal-create-link-${id}`}
            >
              <KeyRound className="h-4 w-4" strokeWidth={2} aria-hidden />
              {create.isPending
                ? "Creating…"
                : link
                  ? "Create another link"
                  : "Create login link"}
            </button>
            <button
              type="button"
              className="btn btn-ghost text-danger-fg"
              onClick={() => void revokeAccess()}
              disabled={busy}
              data-testid={`portal-revoke-${id}`}
            >
              <UserX className="h-4 w-4" strokeWidth={2} aria-hidden />
              {revoke.isPending ? "Revoking…" : "Revoke access"}
            </button>
          </div>
        )}
      </div>

      {create.isError ? (
        <RowError
          error={create.error}
          onRefresh={onRefreshList}
          testId={`portal-link-error-${id}`}
        />
      ) : null}
      {revoke.isError ? (
        <RowError
          error={revoke.error}
          onRefresh={onRefreshList}
          testId={`portal-revoke-error-${id}`}
        />
      ) : null}

      {link && !revoke.isSuccess ? (
        <LoginLinkBox key={link.url} id={id} link={link} />
      ) : null}
    </li>
  );
}

/** A created link, to copy or to open in WhatsApp. Keyed by its URL, so a new
 *  link starts with a fresh Copy button. */
function LoginLinkBox({
  id,
  link,
}: {
  id: string;
  link: LoginLinkResponse;
}): JSX.Element {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (copy !== "copied") return;
    const t = setTimeout(() => setCopy("idle"), 2000);
    return () => clearTimeout(t);
  }, [copy]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  };

  return (
    <div className="mt-3" data-testid={`portal-login-link-${id}`}>
      <label htmlFor={`portal-login-url-${id}`} className="label">
        Login link
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          id={`portal-login-url-${id}`}
          readOnly
          value={link.url}
          dir="ltr"
          className="input font-mono text-xs"
          onFocus={(e) => e.currentTarget.select()}
          data-testid={`portal-login-url-${id}`}
        />
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => void copyLink()}
            data-testid={`portal-copy-link-${id}`}
          >
            {copy === "copied" ? (
              <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            ) : (
              <Copy className="h-4 w-4" strokeWidth={2} aria-hidden />
            )}
            {copy === "copied" ? "Copied" : "Copy"}
          </button>
          <a
            href={link.wa_link}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline"
            title="Opens WhatsApp with the link typed. You press send."
            data-testid={`portal-open-whatsapp-${id}`}
          >
            <MessageCircle className="h-4 w-4" strokeWidth={2} aria-hidden />
            Open WhatsApp
          </a>
        </div>
      </div>
      <p className="mt-1 text-xs text-fg-muted">
        Each link works once and stays valid 24 hours.
      </p>
      {copy === "failed" ? (
        <p className="field-error" role="alert">
          Could not copy. Select the link and copy it by hand.
        </p>
      ) : null}
    </div>
  );
}
