// Purchase Calendar — portal data layer.

"use client";

import { useQuery } from "@tanstack/react-query";

export type PoTier = "must" | "recommended" | "urgent";
export type PoStatus = "proposed" | "approved" | "placed" | "skipped";

export interface CalendarEntry {
  order_by_date: string;
  session_po_id: string;
  supplier_id: string;
  supplier_snapshot: string;
  tier: PoTier;
  status: PoStatus;
  total_cost: number;
  currency: string;
  line_count: number;
}
export interface CalendarResponse {
  session_id: string | null;
  entries: CalendarEntry[];
}

async function fetchCalendar(): Promise<CalendarResponse> {
  const res = await fetch("/api/purchase-session/calendar", { method: "GET" });
  if (res.status === 401) {
    throw new Error("ההתחברות פגה — יש להתחבר מחדש.");
  }
  if (!res.ok) {
    throw new Error("לא ניתן לטעון את לוח הרכש.");
  }
  return (await res.json()) as CalendarResponse;
}

export function usePurchaseCalendar() {
  return useQuery({
    queryKey: ["purchase-session", "calendar"],
    queryFn: fetchCalendar,
    staleTime: 30_000,
    retry: false,
  });
}
