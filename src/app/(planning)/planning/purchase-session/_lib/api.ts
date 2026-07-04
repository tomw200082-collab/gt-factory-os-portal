"use client";

// Purchase Session — portal data layer (TanStack Query).
//
// One query (current session) + five mutations (start / edit / approve /
// place / skip). Every mutation invalidates the session query so the page
// always reflects server truth — no optimistic guessing.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CurrentSessionResponse,
  SessionEnvelope,
  PoEnvelope,
  LineEdit,
  LineAdd,
  PlaceLinePrice,
  SessionType,
} from "./types";

const SESSION_KEY = ["purchase-session", "current"];

async function jsonOrThrow(res: Response): Promise<unknown> {
  if (res.status === 401) {
    throw new Error("ההתחברות פגה — יש להתחבר מחדש.");
  }
  if (res.status === 503) {
    throw new Error("הכתיבה מושהית כעת (מצב break-glass). נסו שוב מאוחר יותר.");
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const b = body as { reason_code?: string; detail?: string; error?: string } | null;
    // DR-018 ux-release-gate FLOW-016 — the reason_code enum is an internal
    // English token; never show it, only the Hebrew detail/error/fallback.
    const msg = b?.detail ?? b?.error ?? `הבקשה נכשלה (${res.status})`;
    throw new Error(String(msg));
  }
  return body;
}

export function useCurrentSession() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: async (): Promise<CurrentSessionResponse> => {
      const res = await fetch("/api/purchase-session/current", { method: "GET" });
      return (await jsonOrThrow(res)) as CurrentSessionResponse;
    },
    staleTime: 30_000,
    retry: false,
  });
}

function usePurchaseMutation<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
  extraInvalidateKeys?: readonly (readonly string[])[],
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["purchase-session"] });
      // FLOW-C: a purchase session changes demand-coverage inputs the planning
      // overview summarises; refresh it so its freshness/coverage panels can't
      // lag after start / approve / skip.
      void qc.invalidateQueries({ queryKey: ["planning", "overview"] });
      for (const key of extraInvalidateKeys ?? []) {
        void qc.invalidateQueries({ queryKey: [...key] });
      }
    },
  });
}

export function useStartSession() {
  return usePurchaseMutation(
    // Tranche 065 (FLOW-PC02) — `supersede: true` rides along when the
    // planner explicitly confirmed replacing an open session. The current
    // backend ignores the extra field; the upcoming backend will require it
    // in that case (forward-compatible).
    async (args: {
      session_type: SessionType;
      supersede?: boolean;
    }): Promise<SessionEnvelope> => {
      const res = await fetch("/api/purchase-session/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          session_type: args.session_type,
          ...(args.supersede ? { supersede: true } : {}),
        }),
      });
      return (await jsonOrThrow(res)) as SessionEnvelope;
    },
  );
}

export function useEditPo() {
  return usePurchaseMutation(
    async (args: {
      poId: string;
      lines?: LineEdit[];
      add_lines?: LineAdd[];
    }): Promise<PoEnvelope> => {
      const res = await fetch(`/api/purchase-session/po/${args.poId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lines: args.lines, add_lines: args.add_lines }),
      });
      return (await jsonOrThrow(res)) as PoEnvelope;
    },
  );
}

export function useApprovePo() {
  return usePurchaseMutation(
    async (args: { poId: string }): Promise<PoEnvelope> => {
      const res = await fetch(`/api/purchase-session/po/${args.poId}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      return (await jsonOrThrow(res)) as PoEnvelope;
    },
  );
}

export function usePlacePo() {
  return usePurchaseMutation(
    async (args: {
      poId: string;
      expected_receive_date?: string;
      notes?: string;
      // Price Truth (Tranche 043) — additive, optional. Existing callers that
      // omit these are unchanged: JSON.stringify drops undefined keys, so the
      // strict backend schema never sees them.
      line_prices?: PlaceLinePrice[];
      confirm_price_update?: boolean;
    }): Promise<PoEnvelope> => {
      const res = await fetch(`/api/purchase-session/po/${args.poId}/place`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expected_receive_date: args.expected_receive_date,
          notes: args.notes,
          line_prices: args.line_prices,
          confirm_price_update: args.confirm_price_update,
        }),
      });
      return (await jsonOrThrow(res)) as PoEnvelope;
    },
    // Tranche 042 — a placed PO becomes visible to the PO list
    // (["planner","purchase-orders",…] in (po)/purchase-orders/page.tsx),
    // the PO detail surfaces (["purchase-orders",…]), and the goods-receipt
    // open-PO dropdown (["ops","receipts","open-pos"]). Invalidate all three
    // so they refresh without a manual reload.
    [
      ["planner", "purchase-orders"],
      ["purchase-orders"],
      ["ops", "receipts", "open-pos"],
    ],
  );
}

export function useSkipPo() {
  return usePurchaseMutation(
    async (args: { poId: string; skip_reason?: string }): Promise<PoEnvelope> => {
      const res = await fetch(`/api/purchase-session/po/${args.poId}/skip`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skip_reason: args.skip_reason }),
      });
      return (await jsonOrThrow(res)) as PoEnvelope;
    },
  );
}
