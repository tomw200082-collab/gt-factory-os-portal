"use client";

// Data access for the sales workspace.
//
// Reads and writes go through the portal's one door: fetch → route handler →
// proxyRequest → Fastify. No Supabase client for data, ever.

import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { RULE_MESSAGES, UI } from "./labels";
import type { ReportPayload } from "./report/types";
import type {
  ActivityRow,
  AttentionRow,
  LeadEventRow,
  TodayPayload,
  IdentityAction,
  IdentityResult,
  IdentityReview,
  OrderDetail,
  OrdersPage,
  OrgCircle,
  OrgContacts,
  OrgDetail,
  OrgFilter,
  OrgSearchHit,
  RiverChip,
  RiverPage,
  OrgSort,
  OrgsPage,
  OutcomeResult,
  OutreachChannel,
  SalesLeadRow,
  SalesTaskRow,
  SalesTaskScope,
  QueueSettings,
  SalesSettings,
  WeekStats,
  WhatsappTemplates,
} from "./types";

/** A failed sales call, carrying the server's SALES_ token when it sent one. */
export class SalesApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "SalesApiError";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  // A write that never left the phone is not a queue that failed to load.
  // Reporting "לא הצלחנו לטעון את התור" after a tap on "אבוד" describes the
  // wrong half of the app and invites the user to retry the wrong thing.
  const isWrite = Boolean(init?.method && init.method !== "GET");

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { Accept: "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new SalesApiError(isWrite ? UI.saveFailed : UI.queueError);
  }

  if (!res.ok) {
    let code: string | undefined;
    let message: string | undefined;
    try {
      const body = (await res.json()) as { code?: string; error?: string };
      code = body.code;
      message = body.error;
    } catch {
      /* a non-JSON error body still deserves a readable message */
    }
    // A rule the database refused reads in Hebrew; anything else degrades to a
    // generic sentence rather than showing an English code to the user.
    const text =
      (code && RULE_MESSAGES[code]) ||
      (code ? UI.saveFailed : message || (isWrite ? UI.saveFailed : UI.genericError));
    throw new SalesApiError(text, code, res.status);
  }

  return (await res.json()) as T;
}

function jsonBody(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

// ---- keys ------------------------------------------------------------------

export const salesKeys = {
  all: ["sales"] as const,
  today: (scope?: string) => ["sales", "today", scope ?? "all"] as const,
  attention: () => ["sales", "attention"] as const,
  activity: (limit: number) => ["sales", "activity", limit] as const,
  leads: () => ["sales", "leads"] as const,
  events: (leadId: string) => ["sales", "events", leadId] as const,
  orgsPage: (filter: OrgFilter, sort: OrgSort) => ["sales", "orgs", "page", filter, sort] as const,
  orgSearch: (q: string) => ["sales", "orgs", "search", q] as const,
  org: (id: string) => ["sales", "org", id] as const,
  orgPart: (id: string, part: string, ...rest: string[]) => ["sales", "org", id, part, ...rest] as const,
  identityReview: () => ["sales", "identity-review"] as const,
  weekStats: () => ["sales", "week-stats"] as const,
  settings: () => ["sales", "settings"] as const,
  report: () => ["sales", "report"] as const,
  tasks: (scope: SalesTaskScope) => ["sales", "tasks", scope] as const,
};

// ---- reads -----------------------------------------------------------------

/**
 * The queue, and the shape it was ordered by.
 *
 * The payload carries `queue` because the cap is a product decision the admin
 * owns (0326) and the rows arrive complete: the screen defers the remainder
 * and says how many, rather than the server hiding them and the count lying.
 */
export function useToday(scope?: string): UseQueryResult<TodayPayload, SalesApiError> {
  // "mine or unclaimed" is decided server-side (queries_handler); the portal
  // only says whose queue it is asking for. The parameter has existed since v1
  // and had no caller until now (audit P0-2).
  const url = scope ? `/api/sales/today?assignee=${encodeURIComponent(scope)}` : "/api/sales/today";
  return useQuery({
    queryKey: salesKeys.today(scope),
    queryFn: async () => await request<TodayPayload>(url),
    staleTime: 30_000,
  });
}

export function useAttention(): UseQueryResult<AttentionRow[], SalesApiError> {
  return useQuery({
    queryKey: salesKeys.attention(),
    queryFn: async () => (await request<{ rows: AttentionRow[] }>("/api/sales/attention")).rows,
    staleTime: 30_000,
  });
}

export function useTasks(scope: SalesTaskScope): UseQueryResult<SalesTaskRow[], SalesApiError> {
  return useQuery({
    queryKey: salesKeys.tasks(scope),
    queryFn: async () => (await request<{ rows: SalesTaskRow[] }>(
      `/api/sales/tasks?scope=${encodeURIComponent(scope)}`)).rows,
    staleTime: 30_000,
  });
}

export function useActivity(limit = 50): UseQueryResult<ActivityRow[], SalesApiError> {
  return useQuery({
    queryKey: salesKeys.activity(limit),
    queryFn: async () =>
      (await request<{ rows: ActivityRow[] }>(`/api/sales/activity?limit=${limit}`)).rows,
    staleTime: 30_000,
  });
}

export function useLeads(): UseQueryResult<SalesLeadRow[], SalesApiError> {
  return useQuery({
    queryKey: salesKeys.leads(),
    queryFn: async () => (await request<{ rows: SalesLeadRow[] }>("/api/sales/leads")).rows,
    staleTime: 30_000,
  });
}

export function useLeadEvents(leadId: string | null): UseQueryResult<LeadEventRow[], SalesApiError> {
  return useQuery({
    queryKey: salesKeys.events(leadId ?? "none"),
    enabled: Boolean(leadId),
    queryFn: async () =>
      (await request<{ rows: LeadEventRow[] }>(`/api/sales/leads/${leadId}/events`)).rows,
  });
}

/**
 * The business list, one server page at a time (GT Pulse Unit B).
 *
 * Filter, sort and paging happen in the API over ~1,300 orgs; the browser holds
 * only the pages it has asked for. The previous pages stay on screen while a new
 * filter loads, so a tap on a chip does not blank the list.
 */
export function useOrgsPage(filter: OrgFilter, sort: OrgSort) {
  return useInfiniteQuery<OrgsPage, SalesApiError>({
    queryKey: salesKeys.orgsPage(filter, sort),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      await request<OrgsPage>(
        `/api/sales/orgs/page?filter=${filter}&sort=${sort}&limit=50` +
          (pageParam ? `&cursor=${encodeURIComponent(String(pageParam))}` : ""),
      ),
    getNextPageParam: (last) => last.next,
    placeholderData: keepPreviousData,
    retry: retryServerErrors,
    staleTime: 30_000,
  });
}

/** The lean {id, name, phone} search. Two characters or more; below that, nothing is asked. */
export function useOrgSearch(query: string): UseQueryResult<OrgSearchHit[], SalesApiError> {
  const q = query.trim();
  return useQuery({
    queryKey: salesKeys.orgSearch(q),
    enabled: q.length >= 2,
    queryFn: async () => {
      const hits = await request<unknown>(`/api/sales/orgs/search?q=${encodeURIComponent(q)}`);
      return Array.isArray(hits) ? (hits as OrgSearchHit[]) : [];
    },
    retry: retryServerErrors,
    staleTime: 30_000,
  });
}

/** A 4xx is an answer, not a hiccup: retrying a 403 only delays the forbidden state. */
function retryServerErrors(count: number, error: SalesApiError): boolean {
  if (error.status && error.status < 500) return false;
  return count < 2;
}

/** One business (Unit B). Everything else on the workspace waits for this to succeed. */
export function useOrg(id: string): UseQueryResult<OrgDetail, SalesApiError> {
  return useQuery({
    queryKey: salesKeys.org(id),
    queryFn: async () => await request<OrgDetail>(`/api/sales/orgs/${encodeURIComponent(id)}`),
    retry: retryServerErrors,
    staleTime: 30_000,
  });
}

export function useOrgContacts(id: string, enabled: boolean): UseQueryResult<OrgContacts, SalesApiError> {
  return useQuery({
    queryKey: salesKeys.orgPart(id, "contacts"),
    enabled,
    queryFn: async () => await request<OrgContacts>(`/api/sales/orgs/${encodeURIComponent(id)}/contacts`),
    retry: retryServerErrors,
    staleTime: 30_000,
  });
}

export function useOrgCircle(id: string, enabled: boolean): UseQueryResult<OrgCircle, SalesApiError> {
  return useQuery({
    queryKey: salesKeys.orgPart(id, "circle"),
    enabled,
    queryFn: async () => await request<OrgCircle>(`/api/sales/orgs/${encodeURIComponent(id)}/circle`),
    retry: retryServerErrors,
    staleTime: 60_000,
  });
}

/** The business's river, a chip at a time, 25 to a page. */
export function useOrgRiver(id: string, chip: RiverChip, enabled: boolean) {
  return useInfiniteQuery<RiverPage, SalesApiError>({
    queryKey: salesKeys.orgPart(id, "river", chip),
    enabled,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      await request<RiverPage>(
        `/api/sales/orgs/${encodeURIComponent(id)}/river?chip=${chip}&limit=25` +
          (pageParam ? `&cursor=${encodeURIComponent(String(pageParam))}` : ""),
      ),
    getNextPageParam: (last) => last.next,
    placeholderData: keepPreviousData,
    retry: retryServerErrors,
    staleTime: 30_000,
  });
}

/** Every order of the business, newest first, 50 to a page (the month sheet walks it). */
export function useOrgOrders(id: string, enabled: boolean) {
  return useInfiniteQuery<OrdersPage, SalesApiError>({
    queryKey: salesKeys.orgPart(id, "orders"),
    enabled,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      await request<OrdersPage>(
        `/api/sales/orgs/${encodeURIComponent(id)}/orders?limit=50` +
          (pageParam ? `&cursor=${encodeURIComponent(String(pageParam))}` : ""),
      ),
    getNextPageParam: (last) => last.next,
    retry: retryServerErrors,
    staleTime: 5 * 60_000, // mirror data with its own "as of"; a month sheet reopened soon pages nothing again
  });
}

/** One order and its lines, with when the mirror read it. */
export function useOrder(id: string, gid: string | null): UseQueryResult<OrderDetail, SalesApiError> {
  return useQuery({
    queryKey: salesKeys.orgPart(id, "order", gid ?? "none"),
    enabled: Boolean(gid),
    queryFn: async () =>
      await request<OrderDetail>(`/api/sales/orgs/${encodeURIComponent(id)}/orders/${encodeURIComponent(gid ?? "")}`),
    retry: retryServerErrors,
    staleTime: 5 * 60_000,
  });
}

export function useWeekStats(): UseQueryResult<WeekStats, SalesApiError> {
  return useQuery({
    queryKey: salesKeys.weekStats(),
    queryFn: async () => (await request<{ stats: WeekStats }>("/api/sales/week-stats")).stats,
    staleTime: 60_000,
  });
}

export function useSettings(enabled = true): UseQueryResult<SalesSettings, SalesApiError> {
  return useQuery({
    queryKey: salesKeys.settings(),
    enabled,
    queryFn: async () => request<SalesSettings>("/api/sales/settings"),
    staleTime: 5 * 60_000,
  });
}

/**
 * The sales report (tranche 202). The blob is large and changes every few minutes at most, so it is
 * read once a minute at the fastest, re-read every five, and again when the viewer comes back to the
 * tab. A 4xx is an answer (a rep is refused); a 5xx is retried once, quickly, before the error card.
 */
export function useSalesReport(enabled = true): UseQueryResult<ReportPayload, SalesApiError> {
  return useQuery({
    queryKey: salesKeys.report(),
    enabled,
    queryFn: async () => request<ReportPayload>("/api/sales/report"),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
    retry: shouldRetryReport,
    retryDelay: 600,
  });
}

/** One quick retry for a server error or a dropped connection; a refusal (401 signed out, 403 not a manager) is an answer. */
export function shouldRetryReport(count: number, error: SalesApiError): boolean {
  if (error.status && error.status < 500) return false;
  return count < 1;
}

// ---- writes ----------------------------------------------------------------

/** Every sales mutation invalidates the whole sales tree: the queue, the table
 *  and the org list all describe the same lead from different angles. */
function useSalesMutation<TVars, TData>(
  fn: (vars: TVars) => Promise<TData>,
  opts: { onSettledExtra?: () => void } = {},
): UseMutationResult<TData, SalesApiError, TVars> {
  const qc = useQueryClient();
  return useMutation<TData, SalesApiError, TVars>({
    mutationFn: fn,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: salesKeys.all });
      opts.onSettledExtra?.();
    },
  });
}

/** 0324: moving a lead to `working` leaves it carrying a next touch — either
 *  one it already has, or this one, set in the same transaction. Without either
 *  the database refuses with SALES_NEXT_TOUCH_REQUIRED. */
export function useSetStatus(leadId: string) {
  return useSalesMutation<
    { status: "working" | "lost"; reason?: string | null; next_touch_at?: string | null },
    unknown
  >((vars) => request(`/api/sales/leads/${leadId}/status`, jsonBody(vars)));
}

export function useAddNote(leadId: string) {
  return useSalesMutation<{ note: string }, unknown>((vars) =>
    request(`/api/sales/leads/${leadId}/note`, jsonBody(vars)),
  );
}

/**
 * Push a lead's next touch out, optimistically.
 *
 * Postponing is the same gesture as answering — the card should leave the
 * queue on the tap, not after a round trip. This was the one write in the loop
 * that waited, so "דחה" felt broken on a slow connection while every other
 * action felt instant; the row comes back if the write fails (gate P1).
 */
export function useSetNextTouch(leadId: string) {
  const qc = useQueryClient();
  return useMutation<
    unknown,
    SalesApiError,
    { at: string },
    { previous: Array<[readonly unknown[], TodayPayload | undefined]> }
  >({
    mutationFn: (vars) => request(`/api/sales/leads/${leadId}/next-touch`, jsonBody(vars)),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: TODAY_PREFIX });
      return { previous: dropFromTodayCaches(qc, leadId) };
    },
    onError: (_err, _vars, context) => {
      restoreTodayCaches(qc, context?.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: salesKeys.all });
    },
  });
}

/**
 * Hand a lead to somebody, with the date it is due back.
 *
 * The date is not optional in the UI even though the contract allows it: an
 * assignment without a next action is a to-do that rots (audit P1-2), so the
 * picker collects one and this passes it through in the same transaction.
 */
export function useAssign(leadId: string) {
  return useSalesMutation<{ assignee: string; next_touch_at?: string | null }, unknown>((vars) =>
    request(`/api/sales/leads/${leadId}/assign`, jsonBody(vars)),
  );
}

/**
 * Hand over a batch in one call.
 *
 * 188 leads could not be distributed one drawer at a time (audit P0-2), and
 * doing it as N requests would leave a half-assigned backlog on any failure.
 * sales_core.bulk_assign is one transaction with the roster checked once.
 */
export function useBulkAssign() {
  return useSalesMutation<
    { lead_ids: string[]; assignee: string; next_touch_at?: string | null },
    { assigned: number }
  >((vars) => request("/api/sales/bulk-assign", jsonBody(vars)));
}

/** The managers' review queue: orgs whose Shopify link waits for a decision. */
export function useIdentityReview(enabled: boolean): UseQueryResult<IdentityReview, SalesApiError> {
  return useQuery({
    queryKey: salesKeys.identityReview(),
    enabled,
    queryFn: async () => await request<IdentityReview>("/api/sales/identity-review"),
    retry: retryServerErrors,
    staleTime: 15_000,
  });
}

/** A manager's identity decision: one transaction writes the link, the event and closes the task. */
export function useResolveIdentity() {
  return useSalesMutation<{ orgId: string; action: IdentityAction; customer_gid?: string; expected_holder?: string | null }, IdentityResult>(
    ({ orgId, ...body }) => request(`/api/sales/orgs/${encodeURIComponent(orgId)}/identity`, jsonBody(body)),
  );
}

/** A manager's decision on one contact that awaits review. */
export function useContactAction() {
  return useSalesMutation<{ contactId: string; action: "verify" | "reject" }, { contact_id: string }>(
    ({ contactId, action }) =>
      request(`/api/sales/contacts/${encodeURIComponent(contactId)}/${action}`, jsonBody({})),
  );
}

/** One owner for many businesses, in one transaction (managers; T9). */
export function useSetOrgOwner() {
  return useSalesMutation<{ org_ids: string[]; owner_email: string | null }, { updated: number }>((vars) =>
    request("/api/sales/orgs/owner", jsonBody(vars)),
  );
}

/**
 * Records the intent to reach out.
 *
 * The lead id travels in the variables rather than being bound when the hook is
 * created: this fires at the moment of the tap, before anything is "pending",
 * so a hook bound to the pending lead would post to an empty id.
 */
export function useOutreach() {
  return useSalesMutation<{ leadId: string; channel: OutreachChannel }, unknown>(({ leadId, channel }) =>
    request(`/api/sales/leads/${leadId}/outreach`, jsonBody({ channel })),
  );
}

export function useCompleteTask() {
  return useSalesMutation<{ taskId: string; note: string }, { task_id: string; lead_id: string; note_event_id: string }>(
    ({ taskId, note }) => request(`/api/sales/tasks/${encodeURIComponent(taskId)}/complete`, jsonBody({ note })),
  );
}

export function useResolveContactGap() {
  return useSalesMutation<
    { leadId: string; phone?: string; email?: string; provenance: string },
    { lead_id: string; event_id: string; task_id: string }
  >(({ leadId, ...body }) => request(`/api/sales/leads/${encodeURIComponent(leadId)}/contact`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
}

/** Every cached Today queue, whatever scope it was fetched under. */
const TODAY_PREFIX = ["sales", "today"] as const;

/**
 * Drop a lead from every cached Today queue, and hand back what was there.
 *
 * The scope is part of the query key — `salesKeys.today(scope)` is
 * `["sales","today", scope ?? "all"]` — so an optimistic write aimed at
 * `salesKeys.today()` patches the "all" entry and nothing else. On `שלי` the
 * live cache is keyed by the signed-in email, so the card the person just
 * answered for stayed on screen until the refetch settled: the one scope a
 * second salesperson works in was the one where the queue felt broken.
 * Matching on the prefix patches whichever scopes are cached.
 */
function dropFromTodayCaches(
  qc: ReturnType<typeof useQueryClient>,
  leadId: string,
): Array<[readonly unknown[], TodayPayload | undefined]> {
  const entries = qc.getQueriesData<TodayPayload>({ queryKey: TODAY_PREFIX });
  for (const [key, payload] of entries) {
    if (!payload) continue;
    qc.setQueryData<TodayPayload>(key, {
      ...payload,
      rows: payload.rows.filter((row) => row.lead_id !== leadId),
    });
  }
  return entries;
}

/** Put back exactly what `dropFromTodayCaches` found, key by key. */
function restoreTodayCaches(
  qc: ReturnType<typeof useQueryClient>,
  previous: Array<[readonly unknown[], TodayPayload | undefined]> | undefined,
): void {
  for (const [key, payload] of previous ?? []) {
    if (payload) qc.setQueryData(key, payload);
  }
}

export interface OutcomeVars {
  result: Exclude<OutcomeResult, "email_sent">;
  next_touch_at?: string | null;
  reason?: string | null;
}

export interface RecordActivityVars {
  request_id: string;
  source_task_id?: string;
  channel: OutreachChannel;
  result: "answered_progressing" | "no_answer" | "whatsapp_sent" | "email_sent";
  note?: string;
  primary_action?: { kind: "call" | "whatsapp" | "email" | "other" | "wait_review"; due_at: string };
  additional_actions?: Array<{ kind: "call" | "whatsapp" | "email" | "other" | "wait_review"; due_at: string }>;
}

/** Server transaction owns note, outcome, due action, task and retry identity. */
export function useRecordActivity(leadId: string) {
  return useSalesMutation<RecordActivityVars, { lead_id: string; outcome_event_id: string; task_ids: string[] }>(
    (vars) => request(`/api/sales/leads/${encodeURIComponent(leadId)}/activity`, jsonBody(vars)),
  );
}

/**
 * The outcome loop, optimistically applied: the card leaves the queue the
 * instant it is answered for, and comes back if the write fails. Tom is on a
 * phone between two other jobs — the queue must feel like it responded.
 */
export function useOutcome(leadId: string) {
  const qc = useQueryClient();
  return useMutation<
    unknown,
    SalesApiError,
    OutcomeVars,
    { previous: Array<[readonly unknown[], TodayPayload | undefined]> }
  >({
    mutationFn: (vars) => request(`/api/sales/leads/${leadId}/outcome`, jsonBody(vars)),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: TODAY_PREFIX });
      return { previous: dropFromTodayCaches(qc, leadId) };
    },
    onError: (_err, _vars, context) => {
      restoreTodayCaches(qc, context?.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: salesKeys.all });
    },
  });
}

export interface ConvertVars {
  document_number: string;
  amount?: number;
  currency?: string;
}

/**
 * A deal closed on the phone, on Green Invoice evidence.
 *
 * Not folded into useOutcome: `won` is evidence-only and record_outcome refuses
 * it, so this is a different endpoint over a different database function. It is
 * also NOT optimistic — a conversion is the one event nobody wants to see
 * celebrated and then withdrawn, and it stays in the queue afterwards as a
 * conversion rather than leaving it.
 */
export function useConvert(leadId: string) {
  return useSalesMutation<ConvertVars, { lead_id: string; converted: boolean }>(
    (vars) => request(`/api/sales/leads/${leadId}/convert`, jsonBody(vars)),
  );
}

export interface QuickAddVars {
  contact_name: string;
  phone?: string;
  business_name?: string;
  source_note?: string;
}

export function useQuickAdd() {
  return useSalesMutation<QuickAddVars, { lead_id: string; org_id: string; was_new: boolean }>(
    (vars) => request("/api/sales/quick-add", jsonBody(vars)),
  );
}

export function useSaveSettings() {
  return useSalesMutation<
    {
      sla_hours?: number;
      whatsapp_templates?: WhatsappTemplates;
      lost_reasons?: string[];
      queue?: QueueSettings;
      // No `assignees`: the roster is derived from private_core.app_users (D6)
      // and the endpoint no longer accepts one.
    },
    unknown
  >((vars) =>
    request("/api/sales/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(vars),
    }),
  );
}
