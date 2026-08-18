"use client";

// Data access for the sales workspace.
//
// Reads and writes go through the portal's one door: fetch → route handler →
// proxyRequest → Fastify. No Supabase client for data, ever.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { RULE_MESSAGES, UI } from "./labels";
import type {
  LeadEventRow,
  TodayPayload,
  OrgRow,
  OutcomeResult,
  OutreachChannel,
  SalesLeadRow,
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
  today: () => ["sales", "today"] as const,
  leads: () => ["sales", "leads"] as const,
  events: (leadId: string) => ["sales", "events", leadId] as const,
  orgs: () => ["sales", "orgs"] as const,
  weekStats: () => ["sales", "week-stats"] as const,
  settings: () => ["sales", "settings"] as const,
};

// ---- reads -----------------------------------------------------------------

/**
 * The queue, and the shape it was ordered by.
 *
 * The payload carries `queue` because the cap is a product decision the admin
 * owns (0326) and the rows arrive complete: the screen defers the remainder
 * and says how many, rather than the server hiding them and the count lying.
 */
export function useToday(): UseQueryResult<TodayPayload, SalesApiError> {
  return useQuery({
    queryKey: salesKeys.today(),
    queryFn: async () => await request<TodayPayload>("/api/sales/today"),
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

export function useOrgs(): UseQueryResult<OrgRow[], SalesApiError> {
  return useQuery({
    queryKey: salesKeys.orgs(),
    queryFn: async () => (await request<{ rows: OrgRow[] }>("/api/sales/orgs")).rows,
    staleTime: 30_000,
  });
}

export function useWeekStats(): UseQueryResult<WeekStats, SalesApiError> {
  return useQuery({
    queryKey: salesKeys.weekStats(),
    queryFn: async () => (await request<{ stats: WeekStats }>("/api/sales/week-stats")).stats,
    staleTime: 60_000,
  });
}

export function useSettings(): UseQueryResult<SalesSettings, SalesApiError> {
  return useQuery({
    queryKey: salesKeys.settings(),
    queryFn: async () => request<SalesSettings>("/api/sales/settings"),
    staleTime: 5 * 60_000,
  });
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

export function useSetNextTouch(leadId: string) {
  return useSalesMutation<{ at: string }, unknown>((vars) =>
    request(`/api/sales/leads/${leadId}/next-touch`, jsonBody(vars)),
  );
}

export function useAssign(leadId: string) {
  return useSalesMutation<{ assignee: string }, unknown>((vars) =>
    request(`/api/sales/leads/${leadId}/assign`, jsonBody(vars)),
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

export interface OutcomeVars {
  result: OutcomeResult;
  next_touch_at?: string | null;
  reason?: string | null;
}

/**
 * The outcome loop, optimistically applied: the card leaves the queue the
 * instant it is answered for, and comes back if the write fails. Tom is on a
 * phone between two other jobs — the queue must feel like it responded.
 */
export function useOutcome(leadId: string) {
  const qc = useQueryClient();
  return useMutation<unknown, SalesApiError, OutcomeVars, { previous?: TodayPayload }>({
    mutationFn: (vars) => request(`/api/sales/leads/${leadId}/outcome`, jsonBody(vars)),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: salesKeys.today() });
      const previous = qc.getQueryData<TodayPayload>(salesKeys.today());
      if (previous) {
        qc.setQueryData<TodayPayload>(salesKeys.today(), {
          ...previous,
          rows: previous.rows.filter((row) => row.lead_id !== leadId),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(salesKeys.today(), context.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: salesKeys.all });
    },
  });
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
    { sla_hours?: number; whatsapp_templates?: WhatsappTemplates },
    unknown
  >((vars) =>
    request("/api/sales/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(vars),
    }),
  );
}
